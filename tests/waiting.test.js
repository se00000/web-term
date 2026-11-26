import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';

// ───────── 정상 흐름 ─────────

test('정상 흐름: 등록 → 호출 → 입장, 이력이 순서대로 남는다', async t => {
  const f = await fixture(t);
  const c = await f.customer('kim');
  const reg = await f.register(c.token);
  assert.equal(reg.status, 201);
  assert.equal(reg.data.ticketNo, 1);
  assert.equal(reg.data.status, 'WAITING');

  assert.equal((await f.owner(f.ownerA, reg.data.id, 'call')).data.status, 'CALLED');
  assert.equal((await f.owner(f.ownerA, reg.data.id, 'seat')).data.status, 'SEATED');

  const hist = await f.request(`/api/waitings/${reg.data.id}/history`, { token: c.token });
  assert.deepEqual(hist.data.map(h => h.action), ['REGISTER', 'CALL', 'SEAT']);
  // 새로고침에 해당: 다시 조회해도 저장된 상태가 보인다
  assert.equal((await f.request('/api/me/waiting', { token: c.token })).data.waiting.status, 'SEATED');
});

test('내 앞 대기 팀 수가 정확히 계산된다', async t => {
  const f = await fixture(t);
  const [a, b, c] = [await f.customer('a'), await f.customer('b'), await f.customer('c')];
  const ra = await f.register(a.token);
  await f.register(b.token);
  await f.register(c.token);
  assert.equal((await f.request('/api/me/waiting', { token: c.token })).data.waiting.aheadCount, 2);
  await f.cancel(a.token, ra.data.id);
  assert.equal((await f.request('/api/me/waiting', { token: c.token })).data.waiting.aheadCount, 1);
});

// ───────── 선착순 · 중복 ─────────

test('선착순: 20명이 동시에 등록해도 순번 1~20이 빠짐없이, 겹치지 않게 발급된다', async t => {
  const f = await fixture(t);
  const customers = [];
  for (let i = 0; i < 20; i++) customers.push(await f.customer(`p${i}`));

  const results = await Promise.all(customers.map(c => f.register(c.token)));
  assert.ok(results.every(r => r.status === 201));
  const tickets = results.map(r => r.data.ticketNo).sort((x, y) => x - y);
  assert.deepEqual(tickets, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(f.count(`SELECT COUNT(DISTINCT ticket_no) AS n FROM waitings WHERE store_id = 1`), 20);
});

test('중복 요청: 같은 손님이 등록을 연속 5번 보내도 1건만 저장된다', async t => {
  const f = await fixture(t);
  const c = await f.customer('spam');
  const results = await Promise.all(Array.from({ length: 5 }, () => f.register(c.token)));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.ok(results.filter(r => r.status !== 201).every(r => r.status === 409 && r.data.code === 'ALREADY_WAITING'));
  assert.equal(f.count('SELECT COUNT(*) AS n FROM waitings WHERE user_id = ?', c.id), 1);
});

test('한 사람은 동시에 한 매장만: 다른 매장 등록도 거절된다', async t => {
  const f = await fixture(t);
  const c = await f.customer('two');
  await f.register(c.token, 1);
  const other = await f.register(c.token, 2);
  assert.equal(other.status, 409);
  assert.equal(other.data.code, 'ALREADY_WAITING');
});

test('취소하면 다시 등록할 수 있고, 순번은 재사용되지 않는다', async t => {
  const f = await fixture(t);
  const c = await f.customer('again');
  const first = await f.register(c.token);
  await f.cancel(c.token, first.data.id);
  const second = await f.register(c.token);
  assert.equal(second.status, 201);
  assert.equal(second.data.ticketNo, 2);
});

test('DB 최종 방어선: 서버 검사를 우회해 활성 웨이팅을 두 개 넣으려 해도 유니크 인덱스가 막는다', async t => {
  const f = await fixture(t);
  const c = await f.customer('raw');
  await f.register(c.token);
  assert.throws(() => f.db.prepare(
    `INSERT INTO waitings (store_id, user_id, service_date, ticket_no, party_size, status, created_at)
     VALUES (2, ?, '2026-12-01', 1, 2, 'WAITING', 'x')`).run(c.id), /UNIQUE/);
});

// ───────── 입력 · 상태 오류 ─────────

test('잘못된 인원(0명, 매장 최대 초과, 문자열)은 400', async t => {
  const f = await fixture(t);
  const c = await f.customer('size');
  assert.equal((await f.register(c.token, 1, 0)).status, 400);
  assert.equal((await f.register(c.token, 1, 5)).status, 400); // 매장A 최대 4명
  assert.equal((await f.request('/api/stores/1/waitings', { token: c.token, method: 'POST', body: { partySize: '2' } })).status, 400);
  assert.equal(f.count('SELECT COUNT(*) AS n FROM waitings'), 0);
});

test('접수 마감한 매장에는 등록할 수 없다', async t => {
  const f = await fixture(t);
  await f.request('/api/owner/stores/1', { token: f.ownerA, method: 'PATCH', body: { isAccepting: false } });
  const c = await f.customer('late');
  const r = await f.register(c.token);
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'NOT_ACCEPTING');
});

