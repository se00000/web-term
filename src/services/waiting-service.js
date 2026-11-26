import { AppError, badInput, forbidden, invalidState, notFound } from '../errors.js';
import { addDays, iso, minutesSince, seoulDate } from '../time.js';

/** 업무 규칙 상수 — 보고서의 규칙 표와 같은 값입니다. */
export const RULES = {
  CALL_TIMEOUT_MIN: 10,     // 호출 후 이 시간이 지나야 노쇼 처리 가능
  NO_SHOW_LIMIT: 2,         // 최근 NO_SHOW_WINDOW_DAYS 안에 이 횟수가 되면
  NO_SHOW_WINDOW_DAYS: 30,
  PENALTY_DAYS: 7,          // 이 기간 동안 등록 금지
};

const ACTIVE = ['WAITING', 'CALLED'];

export const toWaitingDto = w => w && ({
  id: w.id,
  storeId: w.store_id,
  storeName: w.store_name,
  storeCategory: w.store_category,
  userId: w.user_id,
  customerName: w.customer_name,
  serviceDate: w.service_date,
  ticketNo: w.ticket_no,
  partySize: w.party_size,
  status: w.status,
  createdAt: w.created_at,
  calledAt: w.called_at,
  finishedAt: w.finished_at,
});

export function createWaitingService({ db, tx, now }) {
  const selectWaiting = `SELECT w.*, s.name AS store_name, s.category AS store_category, u.name AS customer_name
                           FROM waitings w JOIN stores s ON s.id = w.store_id JOIN users u ON u.id = w.user_id`;
  const getWaiting = id => db.prepare(`${selectWaiting} WHERE w.id = ?`).get(id);
  const getStore = id => db.prepare('SELECT * FROM stores WHERE id = ?').get(id);

  const firstInLine = (storeId, date) => db.prepare(
    `SELECT * FROM waitings WHERE store_id = ? AND service_date = ? AND status = 'WAITING'
      ORDER BY ticket_no LIMIT 1`).get(storeId, date);

  /**
   * 상태를 바꾸고 이력을 남깁니다.
   * WHERE에 현재 상태(from)를 함께 걸어서, 그 사이 상태가 바뀌었다면 아무 행도 바뀌지 않고 거절됩니다.
   */
  function transition(w, to, { actorId, action, at, set = {} }) {
    const cols = Object.keys(set);
    const r = db.prepare(
      `UPDATE waitings SET status = ?${cols.map(c => `, ${c} = ?`).join('')} WHERE id = ? AND status = ?`
    ).run(to, ...cols.map(c => set[c]), w.id, w.status);
    if (r.changes !== 1) throw invalidState();
    db.prepare(`INSERT INTO waiting_logs (waiting_id, actor_id, action, from_status, to_status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run(w.id, actorId, action, w.status, to, at);
  }

  function assertOwnStore(actor, storeId) {
    const store = getStore(storeId);
    if (!store) throw notFound('매장');
    if (actor.role !== 'OWNER' || store.owner_id !== actor.id) throw forbidden('이 매장의 사장님만 처리할 수 있습니다.');
    return store;
  }

  /** 사장님 작업 공통: 웨이팅 조회 → 매장 소유 확인 → 필요한 상태 확인 */
  function loadForOwner(actor, waitingId, expectedStatus) {
    const w = getWaiting(waitingId);
    if (!w) throw notFound('웨이팅');
    assertOwnStore(actor, w.store_id);
    if (w.status !== expectedStatus) throw invalidState();
    return w;
  }

  function positionOf(w) {
    if (w.status !== 'WAITING') return 0;
    return db.prepare(`SELECT COUNT(*) AS n FROM waitings WHERE store_id = ? AND service_date = ?
                         AND status = 'WAITING' AND ticket_no < ?`).get(w.store_id, w.service_date, w.ticket_no).n;
  }

  return {
    /** 손님: 웨이팅 등록 (선착순 순번 발급) */
    register(actor, storeId, partySize) {
      if (actor.role !== 'CUSTOMER') throw forbidden('손님 계정만 웨이팅을 등록할 수 있습니다.');
      return tx(() => {
        const t = now(), at = iso(t), today = seoulDate(t);

        const store = getStore(storeId);
        if (!store || !store.is_active) throw notFound('매장');
        if (!store.is_accepting) throw new AppError(409, 'NOT_ACCEPTING', '지금은 웨이팅을 받지 않는 매장입니다.');
        if (partySize > store.max_party) throw badInput(`이 매장은 최대 ${store.max_party}명까지 웨이팅할 수 있습니다.`);

        const user = db.prepare('SELECT penalty_until FROM users WHERE id = ?').get(actor.id);
        if (user.penalty_until && user.penalty_until > at) {
          throw new AppError(403, 'PENALTY_ACTIVE', '노쇼 누적으로 웨이팅 등록이 제한된 상태입니다.', { until: user.penalty_until });
        }

        const existing = db.prepare(`SELECT * FROM waitings WHERE user_id = ? AND status IN ('WAITING','CALLED')`).get(actor.id);
        if (existing) {
          if (existing.service_date >= today) {
            throw new AppError(409, 'ALREADY_WAITING', '이미 진행 중인 웨이팅이 있습니다. 한 번에 한 곳만 웨이팅할 수 있습니다.');
          }
          // 지난 영업일에 정리되지 않은 웨이팅은 자동으로 만료 처리합니다.
          transition(existing, 'CANCELLED', { actorId: null, action: 'EXPIRE', at, set: { finished_at: at } });
        }

        const ticketNo = db.prepare(`SELECT COALESCE(MAX(ticket_no), 0) + 1 AS next FROM waitings
                                      WHERE store_id = ? AND service_date = ?`).get(storeId, today).next;
        const r = db.prepare(`INSERT INTO waitings (store_id, user_id, service_date, ticket_no, party_size, status, created_at)
                              VALUES (?, ?, ?, ?, ?, 'WAITING', ?)`).run(storeId, actor.id, today, ticketNo, partySize, at);
        db.prepare(`INSERT INTO waiting_logs (waiting_id, actor_id, action, from_status, to_status, created_at)
                    VALUES (?, ?, 'REGISTER', NULL, 'WAITING', ?)`).run(r.lastInsertRowid, actor.id, at);
        const created = getWaiting(r.lastInsertRowid);
        return { ...toWaitingDto(created), aheadCount: positionOf(created) };
      });
    },

    /** 손님: 본인 웨이팅 취소 */
    cancel(actor, waitingId) {
      return tx(() => {
        const w = getWaiting(waitingId);
        if (!w) throw notFound('웨이팅');
        if (w.user_id !== actor.id) throw forbidden('본인 웨이팅만 취소할 수 있습니다.');
        if (!ACTIVE.includes(w.status)) throw invalidState('이미 종료된 웨이팅입니다.');
        const at = iso(now());
        transition(w, 'CANCELLED', { actorId: actor.id, action: 'CANCEL', at, set: { finished_at: at } });
        return toWaitingDto(getWaiting(w.id));
      });
    },

    /** 손님: 내 진행 중 웨이팅 + 내 앞 대기 팀 수 */
    mine(actor) {
      const w = db.prepare(`${selectWaiting} WHERE w.user_id = ? ORDER BY w.id DESC LIMIT 1`).get(actor.id);
      if (!w) return null;
      return { ...toWaitingDto(w), aheadCount: positionOf(w) };
    },

    /** 사장님: 맨 앞 대기자 호출 */
    call(actor, waitingId) {
      return tx(() => {
        const w = loadForOwner(actor, waitingId, 'WAITING');
        const t = now();
        if (w.service_date !== seoulDate(t)) throw invalidState('오늘 접수된 웨이팅이 아닙니다.');
        const first = firstInLine(w.store_id, w.service_date);
        if (first.id !== w.id) {
          throw new AppError(409, 'NOT_FIRST_IN_LINE', `선착순에 따라 ${first.ticket_no}번부터 호출해야 합니다.`);
        }
        transition(w, 'CALLED', { actorId: actor.id, action: 'CALL', at: iso(t), set: { called_at: iso(t) } });
        return toWaitingDto(getWaiting(w.id));
      });
    },

    /** 사장님: 입장 처리 */
    seat(actor, waitingId) {
      return tx(() => {
        const w = loadForOwner(actor, waitingId, 'CALLED');
        const at = iso(now());
        transition(w, 'SEATED', { actorId: actor.id, action: 'SEAT', at, set: { finished_at: at } });
        return toWaitingDto(getWaiting(w.id));
      });
    },

    /**
     * 사장님: 노쇼 처리. 아래 세 가지가 하나의 트랜잭션입니다.
     *  1) 웨이팅을 NO_SHOW로 변경  2) 노쇼 누적 시 손님 이용 제한  3) 다음 순번 자동 호출
     */
    noShow(actor, waitingId) {
      return tx(() => {
        const w = loadForOwner(actor, waitingId, 'CALLED');
        const t = now(), at = iso(t);
        if (minutesSince(w.called_at, t) < RULES.CALL_TIMEOUT_MIN) {
          throw new AppError(409, 'CALL_NOT_EXPIRED', `호출 후 ${RULES.CALL_TIMEOUT_MIN}분이 지나야 노쇼 처리할 수 있습니다.`);
        }
        transition(w, 'NO_SHOW', { actorId: actor.id, action: 'NO_SHOW', at, set: { finished_at: at } });

        const since = iso(addDays(t, -RULES.NO_SHOW_WINDOW_DAYS));
        const count = db.prepare(`SELECT COUNT(*) AS n FROM waitings
                                   WHERE user_id = ? AND status = 'NO_SHOW' AND finished_at >= ?`).get(w.user_id, since).n;
        let penaltyUntil = null;
        if (count >= RULES.NO_SHOW_LIMIT) {
          penaltyUntil = iso(addDays(t, RULES.PENALTY_DAYS));
          db.prepare('UPDATE users SET penalty_until = ? WHERE id = ?').run(penaltyUntil, w.user_id);
        }

        let nextCalled = null;
        const next = firstInLine(w.store_id, w.service_date);
        if (next) {
          transition(next, 'CALLED', { actorId: actor.id, action: 'AUTO_CALL', at, set: { called_at: at } });
          nextCalled = toWaitingDto(getWaiting(next.id));
        }
        return { waiting: toWaitingDto(getWaiting(w.id)), noShowCount: count, penaltyUntil, nextCalled };
      });
    },

    /** 사장님: 영업 종료 — 접수를 닫고 남은 웨이팅을 한 번에 종료합니다. */
    closeDay(actor, storeId) {
      return tx(() => {
        assertOwnStore(actor, storeId);
        const at = iso(now());
        db.prepare('UPDATE stores SET is_accepting = 0 WHERE id = ?').run(storeId);
        const active = db.prepare(`SELECT * FROM waitings WHERE store_id = ? AND status IN ('WAITING','CALLED')`).all(storeId);
        for (const w of active) transition(w, 'CANCELLED', { actorId: actor.id, action: 'CLOSE', at, set: { finished_at: at } });
        return { closedCount: active.length };
      });
    },

    /** 사장님: 오늘 매장 웨이팅 목록 */
    listForStore(actor, storeId) {
      assertOwnStore(actor, storeId);
      const rows = db.prepare(`${selectWaiting} WHERE w.store_id = ? AND w.service_date = ? ORDER BY w.ticket_no`)
        .all(storeId, seoulDate(now()));
      return rows.map(toWaitingDto);
    },

    history(actor, waitingId) {
      const w = getWaiting(waitingId);
      if (!w) throw notFound('웨이팅');
      const store = getStore(w.store_id);
      if (w.user_id !== actor.id && store.owner_id !== actor.id) throw forbidden();
      return db.prepare(`SELECT action, from_status AS fromStatus, to_status AS toStatus, actor_id AS actorId, created_at AS createdAt
                           FROM waiting_logs WHERE waiting_id = ? ORDER BY id`).all(w.id);
    },
  };
}
