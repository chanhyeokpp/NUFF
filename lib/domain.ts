export type Topic = 'AI & 테크' | '생산성 & 집중' | '운동 & 건강' | '기타';
export type Item = { id: string; url: string; title: string; summary: string; thumbnail?: string; keywords: string[]; claims: string[]; topic: Topic; platform: string; createdAt: string; mode: 'ai'|'extractive'|'unread'|'sample'; viewed: boolean; };
export const topics: Topic[] = ['AI & 테크','생산성 & 집중','운동 & 건강','기타'];
export const topicDescriptions: Record<Topic,string> = {'AI & 테크':'도구를 넘어, 함께 일하는 AI','생산성 & 집중':'덜 바쁘게, 더 중요한 일에 집중하기','운동 & 건강':'지속할 수 있는 건강한 일상','기타':'아직 이름 붙이지 않은 새로운 관심'};
export function cluster(items: Item[], topic: Topic) {
 const list=items.filter(x=>x.topic===topic).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const freq=new Map<string,number>();
 list.forEach(x=>new Set(x.keywords.map(k=>k.toLowerCase())).forEach(k=>freq.set(k,(freq.get(k)||0)+1)));
 const analyzed=list.filter(x=>x.mode!=='unread');
 const repeated=analyzed.filter((x,i)=>{const older=new Set(analyzed.slice(i+1).flatMap(y=>y.keywords.map(k=>k.toLowerCase()))); return x.keywords.length>0&&x.keywords.filter(k=>older.has(k.toLowerCase())).length/x.keywords.length>=.6;});
 const ratio=analyzed.length?Math.round(repeated.length/analyzed.length*100):0;
 const claims=[...new Set(analyzed.flatMap(x=>x.claims))];
 return {list,ratio,repeated:repeated.length,keywords:[...freq].sort((a,b)=>b[1]-a[1]),claims,enough:analyzed.length>=5&&ratio>=50};
}
export function weekItems(items: Item[]) {const now=new Date(); const d=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Seoul'}));const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);d.setHours(0,0,0,0);const start=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-9*3600000;return items.filter(x=>Date.parse(x.createdAt)>=start&&Date.parse(x.createdAt)<=now.getTime());}
