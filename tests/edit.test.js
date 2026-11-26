import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';

const change = (f, token, id, partySize) =>
  f.request(`/api/waitings/${id}`, { token, method: 'PATCH', body: { partySize } });

test('인원 변경: 대기 중이면 본인이 바꿀 수 있고, 순번은 그대로다', async t => {
  const f = await fixture(t);
  const [a, b] = [await f.customer('ed-a'), await f.customer('ed-b')];
  await f.register(a.token);
  const w = (await f.register(b.token, 1, 2)).data;

  const r = await change(f, b.token, w.id, 4);
  assert.equal(r.status, 200);
  assert.equal(r.data.partySize, 4);
  assert.equal(r.data.ticketNo, w.ticketNo);   // 순번 유지
  assert.equal(r.data.aheadCount, 1);           // 앞 팀 수도 그대로
  assert.equal(f.row(w.id).party_size, 4);      // DB에 저장됨
});

test('인원 변경: 변경 이력이 남고, 같은 값으로 바꾸면 이력이 늘지 않는다', async t => {
  const f = await fixture(t);
  const c = await f.customer('ed-log');
  const w = (await f.register(c.token, 1, 2)).data;

  await change(f, c.token, w.id, 3);
  await change(f, c.token, w.id, 3); // 같은 값 반복 (중복 요청)
  assert.equal(f.count('SELECT COUNT(*) AS n FROM waiting_edits WHERE waiting_id = ?', w.id), 1);

  const hist = (await f.request(`/api/waitings/${w.id}/history`, { token: c.token })).data;
  const edit = hist.find(h => h.action === 'PARTY_SIZE');
  assert.deepEqual([edit.oldValue, edit.newValue], ['2', '3']);
});

test('인원 변경: 다른 손님이나 사장님은 바꿀 수 없다 (403, 데이터 유지)', async t => {
  const f = await fixture(t);
  const [owner, other] = [await f.customer('ed-own'), await f.customer('ed-oth')];
  const w = (await f.register(owner.token, 1, 2)).data;

  assert.equal((await change(f, other.token, w.id, 4)).status, 403);
  assert.equal((await change(f, f.ownerA, w.id, 4)).status, 403);
  assert.equal(f.row(w.id).party_size, 2);
});

test('인원 변경: 호출된 뒤나 종료된 뒤에는 바꿀 수 없다 (409)', async t => {
  const f = await fixture(t);
  const c = await f.customer('ed-called');
  const w = (await f.register(c.token, 1, 2)).data;

  await f.owner(f.ownerA, w.id, 'call');
  const called = await change(f, c.token, w.id, 3);
  assert.equal(called.status, 409);
  assert.match(called.data.message, /호출/);

  await f.owner(f.ownerA, w.id, 'seat');
  assert.equal((await change(f, c.token, w.id, 3)).status, 409);
  assert.equal(f.row(w.id).party_size, 2);
  assert.equal(f.count('SELECT COUNT(*) AS n FROM waiting_edits'), 0);
});

test('인원 변경: 0명, 매장 최대 인원 초과, 숫자가 아닌 값은 400', async t => {
  const f = await fixture(t);
  const c = await f.customer('ed-bad');
  const w = (await f.register(c.token, 1, 2)).data;

  assert.equal((await change(f, c.token, w.id, 0)).status, 400);
  assert.equal((await change(f, c.token, w.id, 5)).status, 400); // 매장A 최대 4명
  assert.equal((await change(f, c.token, w.id, '3')).status, 400);
  const extra = await f.request(`/api/waitings/${w.id}`, { token: c.token, method: 'PATCH', body: { partySize: 3, status: 'SEATED' } });
  assert.equal(extra.status, 400); // 인원 외 다른 값은 함께 바꿀 수 없음
  assert.equal(f.row(w.id).party_size, 2);
  assert.equal(f.row(w.id).status, 'WAITING');
});

test('인원 변경: 이력 저장이 실패하면 인원 변경도 되돌린다 (트랜잭션)', async t => {
  const f = await fixture(t);
  const c = await f.customer('ed-tx');
  const w = (await f.register(c.token, 1, 2)).data;

  f.db.exec(`CREATE TRIGGER fail_edit BEFORE INSERT ON waiting_edits BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  const r = await change(f, c.token, w.id, 4);
  assert.equal(r.status, 500);
  assert.equal(f.row(w.id).party_size, 2);
});
