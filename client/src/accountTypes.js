// 손님/사장님 화면 문구와 경로를 한곳에 모아 둡니다.
export const ACCOUNT = {
  customer: {
    role: 'CUSTOMER',
    label: '손님',
    loginPath: '/login',
    signupPath: '/signup',
    homePath: '/',
    loginTitle: '손님 로그인',
    loginLead: '줄 서지 말고 원격으로 웨이팅하세요.',
    signupTitle: '손님 회원가입',
    signupLead: '가입하면 매장에 가지 않고도 웨이팅을 등록하고 내 순번을 확인할 수 있어요.',
  },
  owner: {
    role: 'OWNER',
    label: '사장님',
    loginPath: '/owner/login',
    signupPath: '/owner/signup',
    homePath: '/owner',
    loginTitle: '사장님 로그인',
    loginLead: '매장 웨이팅을 접수하고 손님을 호출하세요.',
    signupTitle: '사장님 회원가입',
    signupLead: '가입 후 매장을 등록하면 바로 원격 웨이팅을 받을 수 있어요.',
  },
};

export const other = type => (type === 'owner' ? 'customer' : 'owner');
export const typeOfRole = role => (role === 'OWNER' ? 'owner' : 'customer');
