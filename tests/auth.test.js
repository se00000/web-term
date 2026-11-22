import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, PASSWORD } from './helpers.js';

test('회원가입 후 로그인하면 토큰으로 내 정보를 조회할 수 있다', async t => {
  const f = await fixture(t);
  const signup = await f.request('/api/auth/signup', { method: 'POST', body: { email: 'Kim@Test.com', password: PASSWORD, name: '김' } });
  assert.equal(signup.status, 201);
  assert.equal(signup.data.role, 'CUSTOMER');
  assert.equal(signup.data.password_hash, undefined);

  const login = await f.request('/api/auth/login', { method: 'POST', body: { email: 'kim@test.com', password: PASSWORD } });
  assert.equal(login.status, 200);
  const me = await f.request('/api/me', { token: login.data.accessToken });
  assert.equal(me.data.email, 'kim@test.com');
});

test('비밀번호는 평문이 아닌 해시로 저장된다', async t => {
  const f = await fixture(t);
  await f.customer('hash');
  const row = f.db.prepare(`SELECT * FROM users WHERE email = 'hash@test.com'`).get();
  assert.notEqual(row.password_hash, PASSWORD);
  assert.match(row.password_hash, /^[0-9a-f]{128}$/);
});

test('같은 이메일로 두 번 가입하면 409', async t => {
  const f = await fixture(t);
  await f.customer('dup');
  const again = await f.request('/api/auth/signup', { method: 'POST', body: { email: 'DUP@test.com', password: PASSWORD, name: 'x' } });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'EMAIL_TAKEN');
});

test('잘못된 입력은 400, 틀린 비밀번호는 401', async t => {
  const f = await fixture(t);
  await f.customer('u1');
  const bad = await f.request('/api/auth/signup', { method: 'POST', body: { email: 'not-an-email', password: 'short', name: '' } });
  assert.equal(bad.status, 400);
  const wrong = await f.request('/api/auth/login', { method: 'POST', body: { email: 'u1@test.com', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
});

test('회원가입 요청에 role을 넣어 직원이 되려 하면 거절된다', async t => {
  const f = await fixture(t);
  const r = await f.request('/api/auth/signup', { method: 'POST', body: { email: 'evil@test.com', password: PASSWORD, name: 'x', role: 'STAFF' } });
  assert.equal(r.status, 400);
});

test('토큰 없이 또는 위조 토큰으로 인증 API를 호출하면 401', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/me')).status, 401);
  assert.equal((await f.request('/api/me', { token: 'abc.def.ghi' })).status, 401);
});
