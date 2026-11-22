// 시간 계산은 모두 주입된 clock(now)을 기준으로 합니다. 테스트에서 시각을 앞당길 수 있게 하기 위해서입니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 영업일 (YYYY-MM-DD) */
export function seoulDate(date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export const iso = date => date.toISOString();
export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
export const addDays = (date, days) => addMinutes(date, days * 24 * 60);
export const minutesSince = (isoString, now) => (now.getTime() - Date.parse(isoString)) / 60_000;
