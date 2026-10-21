// 서버 요청은 동시에 보내되, 재생 큐에는 "보낸 순서대로" 넣기 위한 줄 세우기.
// 예) 1번 문장이 3초, 2번 문장이 0.1초(캐시) 만에 답해도 1번 → 2번 순서로 말한다.

export function createOrdered() {
  let tail: Promise<void> = Promise.resolve();
  return function inOrder<T>(work: Promise<T>, then: (value: T) => void): Promise<void> {
    work.catch(() => undefined); // 차례가 오기 전에 실패해도 '처리 안 된 오류' 경고가 나지 않게
    const step = tail.then(() => work).then(then);
    tail = step.catch(() => undefined); // 한 개가 실패해도 다음 차례는 계속
    return step;
  };
}
