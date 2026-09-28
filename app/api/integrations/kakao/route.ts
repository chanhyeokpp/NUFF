import { env } from 'cloudflare:workers';
import { kakaoWebhook, IngressEnv } from '@/ingestion/kakao';
// Local contract testing only. Private Sites login blocks external Kakao calls.
// Production callback is the isolated ingestion/worker.ts at /webhooks/kakao.
export async function POST(request:Request){return kakaoWebhook(request,env as unknown as IngressEnv);}