test('종료된(입장 완료) 웨이팅은 취소·호출할 수 없다', async t => {
  const f = await fixture(t);
  const c = await f.customer('done');
  const w = (await f.register(c.token)).data;
  await f.owner(f.ownerA, w.id, 'call');
  await f.owner(f.ownerA, w.id, 'seat');
  assert.equal((await f.cancel(c.token, w.id)).status, 409);
  assert.equal((await f.owner(f.ownerA, w.id, 'call')).status, 409);
  assert.equal(f.row(w.id).status, 'SEATED');
});

test('호출되지 않은 웨이팅은 입장·노쇼 처리할 수 없다', async t => {
  const f = await fixture(t);
  const c = await f.customer('notcalled');
  const w = (await f.register(c.token)).data;
  assert.equal((await f.owner(f.ownerA, w.id, 'seat')).status, 409);
  assert.equal((await f.owner(f.ownerA, w.id, 'no-show')).status, 409);
  assert.equal(f.row(w.id).status, 'WAITING');
});

test('선착순 호출: 맨 앞이 아닌 손님을 먼저 호출하면 거절된다', async t => {
  const f = await fixture(t);
  const [a, b] = [await f.customer('first'), await f.customer('second')];
  await f.register(a.token);
  const wb = (await f.register(b.token)).data;
  const r = await f.owner(f.ownerA, wb.id, 'call');
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'NOT_FIRST_IN_LINE');
  assert.equal(f.row(wb.id).status, 'WAITING');
});

// ───────── 권한 ─────────

test('권한: 다른 손님의 웨이팅은 취소할 수 없다', async t => {
  const f = await fixture(t);
  const [owner, other] = [await f.customer('owner'), await f.customer('other')];
  const w = (await f.register(owner.token)).data;
  const r = await f.cancel(other.token, w.id);
  assert.equal(r.status, 403);
  assert.equal(f.row(w.id).status, 'WAITING');
});

test('권한: 손님은 호출할 수 없고, 다른 사장님도 호출할 수 없다', async t => {
  const f = await fixture(t);
  const c = await f.customer('guest');
  const w = (await f.register(c.token, 1)).data;
  assert.equal((await f.owner(c.token, w.id, 'call')).status, 403);
  assert.equal((await f.owner(f.ownerB, w.id, 'call')).status, 403);
  assert.equal((await f.request('/api/owner/stores/1/waitings', { token: f.ownerB })).status, 403);
  assert.equal(f.row(w.id).status, 'WAITING');
});

test('권한: 사장님 계정은 손님용 웨이팅 등록을 할 수 없다', async t => {
  const f = await fixture(t);
  assert.equal((await f.register(f.ownerA)).status, 403);
});

// ───────── 노쇼 · 트랜잭션 ─────────

