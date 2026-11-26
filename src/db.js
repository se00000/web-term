import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, SIDOS, sqlIn } from './catalog.js';

export const defaultDbPath = fileURLToPath(new URL('../data/app.sqlite', import.meta.url));

export const WAITING_STATUSES = ['WAITING', 'CALLED', 'SEATED', 'CANCELLED', 'NO_SHOW'];
export const ACTIVE_STATUSES = ['WAITING', 'CALLED'];
const statusCheck = `IN (${WAITING_STATUSES.map(s => `'${s}'`).join(',')})`;

// 지역·음식 종류 컬럼. 이 컬럼이 생기기 전에 만든 DB에는 openDb가 ALTER TABLE로 추가합니다.
const STORE_EXTRA_COLUMNS = [
  ['sido', `TEXT NOT NULL DEFAULT '전북' CHECK (sido ${sqlIn(SIDOS)})`],
  ['district', `TEXT NOT NULL DEFAULT ''`],
  ['category', `TEXT NOT NULL DEFAULT '기타' CHECK (category ${sqlIn(CATEGORIES)})`],
];

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('CUSTOMER','OWNER')),
  salt          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  penalty_until TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id           INTEGER PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  address      TEXT NOT NULL,
  max_party    INTEGER NOT NULL CHECK (max_party BETWEEN 1 AND 20),
  is_accepting INTEGER NOT NULL DEFAULT 0 CHECK (is_accepting IN (0,1)),
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at   TEXT NOT NULL,
  ${STORE_EXTRA_COLUMNS.map(([name, def]) => `${name} ${def}`).join(',\n  ')}
);

CREATE INDEX IF NOT EXISTS ix_stores_region   ON stores(sido, district);
CREATE INDEX IF NOT EXISTS ix_stores_category ON stores(category);

CREATE TABLE IF NOT EXISTS waitings (
  id           INTEGER PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  service_date TEXT NOT NULL,
  ticket_no    INTEGER NOT NULL CHECK (ticket_no > 0),
  party_size   INTEGER NOT NULL CHECK (party_size > 0),
  status       TEXT NOT NULL CHECK (status ${statusCheck}),
  created_at   TEXT NOT NULL,
  called_at    TEXT,
  finished_at  TEXT,
  -- 같은 매장·같은 날 순번은 겹칠 수 없습니다.
  UNIQUE (store_id, service_date, ticket_no)
);

-- 한 사람은 진행 중(WAITING/CALLED) 웨이팅을 하나만 가질 수 있습니다.
-- 서버 검사가 1차 방어, 이 인덱스가 최종 방어입니다.
CREATE UNIQUE INDEX IF NOT EXISTS ux_waitings_one_active_per_user
  ON waitings(user_id) WHERE status IN ('WAITING','CALLED');

CREATE INDEX IF NOT EXISTS ix_waitings_store_date ON waitings(store_id, service_date, status, ticket_no);

CREATE TABLE IF NOT EXISTS waiting_logs (
  id          INTEGER PRIMARY KEY,
  waiting_id  INTEGER NOT NULL REFERENCES waitings(id),
  actor_id    INTEGER REFERENCES users(id),   -- NULL = 시스템 처리
  action      TEXT NOT NULL CHECK (action IN ('REGISTER','CANCEL','CALL','AUTO_CALL','SEAT','NO_SHOW','CLOSE','EXPIRE')),
  from_status TEXT CHECK (from_status ${statusCheck}),
  to_status   TEXT NOT NULL CHECK (to_status ${statusCheck}),
  created_at  TEXT NOT NULL
);
`;

export function openDb(path = process.env.DB_PATH || defaultDbPath) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  migrateStores(db);
  db.exec(schema);
  return db;
}

/** 예전 스키마의 stores 테이블에 없는 컬럼을 추가합니다. (테이블이 아직 없으면 아무것도 하지 않음) */
function migrateStores(db) {
  const cols = db.prepare('PRAGMA table_info(stores)').all().map(c => c.name);
  if (cols.length === 0) return;
  for (const [name, def] of STORE_EXTRA_COLUMNS) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE stores ADD COLUMN ${name} ${def}`);
  }
}

/**
 * fn 안의 모든 변경을 하나의 트랜잭션으로 묶습니다.
 * BEGIN IMMEDIATE로 시작해 쓰기 잠금을 먼저 잡으므로, 검사와 저장 사이에 다른 요청이 끼어들지 못합니다.
 * fn이 예외를 던지면 전부 되돌립니다.
 */
export function createTx(db) {
  return function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}
