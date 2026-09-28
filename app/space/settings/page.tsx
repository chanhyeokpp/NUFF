import type { Metadata } from 'next';
import AccountSettings from './settings';

export const metadata:Metadata={title:'Nuff — 계정 · 채널 관리'};
export default function SettingsPage(){return <AccountSettings/>;}
