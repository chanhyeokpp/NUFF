import { env } from 'cloudflare:workers';
export function database(){const db=(env as unknown as {DB?:D1Database}).DB;if(!db)throw new Error('저장소를 연결하는 중입니다. 잠시 후 다시 시도해주세요.');return db;}
