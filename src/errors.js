export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badInput = (message = '요청 형식이 올바르지 않습니다.') => new AppError(400, 'BAD_INPUT', message);
export const unauthorized = (code = 'TOKEN_REQUIRED', message = '로그인이 필요합니다.') => new AppError(401, code, message);
export const forbidden = (message = '이 작업을 수행할 권한이 없습니다.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = '대상') => new AppError(404, 'NOT_FOUND', `${what}을(를) 찾을 수 없습니다.`);
export const invalidState = (message = '현재 상태에서는 이 작업을 수행할 수 없습니다.') => new AppError(409, 'INVALID_STATE', message);
