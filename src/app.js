import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTx } from './db.js';
import { createAuth, requireRole } from './auth.js';
import { createStoreService } from './services/store-service.js';
import { createWaitingService } from './services/waiting-service.js';
import { AppError, badInput, notFound } from './errors.js';

// ---- 입력 검증 도우미 ----
function id(value) {
  if (!/^[1-9]\d{0,9}$/.test(value)) throw badInput('잘못된 ID입니다.');
  return Number(value);
}
function body(req, allowed) {
  const b = req.body ?? {};
  if (typeof b !== 'object' || Array.isArray(b)) throw badInput();
  const extra = Object.keys(b).filter(k => !allowed.includes(k));
  if (extra.length) throw badInput(`허용되지 않은 항목입니다: ${extra.join(', ')}`);
  return b;
}
function text(value, label, min, max) {
  if (typeof value !== 'string') throw badInput(`${label}을(를) 입력해주세요.`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw badInput(`${label}은(는) ${min}~${max}자여야 합니다.`);
  return v;
}
function int(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw badInput(`${label}은(는) ${min}~${max} 사이의 정수여야 합니다.`);
  return value;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createApp({ db, secret, now = () => new Date() }) {
  if (!secret || secret.length < 32) throw new Error('JWT secret은 32자 이상이어야 합니다.');
  const tx = createTx(db);
  const auth = createAuth({ db, secret, now });
  const stores = createStoreService({ db, tx, now });
  const waitings = createWaitingService({ db, tx, now });
  const ownerOnly = [auth.required, requireRole('OWNER')];

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // ---- 인증 ----
  // 손님용(/api/auth/customer/...)과 사장님용(/api/auth/owner/...) 가입·로그인을 경로로 나눕니다.
  // 계정 종류는 요청 본문으로 받지 않으므로, 본문에 role을 넣어 다른 종류로 가입할 수 없습니다.
  const ACCOUNT_TYPES = { customer: 'CUSTOMER', owner: 'OWNER' };
  for (const [type, role] of Object.entries(ACCOUNT_TYPES)) {
    app.post(`/api/auth/${type}/signup`, (req, res) => {
      const b = body(req, ['email', 'password', 'name']);
      const email = text(b.email, '이메일', 5, 100).toLowerCase();
      if (!EMAIL_RE.test(email)) throw badInput('이메일 형식이 올바르지 않습니다.');
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw badInput('비밀번호는 8~72자여야 합니다.');
      const name = text(b.name, '이름', 1, 20);
      res.status(201).json(auth.signup({ email, password: b.password, name, role }));
    });

    app.post(`/api/auth/${type}/login`, (req, res) => {
      const b = body(req, ['email', 'password']);
      if (typeof b.email !== 'string' || typeof b.password !== 'string' || !b.email || !b.password) throw badInput('이메일과 비밀번호를 입력해주세요.');
      res.json(auth.login({ email: b.email.trim().toLowerCase(), password: b.password, role }));
    });
  }

  app.get('/api/me', auth.required, (req, res) => res.json(req.user));

  // ---- 매장 (공개) ----
  app.get('/api/stores', (_req, res) => res.json(stores.listPublic()));
  app.get('/api/stores/:id', (req, res) => res.json(stores.getPublic(id(req.params.id))));

  // ---- 웨이팅 (손님) ----
  app.post('/api/stores/:id/waitings', auth.required, (req, res) => {
    const b = body(req, ['partySize']);
    const w = waitings.register(req.user, id(req.params.id), int(b.partySize, '인원', 1, 20));
    res.status(201).location(`/api/waitings/${w.id}`).json(w);
  });
  app.get('/api/me/waiting', auth.required, (req, res) => res.json({ waiting: waitings.mine(req.user) }));
  app.post('/api/waitings/:id/cancel', auth.required, (req, res) => {
    body(req, []);
    res.json(waitings.cancel(req.user, id(req.params.id)));
  });
  app.get('/api/waitings/:id/history', auth.required, (req, res) => res.json(waitings.history(req.user, id(req.params.id))));

  // ---- 매장 관리 (사장님) ----
  app.get('/api/owner/stores', ...ownerOnly, (req, res) => res.json(stores.listMine(req.user)));
  app.post('/api/owner/stores', ...ownerOnly, (req, res) => {
    const b = body(req, ['name', 'address', 'maxParty']);
    res.status(201).json(stores.create(req.user, {
      name: text(b.name, '매장 이름', 1, 40),
      address: text(b.address, '주소', 1, 100),
      maxParty: int(b.maxParty, '최대 인원', 1, 20),
    }));
  });
  app.patch('/api/owner/stores/:id', ...ownerOnly, (req, res) => {
    const b = body(req, ['name', 'address', 'maxParty', 'isAccepting']);
    const patch = {};
    if ('name' in b) patch.name = text(b.name, '매장 이름', 1, 40);
    if ('address' in b) patch.address = text(b.address, '주소', 1, 100);
    if ('maxParty' in b) patch.maxParty = int(b.maxParty, '최대 인원', 1, 20);
    if ('isAccepting' in b) {
      if (typeof b.isAccepting !== 'boolean') throw badInput('isAccepting은 true/false여야 합니다.');
      patch.isAccepting = b.isAccepting;
    }
    if (!Object.keys(patch).length) throw badInput('변경할 항목이 없습니다.');
    res.json(stores.update(req.user, id(req.params.id), patch));
  });
  app.delete('/api/owner/stores/:id', ...ownerOnly, (req, res) => res.json(stores.deactivate(req.user, id(req.params.id))));
  app.post('/api/owner/stores/:id/close-day', ...ownerOnly, (req, res) => {
    body(req, []);
    res.json(waitings.closeDay(req.user, id(req.params.id)));
  });
  app.get('/api/owner/stores/:id/waitings', ...ownerOnly, (req, res) => res.json(waitings.listForStore(req.user, id(req.params.id))));

  // ---- 웨이팅 처리 (사장님) ----
  for (const action of ['call', 'seat']) {
    app.post(`/api/owner/waitings/:id/${action}`, ...ownerOnly, (req, res) => {
      body(req, []);
      res.json(waitings[action](req.user, id(req.params.id)));
    });
  }
  app.post('/api/owner/waitings/:id/no-show', ...ownerOnly, (req, res) => {
    body(req, []);
    res.json(waitings.noShow(req.user, id(req.params.id)));
  });

  app.use('/api', (_req, _res, next) => next(notFound('API')));

  // ---- 빌드된 프론트엔드 (client/dist) ----
  const dist = fileURLToPath(new URL('../client/dist', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: dist }));
  }

  // ---- 오류 응답 ----
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') err = badInput();
    const known = err instanceof AppError;
    if (!known) console.error(err);
    const status = known ? err.status : 500;
    if (status === 401) res.set('WWW-Authenticate', 'Bearer');
    res.status(status).json({
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
      ...(known && err.details ? { details: err.details } : {}),
    });
  });

  return app;
}
