import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 /api 요청을 Express 서버(3000)로 넘깁니다.
// 배포 시에는 Express가 빌드 결과(dist)를 직접 서빙하므로 같은 주소에서 /api를 호출합니다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
