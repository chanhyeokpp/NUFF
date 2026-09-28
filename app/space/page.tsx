import type { Metadata } from 'next';
import SpacePreview from './preview';
import { koreaDay } from './message-model';

export const metadata: Metadata = { title: 'Nuff — 나에게 보내기' };
export default async function SpacePage({searchParams}:{searchParams:Promise<{view?:string;demo?:string}>}) {
  const params=await searchParams;
  return <SpacePreview initialDate={koreaDay()} initialScreen={params.demo!=='1'||params.view==='timeline'?'timeline':'entry'} demo={params.demo==='1'}/>;
}
