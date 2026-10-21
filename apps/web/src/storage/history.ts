// 대화 기록은 폰(IndexedDB)에만 저장한다. 서버로 보내지 않는다 (규칙 4).
import type { EmotionCode } from "../emotion/types";

// IndexedDB 를 못 쓰는 경우(사생활 보호 모드 등)에는 이번 방문 동안만 메모리에 둔다.

export type Message = {
  id: string;
  role: "me" | "other";   // other = 청인 자막 (T11)
  text: string;
  at: number;             // 보낸 시각 (ms)
  result?: "done" | "fallback" | "failed";
  emotion?: { emotion: EmotionCode; intensity: number; tremor: number }; // 말풍선 색·아이콘, 대화 흐름(04 문서 3절)
};

export type HistoryStore = {
  list(): Promise<Message[]>;
  put(m: Message): Promise<void>;
  clear(): Promise<void>;
};

export const MAX_MESSAGES = 300;

export function memoryStore(): HistoryStore {
  let items: Message[] = [];
  return {
    async list() { return [...items].sort((a, b) => a.at - b.at).slice(-MAX_MESSAGES); },
    async put(m) {
      items = [...items.filter((x) => x.id !== m.id), m];
      if (items.length > MAX_MESSAGES) items = items.sort((a, b) => a.at - b.at).slice(-MAX_MESSAGES);
    },
    async clear() { items = []; },
  };
}

const DB = "itda";
const STORE = "messages";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function indexedDbStore(): HistoryStore {
  const db = open();
  const tx = async (mode: IDBTransactionMode) => (await db).transaction(STORE, mode).objectStore(STORE);
  return {
    async list() {
      const all = await done((await tx("readonly")).getAll() as IDBRequest<Message[]>);
      return all.sort((a, b) => a.at - b.at).slice(-MAX_MESSAGES);
    },
    async put(m) { await done((await tx("readwrite")).put(m)); },
    async clear() { await done((await tx("readwrite")).clear()); },
  };
}

/** IndexedDB 가 되면 그것을, 안 되면 메모리를 쓴다. 어떤 경우에도 화면이 멈추지 않게 */
export function createHistory(): HistoryStore {
  const memory = memoryStore();
  let real: HistoryStore | null = null;
  try {
    if (typeof indexedDB !== "undefined") real = indexedDbStore();
  } catch {
    real = null;
  }
  const safe = async <T>(fn: (s: HistoryStore) => Promise<T>): Promise<T> => {
    if (real) {
      try {
        return await fn(real);
      } catch {
        real = null; // 이번 방문은 메모리로
      }
    }
    return fn(memory);
  };
  return {
    list: () => safe((s) => s.list()),
    put: async (m) => { await memory.put(m); await safe((s) => s.put(m)); },
    clear: async () => { await memory.clear(); await safe((s) => s.clear()); },
  };
}

export const history = createHistory();
