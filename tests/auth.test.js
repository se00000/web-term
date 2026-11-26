import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, PASSWORD } from './helpers.js';

test('손님 가입 → 손님 로그인 → 토큰으로 내 정보 조회', async t => {
  const f = await fixture(t);
  const signup = await f.signup('customer', 'Kim@Test.com', '김');
  assert.equal(signup.status, 201);
  assert.equal(signup.data.role, 'CUSTOMER');
  assert.equal(signup.data.password_hash, undefined);

  const login = await f.login('customer', 'kim@test.com');
  assert.equal(login.status, 200);
  const me = await f.request('/api/me', { token: login.data.accessToken });
  assert.equal(me.data.email, 'kim@test.com');
  assert.equal(me.data.role, 'CUSTOMER');
});

test('사장님 가입 → 사장님 로그인 → 매장 관리 API 사용 가능', async t => {
  const f = await fixture(t);
  const signup = await f.signup('owner', 'boss@test.com', '박사장');
  assert.equal(signup.status, 201);
  assert.equal(signup.data.role, 'OWNER');

  const login = await f.login('owner', 'boss@test.com');
  assert.equal(login.status, 200);
  const mine = await f.request('/api/owner/stores', { token: login.data.accessToken });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.data, []);
});

test('로그인 분리: 손님 계정으로 사장님 로그인, 사장님 계정으로 손님 로그인은 거절된다', async t => {
  const f = await fixture(t);
  await f.customer('guest');

  const ownerLoginByGuest = await f.login('owner', 'guest@test.com');
  assert.equal(ownerLoginByGuest.status, 403);
  assert.equal(ownerLoginByGuest.data.code, 'WRONG_ACCOUNT_TYPE');
  assert.equal(ownerLoginByGuest.data.accessToken, undefined);

  const customerLoginByOwner = await f.login('customer', 'owner-a@test.com');
  assert.equal(customerLoginByOwner.status, 403);
  assert.equal(customerLoginByOwner.data.code, 'WRONG_ACCOUNT_TYPE');
  assert.equal(customerLoginByOwner.data.accessToken, undefined);
});

test('로그인 분리: 비밀번호가 틀리면 계정 종류와 상관없이 401만 응답한다 (계정 종류 노출 방지)', async t => {
  const f = await fixture(t);
  await f.customer('quiet');
  const r = await f.login('owner', 'quiet@test.com', 'wrong-password');
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'INVALID_CREDENTIALS');
});

test('비밀번호는 평문이 아닌 해시로 저장된다', async t => {
  const f = await fixture(t);
  await f.customer('hash');
  const row = f.db.prepare(`SELECT * FROM users WHERE email = 'hash@test.com'`).get();
  assert.notEqual(row.password_hash, PASSWORD);
  assert.match(row.password_hash, /^[0-9a-f]{128}$/);
});

test('같은 이메일은 계정 종류가 달라도 두 번 가입할 수 없다 (409)', async t => {
  const f = await fixture(t);
  await f.customer('dup');
  const sameType = await f.signup('customer', 'DUP@test.com', 'x');
  assert.equal(sameType.status, 409);
  assert.equal(sameType.data.code, 'EMAIL_TAKEN');
  const otherType = await f.signup('owner', 'dup@test.com', 'x');
  assert.equal(otherType.status, 409);
});

test('잘못된 입력은 400, 틀린 비밀번호는 401', async t => {
  const f = await fixture(t);
  await f.customer('u1');
  const bad = await f.request('/api/auth/customer/signup', { method: 'POST', body: { email: 'not-an-email', password: 'short', name: '' } });
  assert.equal(bad.status, 400);
  const wrong = await f.login('customer', 'u1@test.com', 'wrong-password');
  assert.equal(wrong.status, 401);
});

test('손님 가입 요청 본문에 role을 넣어 사장님이 되려 하면 거절된다', async t => {
  const f = await fixture(t);
  const r = await f.request('/api/auth/customer/signup', { method: 'POST', body: { email: 'evil@test.com', password: PASSWORD, name: 'x', role: 'OWNER' } });
  assert.equal(r.status, 400);
  assert.equal(f.count(`SELECT COUNT(*) AS n FROM users WHERE email = 'evil@test.com'`), 0);
});

test('예전 공용 로그인 경로는 없다 (404)', async t => {
  const f = await fixture(t);
  const r = await f.request('/api/auth/login', { method: 'POST', body: { email: 'owner-a@test.com', password: PASSWORD } });
  assert.equal(r.status, 404);
});

test('토큰 없이 또는 위조 토큰으로 인증 API를 호출하면 401', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/me')).status, 401);
  assert.equal((await f.request('/api/me', { token: 'abc.def.ghi' })).status, 401);
});
