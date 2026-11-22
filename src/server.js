import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { createApp } from './app.js';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error(`Node.js 24.x가 필요합니다. 현재 버전: ${process.version}`);
  process.exit(1);
}

let secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET 환경변수가 필요합니다. .env.example을 참고하세요.');
    process.exit(1);
  }
  secret = randomBytes(48).toString('hex');
  console.warn('[경고] JWT_SECRET이 없어 임시 키를 사용합니다. 서버를 다시 켜면 다시 로그인해야 합니다.');
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const db = openDb();
createApp({ db, secret }).listen(port, host, () => {
  console.log(`웨이팅 서비스 실행 중: http://${host}:${port}`);
});
