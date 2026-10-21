import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 개발 중에는 /api 를 내 컴퓨터의 API 서버로 넘긴다 (폰에서 시험할 때 주소 하나로 충분)
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
