import { Item, Topic } from './domain';
const rows: [string,Topic,string,string[],string,string][] = [
 ['AI 에이전트, 이제는 직접 만들어볼 시간','AI & 테크','AI 에이전트는 도구와 메모리를 연결해 반복적인 업무를 스스로 수행합니다.',['AI 에이전트','도구 사용','메모리'],'YouTube','https://www.youtube.com/'],
 ['집중력을 되찾는 가장 작은 습관','생산성 & 집중','집중을 위해 의지력을 쓰기보다 스마트폰 알림을 끄고 환경을 바꿔보세요.',['집중력','환경 설계','디지털 미니멀리즘'],'블로그','https://jamesclear.com/focus'],
 ['주 3회로 시작하는 근력 운동 루틴','운동 & 건강','무리한 계획보다 주 3회, 전신 운동을 꾸준히 반복하는 것이 중요합니다.',['근력 운동','루틴','점진적 과부하'],'YouTube','https://www.youtube.com/'],
 ['MCP가 바꾸는 AI 도구 연결 방식','AI & 테크','MCP는 AI와 외부 도구를 공통된 방식으로 연결하는 프로토콜입니다.',['MCP','AI 에이전트','도구 사용'],'웹사이트','https://modelcontextprotocol.io/'],
 ['좋은 에이전트에는 메모리가 필요하다','AI & 테크','이전 맥락을 기억하는 메모리는 에이전트가 반복 작업을 수행하도록 돕습니다.',['AI 에이전트','메모리','도구 사용'],'블로그','https://www.anthropic.com/engineering'],
 ['생각보다 단순한 에이전트의 구조','AI & 테크','도구 사용과 메모리를 작은 워크플로로 조합하면 에이전트를 시작할 수 있습니다.',['AI 에이전트','도구 사용','메모리'],'웹사이트','https://www.anthropic.com/engineering/building-effective-agents'],
 ['알림을 끄면 달라지는 것들','생산성 & 집중','스마트폰 알림을 줄이고 몰입할 시간을 따로 확보해 집중 환경을 만드세요.',['집중력','환경 설계','디지털 미니멀리즘'],'Instagram','https://www.instagram.com/'],
 ['꾸준함을 만드는 운동 기록법','운동 & 건강','운동 중량과 횟수를 기록하면 점진적 과부하를 적용하기 쉬워집니다.',['근력 운동','운동 기록','점진적 과부하'],'블로그','https://www.strongerbyscience.com/'],
 ['AI 에이전트의 도구 사용과 기억','AI & 테크','도구와 메모리를 함께 설계하면 반복 업무를 자동화하는 데 도움이 됩니다.',['AI 에이전트','도구 사용','메모리'],'YouTube','https://www.youtube.com/'],
 ['덜 하기 위한 생산성','생산성 & 집중','해야 할 일을 늘리기보다 방해 요소를 줄이고 한 가지에 집중하세요.',['집중력','환경 설계','디지털 미니멀리즘'],'블로그','https://calnewport.com/'],
 ['처음 시작하는 전신 운동','운동 & 건강','기본 동작을 익히고 충분히 회복하면서 운동량을 천천히 늘려가세요.',['근력 운동','루틴','회복'],'YouTube','https://www.youtube.com/'],
 ['반복 업무를 AI에 맡기는 첫걸음','AI & 테크','외부 도구와 메모리를 연결해 반복적인 업무부터 자동화할 수 있습니다.',['AI 에이전트','도구 사용','메모리'],'웹사이트','https://www.anthropic.com/engineering']
];
export function sampleItems(): Item[] {return rows.map((r,i)=>({id:`sample-${i}`,title:r[0],topic:r[1],summary:r[2],keywords:r[3],claims:[r[2]],platform:r[4],url:r[5],createdAt:new Date(Date.now()-i*1800000).toISOString(),mode:'sample',viewed:i===1||i===4}));}
