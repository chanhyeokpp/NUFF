import type { Metadata } from 'next';
import Landing from './preview';

export const metadata: Metadata = {
  title: 'Nuff — 좋은 발견을, 가볍게 휙.',
  description: '마음에 드는 링크를 Nuff에 보내세요. 흩어진 발견을 한곳에 모으고 다시 꺼내보세요.',
};

export default function LandingPage() { return <Landing />; }
