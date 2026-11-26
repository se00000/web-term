import { NavLink } from 'react-router-dom';
import { ACCOUNT } from '../accountTypes.js';

/** 로그인·가입 화면 위의 [손님 | 사장님] 전환 탭. 두 화면은 서버에서도 경로가 분리되어 있습니다. */
export default function AccountSwitch({ mode }) {
  const path = type => (mode === 'signup' ? ACCOUNT[type].signupPath : ACCOUNT[type].loginPath);
  return (
    <nav className="segmented" aria-label="계정 종류">
      <NavLink to={path('customer')} end className="seg seg-customer">손님</NavLink>
      <NavLink to={path('owner')} end className="seg seg-owner">사장님</NavLink>
    </nav>
  );
}
