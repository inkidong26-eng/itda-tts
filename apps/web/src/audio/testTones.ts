// 시험 페이지용 소리 파일을 폰 안에서 만든다 (서버·GPU 없이 재생 큐를 시험하려고)

export function toneUrl(freq: number, seconds: number, amp = 0.3, rate = 24000): string {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 600, (n - i) / 600); // 딸깍 소리 없게
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * fade * 32767), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
