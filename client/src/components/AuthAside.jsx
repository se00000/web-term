/** 로그인·가입 화면 왼쪽 소개 영역 (PC에서만 보임) */
const COPY = {
  customer: {
    title: <>줄 서지 말고,<br />번호표만 받아두세요</>,
    points: ['가고 싶은 식당에 원격으로 줄서기', '내 앞 대기 팀 수를 실시간으로 확인', '호출되면 10분 안에 입장'],
    art: '🎫',
  },
  owner: {
    title: <>매장 앞 줄,<br />이제 화면 하나로 관리하세요</>,
    points: ['선착순 대기열을 한눈에', '호출 · 입장 · 노쇼를 버튼 하나로', '노쇼 시 다음 손님 자동 호출'],
    art: '🧾',
  },
};

export default function AuthAside({ type }) {
  const c = COPY[type];
  return (
    <aside className={`auth-aside auth-aside-${type}`} aria-hidden="true">
      <span className="auth-aside-art">{c.art}</span>
      <p className="auth-aside-title">{c.title}</p>
      <ul>{c.points.map(p => <li key={p}>{p}</li>)}</ul>
    </aside>
  );
}
