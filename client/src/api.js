// 모든 API 호출은 같은 주소의 /api 로 갑니다 (개발: Vite 프록시, 배포: Express가 함께 서빙).
const TOKEN_KEY = 'waiting.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: t => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 저장 불가 환경 */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.code, data.message || '요청을 처리하지 못했습니다.', data.details);
  }
  return data;
}

export const STATUS_LABEL = {
  WAITING: '대기 중',
  CALLED: '입장 호출',
  SEATED: '입장 완료',
  CANCELLED: '취소됨',
  NO_SHOW: '노쇼',
};

export const formatTime = isoString =>
  isoString ? new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
