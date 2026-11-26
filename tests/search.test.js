import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers.js';
import { openDb } from '../src/db.js';

/** 검색용 매장 추가 (사장님 A 소유, 접수 중) */
function addStores(f, rows) {
  const ins = f.db.prepare(`INSERT INTO stores (owner_id, name, address, sido, district, category, max_party, is_accepting, created_at)
                            VALUES (1, ?, ?, ?, ?, ?, 4, 1, '2026-12-01T00:00:00Z')`);
  for (const r of rows) ins.run(...r);
}

const SAMPLE = [
  ['전주콩나물국밥', '전북 전주시 덕진구 1', '전북', '덕진구', '한식'],
  ['덕진짬뽕', '전북 전주시 덕진구 2', '전북', '덕진구', '중식'],
  ['완산스시', '전북 전주시 완산구 3', '전북', '완산구', '일식'],
  ['강남국밥', '서울 강남구 4', '서울', '강남구', '한식'],
  ['100%수제버거', '서울 마포구 5', '서울', '마포구', '패스트푸드'],
];

test('지역으로 찾기: 시·도, 시·도+구·군으로 거를 수 있다', async t => {
  const f = await fixture(t);
  addStores(f, SAMPLE);
  const jb = await f.request(`/api/stores?sido=${encodeURIComponent('전북')}`);
  assert.equal(jb.status, 200);
  // 픽스처의 매장A·B(기본값 전북)도 포함
  assert.ok(jb.data.every(s => s.sido === '전북'));
  assert.equal(jb.data.length, 5);

  const deokjin = await f.request(`/api/stores?sido=${encodeURIComponent('전북')}&district=${encodeURIComponent('덕진구')}`);
  assert.deepEqual(deokjin.data.map(s => s.name).sort(), ['덕진짬뽕', '전주콩나물국밥']);
});

test('음식 종류로 찾기: 종류만, 또는 지역과 함께 거를 수 있다', async t => {
  const f = await fixture(t);
  addStores(f, SAMPLE);
  const korean = await f.request(`/api/stores?category=${encodeURIComponent('한식')}`);
  assert.deepEqual(korean.data.map(s => s.name).sort(), ['강남국밥', '전주콩나물국밥']);

  const seoulKorean = await f.request(`/api/stores?category=${encodeURIComponent('한식')}&sido=${encodeURIComponent('서울')}`);
  assert.deepEqual(seoulKorean.data.map(s => s.name), ['강남국밥']);
});

test('검색어는 이름·주소에서 찾고, %·_ 같은 특수문자는 글자 그대로 취급한다', async t => {
  const f = await fixture(t);
  addStores(f, SAMPLE);
  const gukbap = await f.request(`/api/stores?q=${encodeURIComponent('국밥')}`);
  assert.equal(gukbap.data.length, 2);
  const percent = await f.request(`/api/stores?q=${encodeURIComponent('100%')}`);
  assert.deepEqual(percent.data.map(s => s.name), ['100%수제버거']);
  const wildcard = await f.request(`/api/stores?q=${encodeURIComponent('%')}`);
  assert.deepEqual(wildcard.data.map(s => s.name), ['100%수제버거']); // 전체가 나오면 안 됨
});

test('목록에 없는 지역·음식 종류, 지원하지 않는 조건은 400', async t => {
  const f = await fixture(t);
  assert.equal((await f.request(`/api/stores?category=${encodeURIComponent('피자')}`)).status, 400);
  assert.equal((await f.request(`/api/stores?sido=${encodeURIComponent('도쿄')}`)).status, 400);
  assert.equal((await f.request('/api/stores?sort=name')).status, 400);
});

test('메뉴용 목록은 모든 지역·음식 종류를 매장 수와 함께 주고, 닫은 매장은 세지 않는다', async t => {
  const f = await fixture(t);
  addStores(f, SAMPLE);
  f.db.prepare(`UPDATE stores SET is_active = 0 WHERE name = '강남국밥'`).run();

  const c = (await f.request('/api/catalog')).data;
  assert.equal(c.sidos.length, 17);
  assert.equal(c.categories.length, 12);
  assert.equal(c.sidos.find(s => s.name === '서울').count, 1);   // 강남국밥은 닫힘
  assert.equal(c.sidos.find(s => s.name === '제주').count, 0);   // 0개도 포함
  assert.equal(c.categories.find(x => x.name === '한식').count, 1);
  assert.deepEqual(c.districts['전북'].map(d => d.name), ['덕진구', '완산구']);
});

test('매장 등록 시 지역·음식 종류는 필수이며 목록에 있는 값만 허용된다', async t => {
  const f = await fixture(t);
  const base = { name: '새집', address: '주소', sido: '전북', district: '덕진구', category: '한식', maxParty: 4 };
  const post = body => f.request('/api/owner/stores', { token: f.ownerA, method: 'POST', body });

  assert.equal((await post({ ...base, category: '피자' })).status, 400);
  assert.equal((await post({ ...base, sido: '전라북도' })).status, 400);
  const { category, ...noCategory } = base;
  assert.equal((await post(noCategory)).status, 400);

  const ok = await post(base);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.category, '한식');

  const moved = await f.request(`/api/owner/stores/${ok.data.id}`, { token: f.ownerA, method: 'PATCH', body: { sido: '서울', district: '종로구', category: '분식' } });
  assert.equal(moved.data.sido, '서울');
  assert.equal(moved.data.category, '분식');
});

test('지역·음식 종류 컬럼이 없던 예전 DB도 열 때 자동으로 컬럼이 추가된다', t => {
  const dir = mkdtempSync(join(tmpdir(), 'waiting-migrate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'old.sqlite');

  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, salt TEXT, password_hash TEXT, penalty_until TEXT, created_at TEXT);
            CREATE TABLE stores (id INTEGER PRIMARY KEY, owner_id INTEGER, name TEXT, address TEXT, max_party INTEGER,
                                 is_accepting INTEGER, is_active INTEGER, created_at TEXT);
            INSERT INTO users VALUES (1, 'a@a.a', 'a', 'OWNER', 's', 'h', NULL, 'x');
            INSERT INTO stores VALUES (1, 1, '옛 매장', '주소', 4, 1, 1, 'x');`);
  old.close();

  const db = openDb(path);
  const row = db.prepare('SELECT * FROM stores WHERE id = 1').get();
  assert.equal(row.name, '옛 매장');
  assert.equal(row.sido, '전북');
  assert.equal(row.category, '기타');
  db.close();
});
