import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Nuff — 나를 위한 작은 지식 공간',description:'링크를 모으고, 연결하고, 충분히 이해하세요. 나의 관심을 지식으로 바꾸는 Nuff.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
