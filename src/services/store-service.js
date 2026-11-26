import { AppError, forbidden, notFound } from '../errors.js';
import { iso, seoulDate } from '../time.js';

const toStoreDto = s => s && ({
  id: s.id,
  ownerId: s.owner_id,
  name: s.name,
  address: s.address,
  maxParty: s.max_party,
  isAccepting: Boolean(s.is_accepting),
  isActive: Boolean(s.is_active),
  waitingCount: s.waiting_count ?? undefined,
});

export function createStoreService({ db, tx, now }) {
  const withCount = `SELECT s.*, (SELECT COUNT(*) FROM waitings w
                       WHERE w.store_id = s.id AND w.service_date = ? AND w.status = 'WAITING') AS waiting_count
                       FROM stores s`;

  function ownStore(actor, id) {
    const s = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
    if (!s || !s.is_active) throw notFound('매장');
    if (actor.role !== 'OWNER' || s.owner_id !== actor.id) throw forbidden('이 매장의 사장님만 수정할 수 있습니다.');
    return s;
  }

  return {
    listPublic() {
      return db.prepare(`${withCount} WHERE s.is_active = 1 ORDER BY s.id`).all(seoulDate(now())).map(toStoreDto);
    },

    getPublic(id) {
      const s = db.prepare(`${withCount} WHERE s.id = ? AND s.is_active = 1`).get(seoulDate(now()), id);
      if (!s) throw notFound('매장');
      return toStoreDto(s);
    },

    listMine(actor) {
      return db.prepare(`${withCount} WHERE s.owner_id = ? AND s.is_active = 1 ORDER BY s.id`)
        .all(seoulDate(now()), actor.id).map(toStoreDto);
    },

    create(actor, { name, address, maxParty }) {
      if (actor.role !== 'OWNER') throw forbidden('사장님만 매장을 등록할 수 있습니다.');
      const r = db.prepare(`INSERT INTO stores (owner_id, name, address, max_party, is_accepting, created_at)
                            VALUES (?, ?, ?, ?, 0, ?)`).run(actor.id, name, address, maxParty, iso(now()));
      return toStoreDto(db.prepare('SELECT * FROM stores WHERE id = ?').get(r.lastInsertRowid));
    },

    update(actor, id, patch) {
      return tx(() => {
        ownStore(actor, id);
        const map = { name: 'name', address: 'address', maxParty: 'max_party', isAccepting: 'is_accepting' };
        const keys = Object.keys(patch);
        const value = k => (k === 'isAccepting' ? Number(patch[k]) : patch[k]);
        db.prepare(`UPDATE stores SET ${keys.map(k => `${map[k]} = ?`).join(', ')} WHERE id = ?`)
          .run(...keys.map(value), id);
        return toStoreDto(db.prepare('SELECT * FROM stores WHERE id = ?').get(id));
      });
    },

    /**
     * 매장 "삭제"는 비활성화로 처리합니다.
     * 지난 웨이팅·노쇼 기록이 매장을 참조하므로 행을 지우면 이력이 깨지기 때문입니다.
     * 진행 중인 웨이팅이 있으면 손님이 갈 곳을 잃으므로 거절합니다.
     */
    deactivate(actor, id) {
      return tx(() => {
        ownStore(actor, id);
        const active = db.prepare(`SELECT COUNT(*) AS n FROM waitings WHERE store_id = ? AND status IN ('WAITING','CALLED')`).get(id).n;
        if (active > 0) throw new AppError(409, 'HAS_ACTIVE_WAITINGS', '진행 중인 웨이팅이 있어 매장을 닫을 수 없습니다. 먼저 영업 종료를 해주세요.');
        db.prepare('UPDATE stores SET is_active = 0, is_accepting = 0 WHERE id = ?').run(id);
        return { id, isActive: false };
      });
    },
  };
}
