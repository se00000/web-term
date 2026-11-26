import { AppError, forbidden, notFound } from '../errors.js';
import { iso, seoulDate } from '../time.js';
import { CATEGORIES, SIDOS } from '../catalog.js';

const toStoreDto = s => s && ({
  id: s.id,
  ownerId: s.owner_id,
  name: s.name,
  address: s.address,
  sido: s.sido,
  district: s.district,
  category: s.category,
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
    /**
     * 손님용 매장 목록. 조건은 모두 선택이며, 주어진 것만 AND로 묶습니다.
     * 값은 app.js에서 이미 검증했고, SQL에는 항상 ? 자리표시자로만 넣습니다.
     */
    listPublic({ sido, district, category, q } = {}) {
      const where = ['s.is_active = 1'];
      const params = [seoulDate(now())];
      if (sido) { where.push('s.sido = ?'); params.push(sido); }
      if (district) { where.push('s.district = ?'); params.push(district); }
      if (category) { where.push('s.category = ?'); params.push(category); }
      if (q) {
        where.push(`(s.name LIKE ? ESCAPE '\\' OR s.address LIKE ? ESCAPE '\\')`);
        const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
        params.push(like, like);
      }
      // 접수 중인 매장을 먼저, 그 안에서는 대기 팀이 적은 순서로 보여줍니다.
      return db.prepare(`${withCount} WHERE ${where.join(' AND ')}
                         ORDER BY s.is_accepting DESC, waiting_count ASC, s.id`).all(...params).map(toStoreDto);
    },

    /** 메뉴에 표시할 지역·음식 종류별 매장 수 (영업 중인 매장 기준, 0개인 항목도 포함) */
    facets() {
      const count = (sql, ...p) => new Map(db.prepare(sql).all(...p).map(r => [r.k, r.n]));
      const bySido = count(`SELECT sido AS k, COUNT(*) AS n FROM stores WHERE is_active = 1 GROUP BY sido`);
      const byCategory = count(`SELECT category AS k, COUNT(*) AS n FROM stores WHERE is_active = 1 GROUP BY category`);
      const districts = {};
      for (const r of db.prepare(`SELECT sido, district, COUNT(*) AS n FROM stores
                                   WHERE is_active = 1 AND district <> '' GROUP BY sido, district ORDER BY district`).all()) {
        (districts[r.sido] ??= []).push({ name: r.district, count: r.n });
      }
      return {
        sidos: SIDOS.map(name => ({ name, count: bySido.get(name) ?? 0 })),
        categories: CATEGORIES.map(name => ({ name, count: byCategory.get(name) ?? 0 })),
        districts,
      };
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

    create(actor, { name, address, sido, district, category, maxParty }) {
      if (actor.role !== 'OWNER') throw forbidden('사장님만 매장을 등록할 수 있습니다.');
      const r = db.prepare(`INSERT INTO stores (owner_id, name, address, sido, district, category, max_party, is_accepting, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`)
        .run(actor.id, name, address, sido, district, category, maxParty, iso(now()));
      return toStoreDto(db.prepare('SELECT * FROM stores WHERE id = ?').get(r.lastInsertRowid));
    },

    update(actor, id, patch) {
      return tx(() => {
        ownStore(actor, id);
        const map = {
          name: 'name', address: 'address', sido: 'sido', district: 'district', category: 'category',
          maxParty: 'max_party', isAccepting: 'is_accepting',
        };
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