test('노쇼: 호출 후 10분이 안 됐으면 거절, 지나면 처리되고 다음 순번이 자동 호출된다', async t => {
  const f = await fixture(t);
  const [a, b] = [await f.customer('ns-a'), await f.customer('ns-b')];
  const wa = (await f.register(a.token)).data;
  const wb = (await f.register(b.token)).data;
  await f.owner(f.ownerA, wa.id, 'call');

  f.clock.advance(9);
  const early = await f.owner(f.ownerA, wa.id, 'no-show');
  assert.equal(early.status, 409);
  assert.equal(early.data.code, 'CALL_NOT_EXPIRED');

  f.clock.advance(1);
  const r = await f.owner(f.ownerA, wa.id, 'no-show');
  assert.equal(r.status, 200);
  assert.equal(r.data.waiting.status, 'NO_SHOW');
  assert.equal(r.data.nextCalled.id, wb.id);
  assert.equal(f.row(wb.id).status, 'CALLED');
});

test('노쇼 2회 누적 시 7일간 등록 제한, 7일 후 다시 가능', async t => {
  const f = await fixture(t);
  const c = await f.customer('noshow');
  for (let i = 0; i < 2; i++) {
    const w = (await f.register(c.token)).data;
    await f.owner(f.ownerA, w.id, 'call');
    f.clock.advance(10);
    await f.owner(f.ownerA, w.id, 'no-show');
  }
  const blocked = await f.register(c.token);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'PENALTY_ACTIVE');

  f.clock.advance(7 * 24 * 60);
  assert.equal((await f.register(c.token)).status, 201);
});

test('트랜잭션: 노쇼 처리 중 다음 순번 호출이 실패하면 노쇼 처리까지 모두 되돌린다', async t => {
  const f = await fixture(t);
  const [a, b] = [await f.customer('tx-a'), await f.customer('tx-b')];
  const wa = (await f.register(a.token)).data;
  const wb = (await f.register(b.token)).data;
  await f.owner(f.ownerA, wa.id, 'call');
  f.clock.advance(10);

  // 자동 호출 이력 저장 단계에서 강제로 실패하게 만든다
  f.db.exec(`CREATE TRIGGER fail_auto_call BEFORE INSERT ON waiting_logs WHEN NEW.action = 'AUTO_CALL'
             BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  const logsBefore = f.count('SELECT COUNT(*) AS n FROM waiting_logs');

  const r = await f.owner(f.ownerA, wa.id, 'no-show');
  assert.equal(r.status, 500);
  assert.equal(f.row(wa.id).status, 'CALLED');   // 노쇼로 바뀌지 않음
  assert.equal(f.row(wb.id).status, 'WAITING');  // 다음 순번도 그대로
  assert.equal(f.count('SELECT COUNT(*) AS n FROM waiting_logs'), logsBefore);

  f.db.exec('DROP TRIGGER fail_auto_call');
  assert.equal((await f.owner(f.ownerA, wa.id, 'no-show')).status, 200); // 원인 제거 후 재시도 성공
});

test('영업 종료: 접수가 닫히고 남은 웨이팅이 한 번에 종료된다', async t => {
  const f = await fixture(t);
  const [a, b] = [await f.customer('close-a'), await f.customer('close-b')];
  const wa = (await f.register(a.token)).data;
  await f.register(b.token);
  await f.owner(f.ownerA, wa.id, 'call');

  const r = await f.request('/api/owner/stores/1/close-day', { token: f.ownerA, method: 'POST', body: {} });
  assert.equal(r.data.closedCount, 2);
  assert.equal(f.count(`SELECT COUNT(*) AS n FROM waitings WHERE status IN ('WAITING','CALLED')`), 0);
  assert.equal((await f.register(a.token)).data.code, 'NOT_ACCEPTING');
});

test('지난 영업일에 남은 웨이팅은 다음 날 등록 시 자동 만료된다', async t => {
  const f = await fixture(t);
  const c = await f.customer('yesterday');
  const old = (await f.register(c.token)).data;
  f.clock.advance(24 * 60);
  const r = await f.register(c.token);
  assert.equal(r.status, 201);
  assert.equal(r.data.ticketNo, 1); // 날짜가 바뀌면 순번도 1부터
  assert.equal(f.row(old.id).status, 'CANCELLED');
});
