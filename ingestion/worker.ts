import { kakaoWebhook, IngressEnv } from './kakao';
import { drain } from './processor';
import { shortcutCapture } from './shortcut';
import { accountInfo, addEmail, createDeviceCode, linkKakao, login, pairDevice, resendVerification, signup, verifyEmail } from './auth';
import { deviceLibrary } from './library';

function cors(response: Response) {
 const headers=new Headers(response.headers);
 headers.set('Access-Control-Allow-Origin','*');
 headers.set('Access-Control-Allow-Headers','authorization,content-type');
 headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
 async fetch(request:Request,env:IngressEnv){const path=new URL(request.url).pathname;if(request.method==='OPTIONS')return cors(new Response(null,{status:204}));if(path==='/health'&&request.method==='GET')return Response.json({service:'nuff-kakao-ingress',configured:!!env.KAKAO_BOT_ID&&!!env.KAKAO_SKILL_SECRET});if(path==='/webhooks/kakao'&&request.method==='POST')return kakaoWebhook(request,env);if(path==='/auth/signup'&&request.method==='POST')return cors(await signup(request,env));if(path==='/auth/login'&&request.method==='POST')return cors(await login(request,env));if(path==='/auth/verify-email'&&request.method==='POST')return cors(await verifyEmail(request,env));if(path==='/auth/resend-verification'&&request.method==='POST')return cors(await resendVerification(request,env));if(path==='/auth/add-email'&&request.method==='POST')return cors(await addEmail(request,env));if(path==='/auth/me'&&request.method==='GET')return cors(await accountInfo(request,env));if(path==='/auth/device-code'&&request.method==='POST')return cors(await createDeviceCode(request,env));if(path==='/auth/pair'&&request.method==='POST')return cors(await pairDevice(request,env));if(path==='/auth/link-kakao'&&request.method==='POST')return cors(await linkKakao(request,env));if(path==='/captures/shortcut'&&request.method==='POST')return cors(await shortcutCapture(request,env));if(path==='/captures'&&request.method==='GET')return cors(await deviceLibrary(request,env));return new Response('Not found',{status:404});},
 async scheduled(_event:ScheduledController,env:IngressEnv,ctx:ExecutionContext){ctx.waitUntil(drain(env));}
} satisfies ExportedHandler<IngressEnv>;
