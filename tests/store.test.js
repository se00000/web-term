import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';

test('매장 목록은 로그인 없이 조회되고 대기 팀 수가 보인다', async t => {
  const f = await fixture(t);
  const c = await f.customer('look');
  await f.register(c.token, 1);
  const r = await f.request('/api/stores');
  assert.equal(r.status, 200);
  assert.equal(r.data.find(s => s.id === 1).waitingCount, 1);
});

test('사장님은 매장을 등록·수정하고, 다른 사장님의 매장은 수정할 수 없다', async t => {
  const f = await fixture(t);
  const created = await f.request('/api/owner/stores', { token: f.ownerA, method: 'POST', body: { name: '새 매장', address: '주소', maxParty: 3 } });
  assert.equal(created.status, 201);
  assert.equal(created.data.isAccepting, false);

  const upd = await f.request(`/api/owner/stores/${created.data.id}`, { token: f.ownerA, method: 'PATCH', body: { name: '바뀐 이름' } });
  assert.equal(upd.data.name, '바뀐 이름');

  const other = await f.request(`/api/owner/stores/${created.data.id}`, { token: f.ownerB, method: 'PATCH', body: { name: '탈취' } });
  assert.equal(other.status, 403);
});

test('손님은 매장을 등록할 수 없다', async t => {
  const f = await fixture(t);
  const c = await f.customer('notowner');
  const r = await f.request('/api/owner/stores', { token: c.token, method: 'POST', body: { name: 'x', address: 'y', maxParty: 2 } });
  assert.equal(r.status, 403);
});

test('매장 삭제는 비활성화로 처리되고, 진행 중 웨이팅이 있으면 거절된다', async t => {
  const f = await fixture(t);
  const c = await f.customer('busy');
  await f.register(c.token, 1);

  const blocked = await f.request('/api/owner/stores/1', { token: f.ownerA, method: 'DELETE' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'HAS_ACTIVE_WAITINGS');

  await f.request('/api/owner/stores/1/close-day', { token: f.ownerA, method: 'POST', body: {} });
  const ok = await f.request('/api/owner/stores/1', { token: f.ownerA, method: 'DELETE' });
  assert.equal(ok.status, 200);
  // 행은 남아 있어 이력이 보존되지만, 공개 목록에서는 사라진다
  assert.equal(f.count('SELECT COUNT(*) AS n FROM stores WHERE id = 1'), 1);
  assert.equal((await f.request('/api/stores')).data.some(s => s.id === 1), false);
});
