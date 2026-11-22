// DB 파일을 삭제합니다. 서버를 끈 상태에서 실행하세요. 다음 실행 때 빈 스키마가 새로 만들어집니다.
import { rmSync, existsSync } from 'node:fs';
import { defaultDbPath } from '../src/db.js';

const path = process.env.DB_PATH || defaultDbPath;
if (!process.argv.includes('--yes')) {
  console.log(`삭제 대상: ${path}\n정말 삭제하려면 npm run db:reset -- --yes`);
  process.exit(0);
}
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(path + suffix)) rmSync(path + suffix);
}
console.log(`삭제했습니다: ${path}`);
