/* SQUAD online API: no SDK or third-party scripts. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SquadOnline=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SESSION='squad-online-session-v1',VERIFIER='squad-online-pkce-v1';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function createClient(config,env={}){
    const url=new URL(config.url);
    if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password)
      throw new Error('Invalid Supabase project URL');
    const key=String(config.publishableKey||'');
    if(!key.startsWith('sb_publishable_')&&!/^eyJ/.test(key))throw new Error('A public Supabase key is required');
    if(key.startsWith('eyJ')){
      try{
        const payload=JSON.parse((env.atob||globalThis.atob)(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(payload.role!=='anon')throw new Error('Not an anon key');
      }catch(_){throw new Error('Only a publishable or anon key is allowed');}
    }
    const fetcher=env.fetch||globalThis.fetch;
    const storage=env.storage||globalThis.sessionStorage;
    let session=null,refreshing=null;
    try{session=JSON.parse(storage.getItem(SESSION)||'null')}catch(_){}
    function setSession(value){
      if(!value?.access_token||!value.refresh_token)throw new Error('Invalid authentication response');
      // OAuth provider tokens and user metadata are deliberately not persisted.
      session={access_token:value.access_token,refresh_token:value.refresh_token,
        expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)};
      storage.setItem(SESSION,JSON.stringify(session));
    }
    function clear(){session=null;storage.removeItem(SESSION);storage.removeItem(VERIFIER)}
    async function request(path,{method='GET',body,auth=false,headers={}}={}){
      if(auth)await ensureSession();
      let response;
      try{
        response=await fetcher(url.origin+path,{method,cache:'no-store',credentials:'omit',
          referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),
          headers:{apikey:key,...(body!==undefined?{'Content-Type':'application/json'}:{}),
            ...(auth?{Authorization:'Bearer '+session.access_token}:{}),...headers},
          ...(body!==undefined?{body:JSON.stringify(body)}:{})});
      }catch(_){throw new Error('Network unavailable or request timed out. No offline writes are queued.')}
      const data=response.status===204?null:await response.json().catch(()=>null);
      if(!response.ok){
        if(auth&&response.status===401)clear();
        // Auth errors are mapped; no raw request, tokens or personal data are logged.
        const codes={invalid_credentials:'Email or password is incorrect.',
          email_not_confirmed:'Confirm your email before signing in.',
          email_address_not_authorized:'Public email signup is not configured. Contact the organiser.',
          over_email_send_rate_limit:'Email rate limit reached. Try later.',
          signup_disabled:'Signup is disabled for this pilot.'};
        const message=codes[data?.error_code||data?.code]||
          (path.startsWith('/rest/')&&['Authentication required','Save your profile first','Team name must be 2 to 80 characters','Maximum five teams per account','Invitation is invalid','Team is full (50 members)','Owner access required','Access denied','The owner cannot leave the team','Team access required','Self reviews are not allowed','Player is not in this team'].includes(data?.message)?data.message:null)||'Request failed. Check your login and project configuration.';
        throw new Error(String(message).slice(0,220));
      }
      return data;
    }
    async function ensureSession(){
      if(!session)throw new Error('Sign in first');
      if(session.expires_at*1000>Date.now()+60000)return;
      if(!refreshing)refreshing=(async()=>{
        try{setSession(await request('/auth/v1/token?grant_type=refresh_token',
          {method:'POST',body:{refresh_token:session.refresh_token}}))}
        catch(error){clear();throw error}finally{refreshing=null}
      })();
      await refreshing;
    }
    function validId(id){if(!UUID.test(id))throw new Error('Invalid identifier');return id}
    const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',body,auth:true});
    return {
      hasSession:()=>!!session,
      async user(){return request('/auth/v1/user',{auth:true})},
      async signIn(email,password){setSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}))},
      async signUp(email,password){const data=await request('/auth/v1/signup',{method:'POST',body:{email,password}});
        if(data?.access_token)setSession(data);return !!data?.access_token},
      async signOut(){try{if(session)await request('/auth/v1/logout?scope=local',{method:'POST',auth:true})}finally{clear()}},
      async startOAuth(provider,redirect){
        if(!['github','discord'].includes(provider))throw new Error('Unsupported sign-in provider');
        const crypto=env.crypto||globalThis.crypto;
        const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
        const challenge=(env.btoa||globalThis.btoa)(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        const target=new URL(redirect);
        if(target.protocol!=='https:'&&target.hostname!=='localhost')throw new Error('HTTPS callback required');
        storage.setItem(VERIFIER,verifier);
        return url.origin+'/auth/v1/authorize?'+new URLSearchParams({provider,redirect_to:target.href,code_challenge:challenge,code_challenge_method:'s256'});
      },
      async finishOAuth(code){
        const verifier=storage.getItem(VERIFIER);
        if(!verifier)throw new Error('Sign-in expired. Start again in this tab.');
        try{setSession(await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:verifier}}))}
        finally{storage.removeItem(VERIFIER)}
      },
      profile:id=>request('/rest/v1/profiles?select=callsign&id=eq.'+validId(id),{auth:true}),
      saveProfile:async(id,callsign)=>{
        if(callsign.trim().length<2||callsign.trim().length>40)throw new Error('Callsign must be 2 to 40 characters');
        await request('/rest/v1/profiles?on_conflict=id',{method:'POST',auth:true,
          headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{id:validId(id),callsign:callsign.trim()}});
      },
      teams:()=>request('/rest/v1/teams?select=id,name,owner_id,created_at&order=created_at',{auth:true}),
      createTeam:team_name=>rpc('create_team',{team_name}),
      joinTeam:invite_code=>rpc('join_team',{invite_code:validId(invite_code.trim())}),
      roster:p_team=>rpc('team_roster',{p_team:validId(p_team)}),
      invite:p_team=>request('/rest/v1/team_invites?select=code&team_id=eq.'+validId(p_team),{auth:true}),
      rotateInvite:p_team=>rpc('rotate_team_invite',{p_team:validId(p_team)}),
      removeMember:(p_team,p_user)=>rpc('remove_team_member',{p_team:validId(p_team),p_user:validId(p_user)}),
      ownReviews:(team,subject)=>request('/rest/v1/member_reviews?select=kind,scores&team_id=eq.'+validId(team)+'&subject_id=eq.'+validId(subject),{auth:true}),
      saveReview:(p_team,p_subject,p_kind,p_scores)=>{
        if(!['commander','soldier','technical'].includes(p_kind)||!Array.isArray(p_scores)||p_scores.length!==5||p_scores.some(x=>!Number.isInteger(x)||x<0||x>5))
          throw new Error('Provide five scores from 0 to 5');
        return rpc('save_member_review',{p_team:validId(p_team),p_subject:validId(p_subject),p_kind,p_scores});
      }
    };
  }
  return {createClient};
});
