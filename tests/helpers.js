import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

export const PASSWORD = 'test-password-1';

/**
 * 테스트마다 새 임시 DB와 서버를 띄웁니다.
 * 시계(clock)는 고정값에서 시작하고 advance(분)로 앞당길 수 있습니다.
 * 준비 데이터: 직원 2명(staffA·staffB), 매장 2개(A·B 소유), 손님은 customer(name)으로 가입.
 */
export async function fixture(t, { start = '2026-12-01T03:00:00Z' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'waiting-test-'));
  const db = openDb(join(dir, 'test.sqlite'));
  let current = new Date(start);
  const clock = { now: () => current, advance: min => { current = new Date(current.getTime() + min * 60_000); } };

  const server = createApp({ db, secret: randomBytes(48).toString('hex'), now: clock.now }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(r => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function request(path, { token, method = 'GET', body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  }

  const login = async email => (await request('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).data.accessToken;

  // 직원 계정은 회원가입 API로 만들 수 없으므로 DB에 직접 넣습니다.
  const at = current.toISOString();
  for (const email of ['staff-a@test.com', 'staff-b@test.com']) {
    const { salt, hash } = hashPassword(PASSWORD);
    db.prepare(`INSERT INTO users (email, name, role, salt, password_hash, created_at) VALUES (?, ?, 'STAFF', ?, ?, ?)`)
      .run(email, email.slice(0, 7), salt, hash, at);
  }
  db.prepare(`INSERT INTO stores (id, owner_id, name, address, max_party, is_accepting, created_at) VALUES
              (1, 1, '매장A', '주소A', 4, 1, ?), (2, 2, '매장B', '주소B', 4, 1, ?)`).run(at, at);

  const staffA = await login('staff-a@test.com');
  const staffB = await login('staff-b@test.com');

  async function customer(name) {
    const email = `${name}@test.com`;
    const r = await request('/api/auth/signup', { method: 'POST', body: { email, password: PASSWORD, name } });
    return { id: r.data.id, token: await login(email) };
  }

  return {
    db, clock, request, staffA, staffB, customer,
    register: (token, storeId = 1, partySize = 2) =>
      request(`/api/stores/${storeId}/waitings`, { token, method: 'POST', body: { partySize } }),
    staff: (token, waitingId, action) =>
      request(`/api/staff/waitings/${waitingId}/${action}`, { token, method: 'POST', body: {} }),
    cancel: (token, waitingId) => request(`/api/waitings/${waitingId}/cancel`, { token, method: 'POST', body: {} }),
    row: id => db.prepare('SELECT * FROM waitings WHERE id = ?').get(id),
    count: (sql, ...params) => db.prepare(sql).get(...params).n,
  };
}
