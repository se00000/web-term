// 시연용 계정과 매장을 만듭니다. 비밀번호는 SEED_PASSWORD 환경변수에서 읽습니다 (저장소에 넣지 않음).
import { openDb, createTx } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 8) {
  console.error('SEED_PASSWORD 환경변수(8자 이상)를 설정한 뒤 실행하세요. 예: .env 파일');
  process.exit(1);
}

const db = openDb();
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('이미 데이터가 있어 시드를 건너뜁니다. 처음부터 하려면 npm run db:reset 후 다시 실행하세요.');
  process.exit(0);
}

const now = new Date().toISOString();
const users = [
  ['owner1@example.com', '김사장(국밥집)', 'OWNER'],
  ['owner2@example.com', '이사장(파스타)', 'OWNER'],
  ['guest1@example.com', '손님 민지', 'CUSTOMER'],
  ['guest2@example.com', '손님 준호', 'CUSTOMER'],
  ['guest3@example.com', '손님 서연', 'CUSTOMER'],
];
const stores = [
  [1, '든든국밥 본점', '전주시 덕진구 백제대로 567', 6, 1],
  [2, '파스타공방', '전주시 덕진구 명륜4길 12', 4, 1],
];

createTx(db)(() => {
  const insertUser = db.prepare(`INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const [email, name, role] of users) {
    const { salt, hash } = hashPassword(password);
    insertUser.run(email, name, role, salt, hash, now);
  }
  const insertStore = db.prepare(`INSERT INTO stores (owner_id, name, address, max_party, is_accepting, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const [ownerId, name, address, maxParty, accepting] of stores) insertStore.run(ownerId, name, address, maxParty, accepting, now);
});

console.log(`시드 완료: 계정 ${users.length}개, 매장 ${stores.length}개`);
for (const [email, , role] of users) console.log(`  ${role.padEnd(8)} ${email}`);
