import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError, forbidden, unauthorized } from './errors.js';
import { iso } from './time.js';

const ISSUER = 'waiting-service';
const TOKEN_TTL = '2h';
const KEY_LEN = 64;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, KEY_LEN).toString('hex') };
}

function passwordMatches(password, salt, hashHex) {
  return timingSafeEqual(scryptSync(password, salt, KEY_LEN), Buffer.from(hashHex, 'hex'));
}

// 존재하지 않는 이메일로 로그인해도 같은 시간이 걸리게 하는 더미 값 (계정 존재 여부 노출 방지)
const DUMMY = hashPassword('dummy-password');

export const ROLES = ['CUSTOMER', 'OWNER'];

export const publicUser =u => ({ id: u.id, email: u.email, name: u.name, role: u.role, penaltyUntil: u.penalty_until });

export function createAuth({ db, secret, now }) {
  return {
    /** role은 요청 본문이 아니라 호출한 경로(손님용/사장님용 가입)에서 정해집니다. */
    signup({ email, password, name, role }) {
      if (!ROLES.includes(role)) throw new Error(`unknown role: ${role}`);
      const { salt, hash } = hashPassword(password);
      try {
        const r = db.prepare(`INSERT INTO users (email, name, role, salt, password_hash, created_at)
                              VALUES (?, ?, ?, ?, ?, ?)`).run(email, name, role, salt, hash, iso(now()));
        return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid));
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) throw new AppError(409, 'EMAIL_TAKEN', '이미 가입된 이메일입니다.');
        throw e;
      }
    },

    /**
     * 손님 로그인과 사장님 로그인은 분리되어 있습니다.
     * 비밀번호가 맞더라도 계정 종류가 다르면 토큰을 발급하지 않습니다.
     * (비밀번호를 먼저 확인하므로, 비밀번호를 모르는 사람에게는 계정 종류가 드러나지 않습니다.)
     */
    login({ email, password, role }) {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const ok = user
        ? passwordMatches(password, user.salt, user.password_hash)
        : (passwordMatches(password, DUMMY.salt, DUMMY.hash), false);
      if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
      if (user.role !== role) {
        throw new AppError(403, 'WRONG_ACCOUNT_TYPE', user.role === 'OWNER'
          ? '사장님 계정입니다. 사장님 로그인을 이용해주세요.'
          : '손님 계정입니다. 손님 로그인을 이용해주세요.');
      }
      const accessToken = jwt.sign({}, secret, { algorithm: 'HS256', subject: String(user.id), issuer: ISSUER, expiresIn: TOKEN_TTL });
      return { accessToken, user: publicUser(user) };
    },

    /** Authorization: Bearer <token> 을 검증하고, 역할은 토큰이 아니라 DB에서 다시 읽습니다. */
    required(req, _res, next) {
      const header = req.get('Authorization') || '';
      if (!header.startsWith('Bearer ')) return next(unauthorized());
      try {
        const payload = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'], issuer: ISSUER });
        if (!/^\d+$/.test(payload.sub)) throw new Error('bad sub');
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(payload.sub));
        if (!user) throw new Error('no user');
        req.user = publicUser(user);
        next();
      } catch (e) {
        next(unauthorized(e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          '로그인이 만료되었거나 토큰이 유효하지 않습니다.'));
      }
    },
  };
}

export const requireRole = role => (req, _res, next) =>
  next(req.user?.role === role ? undefined : forbidden());
