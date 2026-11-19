/* Online workspace. Untrusted values are always inserted with textContent. */
(()=>{
'use strict';
const host=document.getElementById('online-workspace');
if(!host)return;
let api,user,teams=[],selected='',roster=[],busy=false,own=[];
const lang=()=>document.getElementById('site-language')?.value==='en';
const t=(ru,en)=>lang()?en:ru;
const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node};
const labels={
commander:[['Коммуникация','Communication'],['Организация','Organisation'],['Тактика','Tactics'],['Взаимодействие','Cooperation'],['Отношение к игрокам','Treatment of players']],
soldier:[['Взаимодействие','Cooperation'],['Коммуникация','Communication'],['Тактика','Tactics'],['Надёжность','Reliability'],['Отношение к игрокам','Treatment of players']],
technical:[['Взаимодействие с экипажем','Crew cooperation'],['Управление техникой','Vehicle handling'],['Тактические решения','Tactical decisions'],['Коммуникация','Communication'],['Надёжность','Reliability']]};
const kindName=k=>({commander:t('Командир','Commander'),soldier:t('Боец','Soldier'),technical:t('Техника','Vehicle specialist')})[k];
const panel=(title,parent=host)=>{const p=el('div',undefined,{class:'panel online-panel'});p.append(el('h2',title));parent.append(p);return p};
function field(parent,label,{type='text',value='',...attrs}={}){
 const wrap=el('label',label),input=el('input',undefined,{type,...attrs});input.value=value;wrap.append(input);parent.append(wrap);return input;
}
function button(parent,label,handler,type='button'){
 const b=el('button',label,{type});b.disabled=busy;parent.append(b);if(handler)b.addEventListener('click',()=>run(handler));return b;
}
function message(text,error=false){
 const node=document.getElementById('online-message');
 node.textContent=text;node.setAttribute('role',error?'alert':'status');node.classList.toggle('online-error',error);
}
async function run(task){
 if(busy)return;
 busy=true;host.setAttribute('aria-busy','true');host.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{message(t('Подождите…','Please wait…'));await task()}
 catch(error){if(user&&!api.hasSession()){user=null;teams=[];roster=[];selected='';renderLogin()}message(error.message||t('Запрос не выполнен','Request failed'),true)}
 finally{busy=false;host.removeAttribute('aria-busy');host.querySelectorAll('button').forEach(b=>b.disabled=false)}
}
function form(parent,submit){
 const f=el('form',undefined,{class:'online-form'});parent.append(f);
 f.addEventListener('submit',event=>{event.preventDefault();run(()=>submit(f))});return f;
}
function header(){
 host.replaceChildren();
 host.append(el('h1',t('Общие команды','Online teams')));
 host.append(el('p',t('Здесь состав и оценки синхронизируются между участниками команды. Звания, выборы и жалобы в других разделах пока работают локально.',
  'Team rosters and ratings here are shared with teammates. Ranks, elections and complaints in other sections still work locally.')));
 host.append(el('p','',{id:'online-message',role:'status','aria-live':'polite'}));
}
function renderLogin(){
 header();
 const p=panel(t('Вход в аккаунт','Sign in'));
 const f=form(p,async()=>{
   await api.signIn(email.value,password.value);password.value='';await loadAccount();
 });
 const email=field(f,'Email',{type:'email',required:'',autocomplete:'email',maxlength:'254'});
 const password=field(f,t('Пароль','Password'),{type:'password',required:'',autocomplete:'current-password',minlength:'8',maxlength:'128'});
 button(f,t('Войти','Sign in'),null,'submit');
 // Registration is exposed only when deployment explicitly enables its email provider.
 if(window.SQUAD_CONFIG.emailSignup){
  button(f,t('Создать аккаунт','Create account'),async()=>{
   if(!f.reportValidity())return;
   const signedIn=await api.signUp(email.value,password.value);password.value='';
   if(signedIn)await loadAccount();else message(t('Подтвердите адрес по письму, затем войдите.','Confirm the email, then sign in.'));
  });
 }
 for(const provider of window.SQUAD_CONFIG.oauthProviders||[]){
  if(['github','discord'].includes(provider))button(p,t('Войти через ','Continue with ')+provider,async()=>{
   const callback=new URL(location.pathname,location.origin);callback.hash='online';
   location.assign(await api.startOAuth(provider,callback.href));
  });
 }
 p.append(el('p',t('Сессия хранится в этой вкладке. Не передавайте пароль или коды приглашений посторонним.',
   'Your session is kept in this tab. Keep your password and invitation codes private.')));
 if(!window.SQUAD_CONFIG.emailSignup)p.append(el('p',t('Открытая регистрация по почте пока выключена. Используйте включённый способ входа или обратитесь к организатору.',
  'Public email signup is not enabled yet. Use an enabled sign-in provider or contact the organiser.')));
}
async function loadAccount(){
 user=await api.user();
 teams=await api.teams();
 if(!teams.some(x=>x.id===selected))selected=teams[0]?.id||'';
 roster=selected?await api.roster(selected):[];
 const profile=await api.profile(user.id);
 renderAccount(profile[0]?.callsign||'');
}
function renderAccount(callsign){
 header();
 button(host,t('Обновить общие данные','Refresh shared data'),loadAccount);
 const account=panel(t('Мой профиль','My profile'));
 const f=form(account,async()=>{await api.saveProfile(user.id,name.value);await loadAccount();message(t('Профиль сохранён.','Profile saved.'))});
 const name=field(f,t('Позывной (виден участникам ваших команд)','Callsign (visible to your teammates)'),{value:callsign,required:'',minlength:'2',maxlength:'40',autocomplete:'nickname'});
 button(f,t('Сохранить профиль','Save profile'),null,'submit');
 button(account,t('Выйти','Sign out'),async()=>{
  try{await api.signOut()}finally{user=null;teams=[];roster=[];selected='';renderLogin()}
 });
 const manage=panel(t('Мои команды','My teams'));
 const create=form(manage,async()=>{
  selected=await api.createTeam(teamName.value);await loadAccount();message(t('Команда создана.','Team created.'));
 });
 const teamName=field(create,t('Название новой команды','New team name'),{required:'',minlength:'2',maxlength:'80'});
 button(create,t('Создать команду','Create team'),null,'submit');
 const join=form(manage,async()=>{
  selected=await api.joinTeam(code.value);await loadAccount();message(t('Вы вступили в команду.','You joined the team.'));
 });
 const code=field(join,t('Код приглашения','Invitation code'),{required:'',maxlength:'36',spellcheck:'false',autocomplete:'off'});
 button(join,t('Вступить','Join team'),null,'submit');
 manage.append(el('p',t('До 5 команд на аккаунт и до 50 участников в команде. Сначала сохраните профиль.',
  'Up to 5 teams per account and 50 members per team. Save your profile first.')));
 if(!teams.length){manage.append(el('p',t('Создайте команду или получите приглашение у владельца.','Create a team or ask its owner for an invitation.')));return}
 const choose=el('label',t('Команда','Team')),select=el('select');
 for(const team of teams){const option=el('option',team.name,{value:team.id});select.append(option)}
 select.value=selected;choose.append(select);manage.append(choose);
 select.addEventListener('change',()=>run(async()=>{selected=select.value;await loadAccount()}));
 const current=teams.find(x=>x.id===selected),isOwner=current.owner_id===user.id;
 const actions=panel(t('Управление командой','Team management'));
 if(isOwner){
  const invite=el('output','',{class:'online-code'});actions.append(invite);
  button(actions,t('Показать приглашение','Show invitation'),async()=>{
   const rows=await api.invite(selected);invite.textContent=rows[0]?.code||'';
   message(t('Любой получивший код сможет вступить. Делитесь им лично.','Anyone with the code can join. Share it privately.'));
  });
  button(actions,t('Заменить код приглашения','Replace invitation code'),async()=>{
   if(!confirm(t('Старый код больше не будет действовать. Заменить?','The old code will stop working. Replace it?')))return;
   invite.textContent=await api.rotateInvite(selected);message(t('Код заменён.','Invitation replaced.'));
  });
 }else button(actions,t('Покинуть команду','Leave team'),async()=>{
  if(!confirm(t('Выйти? Ваши оценки в этой команде будут удалены.','Leave? Your reviews in this team will be removed.')))return;
  await api.removeMember(selected,user.id);await loadAccount();
 });
 const people=panel(t('Участники и общие оценки','Members and shared ratings'));
 const list=el('ul',undefined,{class:'online-roster'});people.append(list);
 for(const member of roster){
  const li=el('li');li.append(el('strong',member.callsign));
  li.append(el('span',member.role==='owner'?t('Владелец','Owner'):t('Участник','Member')));
  for(const kind of ['commander','soldier','technical']){
   const score=member.ratings[kind];li.append(el('span',kindName(kind)+': '+(score?score.score+' / 25 · '+score.count+t(' отзывов',' reviews'):'—')));
  }
  if(isOwner&&member.user_id!==user.id)button(li,t('Исключить','Remove'),async()=>{
   if(!confirm(t('Исключить участника и удалить связанные с ним оценки?','Remove this member and their associated reviews?')))return;
   await api.removeMember(selected,member.user_id);await loadAccount();
  });
  list.append(li);
 }
 if(roster.some(x=>x.user_id!==user.id))renderReview();
}
function renderReview(){
 const p=panel(t('Оценить участника','Review a teammate'));
 const f=form(p,async()=>{
  await api.saveReview(selected,subject.value,kind.value,Array.from(criteria.querySelectorAll('select'),x=>Number(x.value)));
  await loadAccount();message(t('Оценка сохранена. Повторная отправка заменяет вашу оценку этого типа.','Review saved. Submitting again replaces your review of this type.'));
 });
 const subjectLabel=el('label',t('Участник','Member')),subject=el('select');
 for(const member of roster.filter(x=>x.user_id!==user.id))subject.append(el('option',member.callsign,{value:member.user_id}));
 subjectLabel.append(subject);f.append(subjectLabel);
 const kindLabel=el('label',t('Тип оценки','Review type')),kind=el('select');
 for(const key of Object.keys(labels))kind.append(el('option',kindName(key),{value:key}));
 kindLabel.append(kind);f.append(kindLabel);
 const criteria=el('div');f.append(criteria);
 function draw(){
  criteria.replaceChildren();
  const previous=own.find(x=>x.kind===kind.value);
  labels[kind.value].forEach(([ru,en],i)=>{
   const label=el('label',t(ru,en)),select=el('select',undefined,{'aria-label':t(ru,en)});
   for(let score=0;score<=5;score++)select.append(el('option',String(score),{value:score}));
   select.value=String(previous?.scores[i]??3);label.append(select);criteria.append(label);
  });
 }
 async function existing(){own=await api.ownReviews(selected,subject.value);draw();message('')}
 subject.addEventListener('change',()=>run(existing));
 kind.addEventListener('change',draw);
 own=[];draw();
 button(f,t('Сохранить оценку','Save review'),null,'submit');
 p.append(el('p',t('Один отзыв каждого типа от автора на игрока в команде. Самооценка запрещена. Среднее и число отзывов вычисляет сервер.',
  'One review per author, player, team and type. No self reviews. The server calculates averages and counts.')));
 // Fetch lazily on explicit request to keep account rendering deterministic.
 button(p,t('Загрузить мою сохранённую оценку','Load my saved review'),existing);
}
async function boot(){
 header();
 const config=window.SQUAD_CONFIG||{};
 if(!config.url||!config.publishableKey){
  panel(t('Подключение готовится','Connection pending')).append(el('p',t('Общий сервер ещё не настроен. Здесь нельзя зарегистрироваться или отправить данные. Локальные разделы доступны.',
   'The shared server is not configured yet. Signup and data submission are unavailable here. Local sections remain available.')));
  return;
 }
 try{
  api=window.SquadOnline.createClient(config);
  const params=new URLSearchParams(location.search),code=params.get('code');
  if(code){
   params.delete('code');
   history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+'#online');
   await api.finishOAuth(code);
  }
  if(api.hasSession())await loadAccount();else renderLogin();
 }catch(error){if(api)renderLogin();message(error.message,true)}
}
document.getElementById('site-language')?.addEventListener('change',()=>{
 if(busy)return;
 if(user)run(loadAccount);else boot();
});
window.addEventListener('online',()=>message(t('Сеть восстановлена. Обновите данные команды.','Connection restored. Refresh your team data.')));
window.addEventListener('offline',()=>message(t('Нет сети. Общие данные недоступны; изменения не ставятся в очередь.','Offline. Shared data is unavailable; changes are not queued.'),true));
document.querySelector('[data-view="online"]')?.addEventListener('click',()=>{history.replaceState(null,'',location.pathname+location.search+'#online')});
boot().then(()=>{if(location.hash==='#online')goto('online')});
})();
