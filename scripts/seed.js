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
// [사장님 id, 이름, 상세 주소, 시·도, 구·군, 음식 종류, 최대 인원, 접수 중 여부]
// 시연용 가상의 매장입니다.
const stores = [
  [1, '든든국밥 본점', '전주시 덕진구 백제대로 567', '전북', '덕진구', '한식', 6, 1],
  [1, '든든국밥 한옥마을점', '전주시 완산구 태조로 21', '전북', '완산구', '한식', 4, 1],
  [1, '덕진 숯불갈비', '전주시 덕진구 기린대로 410', '전북', '덕진구', '고기·구이', 8, 0],
  [2, '파스타공방', '전주시 덕진구 명륜4길 12', '전북', '덕진구', '양식', 4, 1],
  [2, '객사 스시바', '전주시 완산구 객사3길 7', '전북', '완산구', '일식', 4, 1],
  [2, '골목 떡볶이', '전주시 완산구 전라감영로 33', '전북', '완산구', '분식', 4, 1],
  [2, '연남 마라탕', '서울 마포구 동교로 200', '서울', '마포구', '아시안', 4, 1],
  [2, '성수 베이커리카페', '서울 성동구 연무장길 5', '서울', '성동구', '카페·디저트', 6, 1],
  [1, '해운대 횟집', '부산 해운대구 구남로 30', '부산', '해운대구', '해산물', 10, 1],
  [1, '서면 짜장명가', '부산 부산진구 중앙대로 700', '부산', '부산진구', '중식', 6, 1],
];

createTx(db)(() => {
  const insertUser = db.prepare(`INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const [email, name, role] of users) {
    const { salt, hash } = hashPassword(password);
    insertUser.run(email, name, role, salt, hash, now);
  }
  const insertStore = db.prepare(`INSERT INTO stores (owner_id, name, address, sido, district, category, max_party, is_accepting, created_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const s of stores) insertStore.run(...s, now);
});

console.log(`시드 완료: 계정 ${users.length}개, 매장 ${stores.length}개`);
for (const [email, , role] of users) console.log(`  ${role.padEnd(8)} ${email}`);
