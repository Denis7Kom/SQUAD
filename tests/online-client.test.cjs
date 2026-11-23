const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createClient}=require('../online-client.js');
const config={url:'https://example.supabase.co',publishableKey:'sb_publishable_test'};
const user='00000000-0000-4000-8000-000000000001',team='00000000-0000-4000-8000-000000000002';
function fixture(handler){
 const saved=new Map(),calls=[];
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const fetch=async(url,options)=>{
  calls.push({url,options});
  const result=await handler(url,options);
  return new Response(result.body===undefined?null:JSON.stringify(result.body),{status:result.status||200,headers:{'Content-Type':'application/json'}});
 };
 return {api:createClient(config,{storage,fetch,crypto:webcrypto}),storage,calls,saved};
}
const session={access_token:'access-test',refresh_token:'refresh-test',expires_in:3600,provider_token:'private-provider-token',user:{email:'private@example.invalid'}};
test('rejects secret keys and untrusted project URLs',()=>{
 for(const url of ['http://example.supabase.co','https://supabase.co.evil.test','https://evil.test','https://a.supabase.co/path','https://user:pw@a.supabase.co'])
  assert.throws(()=>createClient({...config,url}));
 assert.throws(()=>createClient({...config,publishableKey:'sb_secret_test'}));
 const jwt='eyJx.'+btoa(JSON.stringify({role:'service_role'}))+'.sig';
 assert.throws(()=>createClient({...config,publishableKey:jwt}));
});
test('uses authenticated REST, never persists provider tokens or email',async()=>{
 const f=fixture(url=>({body:url.includes('token?')?session:[]}));
 await f.api.signIn('private@example.invalid','password-test');
 await f.api.teams();
 assert.equal(f.calls[1].options.headers.Authorization,'Bearer access-test');
 assert.equal(f.calls[1].options.cache,'no-store');
 assert.equal(f.calls[1].options.credentials,'omit');
 const stored=[...f.saved.values()].join('');
 assert.ok(!stored.includes('private-provider-token'));assert.ok(!stored.includes('private@example.invalid'));
});
test('unauthenticated calls and invalid identifiers do not reach the network',async()=>{
 const f=fixture(()=>({body:[]}));
 await assert.rejects(f.api.teams(),/Sign in/);
 assert.throws(()=>f.api.profile('x&select=*'),/identifier/);
 assert.throws(()=>f.api.saveReview(team,user,'commander',[6,2,2,2,2]),/five scores/);
 assert.equal(f.calls.length,0);
});
test('review and team requests use explicit RPCs without trusting a client author id',async()=>{
 const f=fixture(url=>({body:url.includes('token?')?session:null}));
 await f.api.signIn('a@example.invalid','password-test');
 await f.api.saveReview(team,user,'soldier',[0,1,2,3,5]);
 const call=f.calls.at(-1);assert.match(call.url,/rpc\/save_member_review$/);
 assert.deepEqual(JSON.parse(call.options.body),{p_team:team,p_subject:user,p_kind:'soldier',p_scores:[0,1,2,3,5]});
 await f.api.joinTeam(team);
 assert.deepEqual(JSON.parse(f.calls.at(-1).options.body),{invite_code:team});
});
test('expired sessions share a single refresh request',async()=>{
 const f=fixture(url=>({body:url.includes('token?')?session:[]}));
 await f.api.signIn('a@example.invalid','password-test');
 const saved=JSON.parse(f.storage.getItem('squad-online-session-v1'));saved.expires_at=1;
 f.storage.setItem('squad-online-session-v1',JSON.stringify(saved));
 const api=createClient(config,{storage:f.storage,fetch:async(url,options)=>{
  f.calls.push({url,options});await new Promise(r=>setTimeout(r,10));
  return new Response(JSON.stringify(url.includes('token?')?session:[]));
 }});
 await Promise.all([api.teams(),api.teams()]);
 assert.equal(f.calls.filter(x=>x.url.endsWith('grant_type=refresh_token')).length,1);
});
test('401 clears the local session, safe auth errors do not echo private data',async()=>{
 const f=fixture(url=>url.includes('token?')?{body:session}:{status:401,body:{message:'sensitive diagnostic'}});
 await f.api.signIn('a@example.invalid','password-test');
 await assert.rejects(f.api.teams(),e=>!e.message.includes('sensitive'));
 assert.equal(f.api.hasSession(),false);
 const g=fixture(()=>({status:400,body:{error_code:'invalid_credentials',message:'private'}}));
 await assert.rejects(g.api.signIn('a','b'),/Email or password/);
});
test('signout clears this tab even when the server is unavailable',async()=>{
 const f=fixture(url=>{if(url.includes('logout'))throw new Error('offline');return {body:session}});
 await f.api.signIn('a@example.invalid','password-test');
 await assert.rejects(f.api.signOut(),/Network/);
 assert.equal(f.api.hasSession(),false);assert.equal(f.saved.size,0);
});
test('OAuth uses random PKCE and sends no privileged scopes',async()=>{
 const f=fixture(()=>({body:session}));
 const url=new URL(await f.api.startOAuth('github','https://denis7kom.github.io/SQUAD/#online'));
 assert.equal(url.searchParams.get('code_challenge_method'),'s256');
 assert.equal(url.searchParams.has('scopes'),false);
 assert.match(url.searchParams.get('code_challenge'),/^[a-zA-Z0-9_-]{43}$/);
 const verifier=f.storage.getItem('squad-online-pkce-v1');assert.equal(verifier.length,64);
 await f.api.finishOAuth('one-time-code');
 assert.equal(f.storage.getItem('squad-online-pkce-v1'),null);
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{auth_code:'one-time-code',code_verifier:verifier});
 await assert.rejects(f.api.finishOAuth('replay'),/expired/);
});
test('online UI never interpolates server content into HTML',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../online.js'),'utf8');
 assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML|eval\(/);
});
