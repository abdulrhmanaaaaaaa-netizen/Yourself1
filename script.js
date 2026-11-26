const { supabaseConfigured, signInWithPassword, signUpWithPassword, sendPasswordRecovery, signOut, getSession, consumeRecoveryLink, updatePassword, getUserProfile, updateUserProfile, getUserPayload, saveUserPayload, isDeveloper, getAvatarUrl, uploadAvatar, removeAvatar, adminListProfiles, adminSetProfileStatus, getSupportConversations, createSupportConversation, getSupportMessages, sendSupportMessage, adminSetSupportStatus, createUserNotification, getUserNotifications, markNotificationRead, deleteAccount, readableAuthError } = window.YSBackend;

const MAX_LENGTH = 120;
const MAX_TOKENS = 80;
const MAX_VALUE = 1e15;

function evaluateExpression(input) {
  const source = String(input ?? '')
    .replace(/[×x]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '');

  if (!source || source.length > MAX_LENGTH) throw new Error('صيغة العملية غير صالحة.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+|[()+\-*/%])/g) || [];
  if (tokens.join('') !== source || tokens.length > MAX_TOKENS) throw new Error('صيغة العملية غير صالحة.');

  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const finite = value => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) throw new Error('النتيجة خارج النطاق.');
    return value;
  };

  function primary() {
    if (peek() === '(') {
      take();
      const value = expression();
      if (take() !== ')') throw new Error('قوس غير مغلق.');
      return value;
    }
    const token = take();
    if (!token || !/^\d+(?:\.\d*)?$|^\.\d+$/.test(token)) throw new Error('أدخل رقمًا صالحًا.');
    return finite(Number(token));
  }

  function postfix() {
    let value = primary();
    while (peek() === '%') {
      take();
      value = finite(value / 100);
    }
    return value;
  }

  function unary() {
    if (peek() === '+') { take(); return unary(); }
    if (peek() === '-') { take(); return finite(-unary()); }
    return postfix();
  }

  function product() {
    let value = unary();
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const right = unary();
      if (op === '/' && right === 0) throw new Error('لا يمكن القسمة على صفر.');
      value = finite(op === '*' ? value * right : value / right);
    }
    return value;
  }

  function expression() {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const right = product();
      value = finite(op === '+' ? value + right : value - right);
    }
    return value;
  }

  const result = expression();
  if (index !== tokens.length) throw new Error('صيغة العملية غير مكتملة.');
  const rounded = Number(result.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

const WEEKS_PER_MONTH = 52 / 12;

function scheduledHours(profile = {}) {
  const [sh = 0, sm = 0] = String(profile.workStart || '00:00').split(':').map(Number);
  const [eh = 0, em = 0] = String(profile.workEnd || '00:00').split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

function hourlyRate(profile = {}) {
  const income = Number(profile.salary);
  if (!Number.isFinite(income) || income <= 0) return 0;
  if (profile.salaryType === 'hourly') return income;
  const days = Number(profile.workDays);
  const hours = scheduledHours(profile);
  if (!Number.isFinite(days) || days < 1 || days > 7 || hours <= 0 || hours > 24) return 0;
  return income / (days * WEEKS_PER_MONTH * hours);
}

function earningsForHours(profile, hours) {
  const duration = Number(hours);
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return hourlyRate(profile) * duration;
}

function splitEarningsByDate(start, end, rate) {
  const from = new Date(start);
  const to = new Date(end);
  const hourly = Number(rate);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || !Number.isFinite(hourly) || hourly < 0) {
    throw new RangeError('Invalid session range or hourly rate.');
  }

  const daily = {};
  for (let cursor = new Date(from); cursor < to;) {
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    if (midnight <= cursor) throw new RangeError('Invalid local date boundary.');
    const segmentEnd = new Date(Math.min(to.getTime(), midnight.getTime()));
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    daily[key] = (daily[key] || 0) + hourly * ((segmentEnd - cursor) / 3600000);
    cursor = segmentEnd;
  }
  return daily;
}

window.YSCore = { evaluateExpression, hourlyRate, splitEarningsByDate };

(() => {
'use strict';

const PK = 'yfs_v17_pref';

const $ = id => document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const safeInlineId = value => {const id=String(value??'');return /^[A-Za-z0-9_-]{1,64}$/.test(id)?id:'';};
const emailOf = x => String(x||'').trim().toLowerCase();
const dk = (d=new Date()) => {const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fM = n => (Math.round(Number(n)||0)).toLocaleString('en-US');
const fMoney = n => (Math.round(Number(n)||0)).toLocaleString('en-US') + ' EGP';
const dAr = d => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d));
const shAr = d => new Intl.DateTimeFormat('ar-EG',{day:'2-digit',month:'2-digit'}).format(new Date(d));
const dayName = d => new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(new Date(d));
const tM = t => {const[h,m]=String(t||'00:00').split(':').map(Number);return(h||0)*60+(m||0);};
const hB = (a,b) => {let x=tM(a),y=tM(b);if(y<x)y+=1440;return(y-x)/60;};

const gP = () => {try{return JSON.parse(localStorage.getItem(PK)||'{}');}catch{return{};}};
const sP = p => localStorage.setItem(PK, JSON.stringify(p));

const S = {user:null,isDev:false,page:'home',mFilter:'all',nFilter:'all',nSearch:'',exFilter:'all',dFilter:'pending',devProfiles:[],supportProfiles:[],supportProfilesAt:0,supportConversations:[],supportId:null,supportBusy:false,supportTimer:null,notificationTimer:null,pDate:new Date(),focus:{s:1500,r:false,i:null},tick:null,wiz:1,tempAcc:null,calcExp:'',calcHistory:[],dialogTrigger:null,avatarUrl:'',saveQueue:Promise.resolve(),autoEarningBusy:false,autoEarningRetryAt:0};

const defProf = () => ({job:'',salaryType:'monthly',salary:0,workDays:5,workStart:'08:30',workEnd:'17:00',offDays:'الجمعة، السبت',wake:'07:00',sleep:'23:00',goal:'تنظيم الوقت',activity:'moderate',age:'',weight:'',height:'',calorieGoal:2000,waterGoal:8,budget:{}});
const defHabits = () => {const d=dk();return[{id:'water',title:'الماء',meta:'الترطيب',done:false,date:d},{id:'move',title:'حركة بسيطة',meta:'مشي أو تمدد',done:false,date:d},{id:'meal',title:'وجبة متوازنة',meta:'اختيار متنوع',done:false,date:d},{id:'sleep',title:'نوم منتظم',meta:'',done:false,date:d}];};
const newU = (o={}) => ({id:'',name:'',email:'',createdAt:new Date().toISOString(),lastAutoEarningsDate:'',profile:defProf(),finance:[],notes:[],planner:[],workControl:null,dailyEarnings:{},habits:defHabits(),healthPlan:'balanced',workouts:[],meals:[],waterLog:{},...o});

function normU(u){
  if(!u)return null;
  const base=newU(), today=dk();
  let habits=Array.isArray(u.habits)&&u.habits.length?u.habits:base.habits;
  if(habits[0]&&habits[0].date!==today)habits=habits.map(h=>({...h,done:false,date:today}));
  return {...base,...u,profile:{...base.profile,...(u.profile||{})},finance:Array.isArray(u.finance)?u.finance:[],notes:Array.isArray(u.notes)?u.notes:[],planner:Array.isArray(u.planner)?u.planner:[],habits,workouts:Array.isArray(u.workouts)?u.workouts:[],meals:Array.isArray(u.meals)?u.meals:[],waterLog:u.waterLog||{},workControl:u.workControl||null,dailyEarnings:(u.dailyEarnings&&typeof u.dailyEarnings==='object')?u.dailyEarnings:{}};
}
function payloadOf(user){
  const payload=structuredClone(user);
  ['id','email','name','createdAt','role','status','password','avatarPath','avatarUrl'].forEach(k=>delete payload[k]);
  return payload;
}
function saveU(patch){
  if(!S.user)return;
  S.user=normU({...S.user,...patch});
  const userId=S.user.id;
  const payload=payloadOf(S.user);
  if($('syncStatus'))$('syncStatus').textContent='جار الحفظ…';
  const request=S.saveQueue.catch(()=>{}).then(()=>saveUserPayload(userId,payload)).then(()=>{
    if(S.user?.id===userId&&$('syncStatus'))$('syncStatus').textContent='تمت المزامنة';
  });
  S.saveQueue=request.catch(()=>{
    if(S.user?.id===userId&&$('syncStatus'))$('syncStatus').textContent='تعذر الحفظ';
    toast('تعذّر حفظ التغييرات. تحقّق من الاتصال وحاول مرة أخرى.');
  });
  return request;
}

const offM = {'الأحد':0,'الاحد':0,'sunday':0,'الاثنين':1,'الإثنين':1,'monday':1,'الثلاثاء':2,'tuesday':2,'الأربعاء':3,'الاربعاء':3,'wednesday':3,'الخميس':4,'thursday':4,'الجمعة':5,'friday':5,'السبت':6,'saturday':6};
function offIdx(){const r=String(S.user?.profile?.offDays||'').toLowerCase();return[...new Set(r.split(/[،,;؛+\/|]+/).map(s=>s.trim()).filter(s=>offM[s]!==undefined).map(s=>offM[s]))];}
function isWorkday(d=new Date()){if(!S.user)return false;const o=offIdx();if(o.length)return!o.includes(d.getDay());const n=Number(S.user.profile.workDays)||5;if(n>=7)return true;return d.getDay()>=1&&d.getDay()<=Math.min(n,6);}
function workWin(d=new Date()){const p=S.user.profile;const s=new Date(d);s.setHours(Math.floor(tM(p.workStart)/60),tM(p.workStart)%60,0,0);const e=new Date(d);e.setHours(Math.floor(tM(p.workEnd)/60),tM(p.workEnd)%60,0,0);if(e<=s)e.setDate(e.getDate()+1);return{start:s,end:e};}
function hourRate(){return S.user?hourlyRate(S.user.profile):0;}
function scheduledEarningsForCalendarDay(day){
  const startOfDay=new Date(day);startOfDay.setHours(0,0,0,0);
  const endOfDay=new Date(startOfDay);endOfDay.setDate(endOfDay.getDate()+1);
  let hours=0;
  for(const offset of [-1,0]){
    const shiftDay=new Date(startOfDay);shiftDay.setDate(shiftDay.getDate()+offset);
    if(!isWorkday(shiftDay))continue;
    const shift=workWin(shiftDay);
    const overlap=Math.max(0,Math.min(endOfDay,shift.end)-Math.max(startOfDay,shift.start));
    hours+=overlap/3600000;
  }
  return hourRate()*hours;
}
async function syncAutoEarnings(){
  if(!S.user||S.autoEarningBusy||Date.now()<S.autoEarningRetryAt)return;
  const today=dk(),userId=S.user.id;
  const previousMarker=String(S.user.lastAutoEarningsDate||'');
  const markerDate=new Date(`${previousMarker}T00:00:00`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(previousMarker)||previousMarker>today||!Number.isFinite(markerDate.getTime())||dk(markerDate)!==previousMarker){
    try{await saveU({lastAutoEarningsDate:today});}
    catch{if(S.user?.id===userId)S.user.lastAutoEarningsDate='';S.autoEarningRetryAt=Date.now()+60000;}
    return;
  }
  if(previousMarker===today)return;
  S.autoEarningBusy=true;
  const dailyEarnings={...(S.user.dailyEarnings||{})};
  const start=new Date(`${previousMarker}T00:00:00`),end=new Date(`${today}T00:00:00`);
  let scanned=0,changed=false;
  try{
    for(let day=new Date(start);day<end&&scanned<3660;day.setDate(day.getDate()+1),scanned++){
      const key=dk(day);
      if(Object.prototype.hasOwnProperty.call(dailyEarnings,key))continue;
      const amount=scheduledEarningsForCalendarDay(day);
      if(Number.isFinite(amount)&&amount>0&&S.user.workControl?.startedAt&&!S.user.workControl?.stoppedAt){
        const manualStart=new Date(S.user.workControl.startedAt);
        if(Number.isFinite(manualStart.getTime())&&day>=new Date(manualStart.getFullYear(),manualStart.getMonth(),manualStart.getDate()))continue;
      }
      if(Number.isFinite(amount)&&amount>0){dailyEarnings[key]=amount;changed=true;}
    }
    await saveU({dailyEarnings,lastAutoEarningsDate:today});
    S.autoEarningRetryAt=0;
    if(changed){renderHome();renderWork();renderMoney();}
  }catch{
    if(S.user?.id===userId)S.user.lastAutoEarningsDate=previousMarker;
    S.autoEarningRetryAt=Date.now()+60000;
  }finally{S.autoEarningBusy=false;}
}

function calcToday(){
  if(!S.user)return{h:0,e:0,locked:true,mode:'off'};
  const now=new Date();
  const rate=hourRate();
  const mc=S.user.workControl;
  if(mc?.startedAt){
    const ms=new Date(mc.startedAt);
    if(mc.stoppedAt&&(mc.stoppedDate||mc.date)===dk())return{h:0,e:0,locked:true,mode:'manual'};
    if(!mc.stoppedAt){
      if(!Number.isFinite(ms.getTime()))return{h:0,e:0,locked:true,mode:'manual'};
      const midnight=new Date(now);midnight.setHours(0,0,0,0);
      const segmentStart=Math.max(ms.getTime(),midnight.getTime());
      const hrs=Math.max(0,(now.getTime()-segmentStart)/3600000);
      const savedRate=Number(mc.hourlyRate);
      return{h:hrs,e:(Number.isFinite(savedRate)&&savedRate>0?savedRate:rate)*hrs,locked:false,mode:'manual',running:true};
    }
  }
  const profile=S.user.profile;
  let previousHours=0,previousRunning=false,hasPreviousShift=false,previousFinished=false;
  if(tM(profile.workEnd)<tM(profile.workStart)){
    const previousDay=new Date(now);previousDay.setDate(previousDay.getDate()-1);
    if(isWorkday(previousDay)){
      const previous=workWin(previousDay);
      const midnight=new Date(now);midnight.setHours(0,0,0,0);
      if(now>=previous.start&&midnight<previous.end){
        const segmentStart=Math.max(previous.start.getTime(),midnight.getTime());
        const segmentEnd=Math.min(now.getTime(),previous.end.getTime());
        previousHours=Math.max(0,(segmentEnd-segmentStart)/3600000);
        previousRunning=now<previous.end;
        previousFinished=!previousRunning;
        hasPreviousShift=true;
      }
    }
  }
  if(!isWorkday(now)){
    if(hasPreviousShift)return{h:previousHours,e:rate*previousHours,locked:previousFinished,mode:'auto',running:previousRunning};
    return{h:0,e:0,locked:true,mode:'off'};
  }
  const{start,end}=workWin(now);
  if(now<start)return{h:previousHours,e:rate*previousHours,locked:false,mode:'auto',running:previousRunning};
  if(now>=end){
    const hours=Math.max(0,(end-start)/3600000);
    return{h:previousHours+hours,e:rate*(previousHours+hours),locked:true,mode:'auto',running:false};
  }
  const hrs=(now-start)/3600000;
  return{h:previousHours+hrs,e:rate*(previousHours+hrs),locked:false,mode:'auto',running:true};
}

function totalCollected(){const e=S.user?.dailyEarnings||{};return Object.values(e).reduce((a,b)=>a+(Number(b)||0),0);}
function grandTotal(){return totalCollected()+calcToday().e;}
function monthCollected(){
  if(!S.user)return 0;
  const now=new Date();
  const prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const e=S.user.dailyEarnings||{};
  return Object.entries(e).filter(([k])=>k.startsWith(prefix)).reduce((a,[,v])=>a+(Number(v)||0),0);
}
function todayStatus(){
  const s=calcToday();
  if(s.mode==='off')return{state:'إجازة اليوم',meta:'لا يوجد احتساب',...s};
  if(s.mode==='manual'&&!s.locked)return{state:'عمل يدوي جارٍ',meta:'الجلسة محفوظة',...s};
  if(s.locked)return{state:'انتهى وقت العمل',meta:'اكتمل مكسب اليوم',...s};
  if(s.mode==='auto'&&s.running)return{state:'يعمل تلقائيًا',meta:`يتوقف ${S.user.profile.workEnd}`,...s};
  const p=S.user.profile;
  const{start}=workWin();
  const n=new Date();
  if(n<start)return{state:'قبل بداية العمل',meta:`يبدأ ${p.workStart}`,...s};
  return{state:'يعمل تلقائيًا',meta:`يتوقف ${p.workEnd}`,...s};
}
function monthProgress(){
  if(!S.user)return 0;
  const n=new Date();
  const first=new Date(n.getFullYear(),n.getMonth(),1);
  const last=new Date(n.getFullYear(),n.getMonth()+1,0);
  let sc=0,el=0;
  for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1)){
    const dt=new Date(d);
    if(!isWorkday(dt))continue;
    const{start,end}=workWin(dt);
    sc+=end-start;
    if(dk(dt)<dk(n))el+=end-start;
    else if(dk(dt)===dk(n))el+=Math.max(0,Math.min(n,end)-start);
  }
  return sc?Math.min(100,Math.round(el/sc*100)):0;
}

function toast(t){
  const e=document.createElement('div');
  e.className='toast';e.textContent=t;
  $('toast').appendChild(e);
  setTimeout(()=>e.remove(),3000);
}
function shMsg(id,t,ty='error'){const e=$(id);if(!e)return;e.textContent=t;e.className='msg '+ty;}
function dlg(title,desc,body){
  const m=$('modal');
  if(m.classList.contains('hidden')){
    S.dialogTrigger=document.activeElement;
    $('s-app').inert=true;
  }
  m.classList.remove('hidden');
  m.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="dhead"><div><span class="eyebrow">YOURSELF</span><h3 id="dialogTitle" tabindex="-1">${esc(title)}</h3>${desc?`<p style="font-size:12.5px;color:var(--ink3);margin-top:3px">${esc(desc)}</p>`:''}</div><button class="dclose" aria-label="إغلاق النافذة" onclick="YS.closeDlg()">×</button></div>${body}</div>`;
  requestAnimationFrame(()=>m.querySelector('#dialogTitle')?.focus());
}
function closeDlg(){const m=$('modal');m.classList.add('hidden');m.innerHTML='';$('s-app').inert=false;if(S.dialogTrigger?.isConnected)S.dialogTrigger.focus();S.dialogTrigger=null;}
function setTheme(n){
  document.documentElement.className='';
  if(n&&n!=='teal')document.documentElement.classList.add('theme-'+n);
  const p=gP();p.theme=n;sP(p);
  $$('.theme-tile').forEach(b=>b.classList.toggle('on',b.dataset.theme===n));
}

/* DRAWER */
function openDrawer(){
  $('drawer').classList.add('open');
  $('drawer').inert=false;$('drawer').setAttribute('aria-hidden','false');$('hamBtn').setAttribute('aria-expanded','true');
  $('drawerOverlay').classList.add('open');
  $('hamBtn').classList.add('active');
  requestAnimationFrame(()=>$('drawer').querySelector('.dr-item:not(.hidden)')?.focus());
}
function closeDrawer(){
  const wasOpen=$('drawer').classList.contains('open');
  $('drawer').classList.remove('open');
  $('drawer').inert=true;$('drawer').setAttribute('aria-hidden','true');$('hamBtn').setAttribute('aria-expanded','false');
  $('drawerOverlay').classList.remove('open');
  $('hamBtn').classList.remove('active');
  if(wasOpen)$('hamBtn').focus();
}
function toggleDrawer(){
  if($('drawer').classList.contains('open'))closeDrawer();
  else openDrawer();
}

function hideAll(){['s-login','s-signup','s-recovery','s-pending','s-app'].forEach(i=>$(i)?.classList.add('hidden'));}
function showLogin(){hideAll();$('s-login').classList.remove('hidden');$('lEmail').value='';$('lPass').value='';shMsg('lMsg','');}
function showSignup(){hideAll();$('s-signup').classList.remove('hidden');$('f-account').classList.remove('hidden');$('f-wizard').classList.add('hidden');shMsg('aMsg','');shMsg('wMsg','');}
function showRecovery(){hideAll();$('s-recovery').classList.remove('hidden');$('rPass').value='';$('rPass2').value='';shMsg('rMsg','');$('rPass').focus();}
function showWizard(){$('f-account').classList.add('hidden');$('f-wizard').classList.remove('hidden');setWiz(1);shMsg('wMsg','');}
function showPending(email,status='pending',message=''){
  hideAll();$('s-pending').classList.remove('hidden');$('pendEmail').textContent=email||'—';
  const rejected=status==='rejected';
  $('pendTitle').textContent=rejected?'تم رفض طلب الوصول':'حسابك قيد المراجعة';
  $('pendDesc').textContent=message||(rejected?'تواصل مع مسؤول الموقع إذا كنت تعتقد أن هذا القرار غير صحيح.':'بعد تسجيل الدخول، ينتظر الحساب موافقة المطوّر.');
  $('pendStatus').textContent=rejected?'مرفوض':'قيد المراجعة';
  $('pendStatus').className=rejected?'st-tag rejected':'st-pend';
}
function showApp(u,isDev=false){
  S.user=normU(u);
  S.isDev=Boolean(isDev);
  S.avatarUrl=u.avatarUrl||'';
  hideAll();
  $('s-app').classList.remove('hidden');
  $('drDev').classList.toggle('hidden',!S.isDev);
  $('syncStatus').textContent='متصل';
  renderAll();
  go('home');
  startTick();
}
async function openUserSession(authUser){
  if(!authUser?.id)throw new Error('AUTH_USER_MISSING');
  const profile=await getUserProfile(authUser.id);
  if(!profile)throw new Error('PROFILE_NOT_READY');
  if(profile.account_status!=='approved'){
    showPending(authUser.email,profile.account_status);
    return;
  }
  const stored=await getUserPayload(authUser.id);
  const seed=stored?.payload||authUser.user_metadata?.app_payload||{};
  const app=normU({...seed,id:authUser.id,email:authUser.email||profile.email,name:profile.full_name,createdAt:profile.created_at,avatarPath:profile.avatar_path||''});
  if(!stored)await saveUserPayload(authUser.id,payloadOf(app));
  const dev=await isDeveloper(authUser.id);
  try{app.avatarUrl=await getAvatarUrl(profile.avatar_path||'');}catch{app.avatarUrl='';}
  showApp(app,dev);
}
async function logout(){
  await S.saveQueue.catch(()=>{});
  let remoteLogoutFailed=false;
  if(supabaseConfigured){try{const result=await signOut();remoteLogoutFailed=Boolean(result?.error);}catch{remoteLogoutFailed=true;}}
  clearAppTimers();S.user=null;S.isDev=false;S.avatarUrl='';S.supportId=null;S.supportConversations=[];S.supportProfiles=[];S.supportProfilesAt=0;S.devProfiles=[];closeDlg();closeDrawer();showLogin();
  if(remoteLogoutFailed)toast('تم تسجيل الخروج من هذا الجهاز؛ تعذّر إبطال الجلسة على الخادم.');
}
function clearAppTimers(){
  ['tick','supportTimer','notificationTimer'].forEach(key=>{if(S[key])clearInterval(S[key]);S[key]=null;});
  if(S.focus.i)clearInterval(S.focus.i);S.focus.i=null;S.focus.r=false;S.focus.s=1500;
  S.autoEarningRetryAt=0;
}

async function doLogin(e){
  e.preventDefault();
  const em=emailOf($('lEmail').value);
  const pw=$('lPass').value;
  if(!em||!pw)return shMsg('lMsg','أدخل البريد وكلمة المرور.');
  const submit=document.querySelector('#f-login button[type="submit"]');submit.disabled=true;
  try{const {data}=await signInWithPassword(em,pw);await openUserSession(data.user);}
  catch(error){shMsg('lMsg',readableAuthError(error));}
  finally{submit.disabled=false;}
}
async function doForgotPassword(){
  const em=emailOf($('lEmail').value);
  if(!em||!/\S+@\S+\.\S+/.test(em))return shMsg('lMsg','اكتب بريدًا إلكترونيًا صالحًا لاستعادة كلمة المرور.');
  const button=$('forgotPassword');button.disabled=true;
  try{
    await sendPasswordRecovery(em);
    shMsg('lMsg','إذا كان البريد مسجلًا، ستصلك رسالة تحتوي على رابط آمن لتغيير كلمة المرور.','success');
  }catch(error){
    if(error?.message==='SUPABASE_NOT_CONFIGURED')shMsg('lMsg',readableAuthError(error));
    else shMsg('lMsg','تعذّر إرسال رابط استعادة كلمة المرور الآن. حاول مرة أخرى بعد قليل.');
  }finally{button.disabled=false;}
}
async function doPasswordRecovery(e){
  e.preventDefault();
  const password=$('rPass').value,confirmPassword=$('rPass2').value;
  if(password.length<10)return shMsg('rMsg','كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
  if(password!==confirmPassword)return shMsg('rMsg','تأكيد كلمة المرور غير مطابق.');
  const submit=document.querySelector('#f-recovery button[type="submit"]');submit.disabled=true;
  try{
    await updatePassword(password);
    try{await signOut();}catch{}
    showLogin();
    shMsg('lMsg','تم تحديث كلمة المرور. سجّل الدخول باستخدامها الآن.','success');
  }catch(error){shMsg('rMsg',readableAuthError(error));}
  finally{submit.disabled=false;}
}
function doAccount(e){
  e.preventDefault();
  const n=$('aName').value.trim(),em=emailOf($('aEmail').value),p=$('aPass').value,p2=$('aPass2').value;
  if(!n)return shMsg('aMsg','اكتب اسمك.');
  if(!em||!/\S+@\S+\.\S+/.test(em))return shMsg('aMsg','بريد غير صالح.');
  if(p.length<10)return shMsg('aMsg','كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
  if(p!==p2)return shMsg('aMsg','التأكيد غير مطابق.');
  if(!supabaseConfigured)return shMsg('aMsg','الخدمة غير متاحة مؤقتًا. يُرجى المحاولة لاحقًا.','info');
  S.tempAcc={name:n,email:em,password:p};
  showWizard();
}
function setWiz(s){
  S.wiz=s;
  $$('.pane').forEach(p=>p.classList.toggle('on',+p.dataset.pane===s));
  $('wPrev').disabled=s===1;
  $('wNext').classList.toggle('hidden',s===3);
  $('wFinish').classList.toggle('hidden',s!==3);
  shMsg('wMsg','');
}
function wizNext(){
  const s=S.wiz;
  if(s===1){
    const age=$('wAge').value,weight=$('wWeight').value,height=$('wHeight').value;
    if(age&&(Number(age)<1||Number(age)>120))return shMsg('wMsg','تحقق من العمر.');
    if(weight&&(Number(weight)<=0||Number(weight)>500))return shMsg('wMsg','تحقق من الوزن.');
    if(height&&(Number(height)<=0||Number(height)>300))return shMsg('wMsg','تحقق من الطول.');
  }
  if(s===2){
    const j=$('wJob').value.trim();
    const sal=Number($('wSalary').value);
    if(!j)return shMsg('wMsg','اكتب الوظيفة.');
    if(!Number.isFinite(sal)||sal<=0||sal>1e9)return shMsg('wMsg','أدخل دخلًا موجبًا صالحًا.');
    if(!$('wStart').value||!$('wEnd').value||$('wStart').value===$('wEnd').value)return shMsg('wMsg','حدّد بداية ونهاية مختلفتين للوردية.');
  }
  if(s===3){
    const calories=Number($('wCalGoal').value),water=Number($('wWaterGoal').value);
    if(!Number.isInteger(calories)||calories<500||calories>10000)return shMsg('wMsg','هدف السعرات يجب أن يكون بين 500 و10,000.');
    if(!Number.isInteger(water)||water<1||water>30)return shMsg('wMsg','هدف الماء يجب أن يكون بين 1 و30 كوبًا.');
  }
  setWiz(Math.min(3,s+1));
}
function wizPrev(){if(S.wiz>1)setWiz(S.wiz-1);else showSignup();}
async function doRegister(e){
  e.preventDefault();
  if(!S.tempAcc)return showSignup();
  if(!supabaseConfigured)return shMsg('wMsg','الخدمة غير متاحة مؤقتًا. يُرجى المحاولة لاحقًا.','info');
  const act=document.querySelector('input[name="act"]:checked')?.value||'moderate';
  const u=newU({
    name:S.tempAcc.name,email:S.tempAcc.email,lastAutoEarningsDate:dk(),
    profile:{job:$('wJob').value.trim(),salaryType:$('wType').value,salary:Number($('wSalary').value)||0,workDays:Number($('wDays').value)||5,workStart:$('wStart').value||'08:30',workEnd:$('wEnd').value||'17:00',offDays:$('wOff').value.trim()||'الجمعة، السبت',wake:$('wWake').value||'07:00',sleep:$('wSleep').value||'23:00',goal:$('wGoal').value,activity:act,age:$('wAge').value,weight:$('wWeight').value,height:$('wHeight').value,calorieGoal:Number($('wCalGoal').value)||2000,waterGoal:Number($('wWaterGoal').value)||8},
    dailyEarnings:{}
  });
  const d=dk();
  u.planner=[{id:uid(),date:d,time:u.profile.workStart,title:'بداية العمل',category:'عمل',done:false},{id:uid(),date:d,time:u.profile.workEnd,title:'إغلاق العمل',category:'عمل',done:false}];
  const email=u.email,pass=S.tempAcc.password,submit=$('wFinish');submit.disabled=true;
  try{
    const {data}=await signUpWithPassword(email,pass,u.name,payloadOf(u));
    S.tempAcc=null;
    if(data.session&&data.user)await openUserSession(data.user);
    else showPending(email,'pending','تم إنشاء الحساب. سجّل الدخول لمتابعة حالة طلبك.');
  }catch(error){shMsg('wMsg',readableAuthError(error));}
  finally{submit.disabled=false;}
}

function go(p){
  if(!S.user)return;
  S.page=p;
  $$('.page').forEach(x=>x.classList.toggle('on',x.id==='pg-'+p));
  $$('.dr-item').forEach(b=>b.classList.toggle('on',b.dataset.page===p));
  if(p==='home')renderHome();
  if(p==='work')renderWork();
  if(p==='money')renderMoney();
  if(p==='planner')renderPlanner();
  if(p==='notes')renderNotes();
  if(p==='exercise')renderExercise();
  if(p==='diet')renderDiet();
  if(p==='health')renderHealth();
  if(S.supportTimer){clearInterval(S.supportTimer);S.supportTimer=null;}
  if(p==='support'){renderSupport();S.supportTimer=setInterval(()=>{if(S.page==='support')renderSupport();},12000);}
  if(p==='notifications')renderNotifications();
  if(p==='settings')renderSettings();
  if(p==='dev')renderDev();
  closeDrawer();
}
function startTick(){if(S.tick)clearInterval(S.tick);if(S.notificationTimer)clearInterval(S.notificationTimer);syncAutoEarnings();S.tick=setInterval(()=>{if(S.user&&S.page==='home')renderHome();if(S.user&&S.user.lastAutoEarningsDate!==dk())syncAutoEarnings();},1000);refreshNotificationCount();S.notificationTimer=setInterval(()=>{if(S.user)refreshNotificationCount();},45000);}

function renderTop(){
  const n=S.user.name||'صديقي';
  $('uName').textContent=n;
  $('uJob').textContent=S.user.profile.job||'مساحتك';
  $('hName').textContent=n.split(' ')[0];
  paintAvatar($('avatar'),S.avatarUrl,n);
  paintAvatar($('drAvatar'),S.avatarUrl,n);
  paintAvatar($('setAvatarPreview'),S.avatarUrl,n);
  $('avatarRemoveBtn').classList.toggle('hidden',!S.user.avatarPath);
  $('drName').textContent=n;
  $('drEmail').textContent=S.user.email;
}
function paintAvatar(element,url,name){
  if(!element)return;
  element.replaceChildren();
  if(url){const image=document.createElement('img');image.src=url;image.alt='';image.className='avatar-img';image.onerror=()=>paintAvatar(element,'',name);element.append(image);}
  else element.textContent=(String(name||'Y').trim().charAt(0).toUpperCase()||'Y');
}
function renderAll(){
  renderTop();
  renderHome();renderWork();renderMoney();renderPlanner();renderNotes();renderExercise();renderDiet();renderHealth();renderSettings();
  if(S.isDev)renderDev();
}
function fDur(ms){const t=Math.max(0,Math.floor(ms/1000));return[Math.floor(t/3600),Math.floor((t%3600)/60),t%60].map(x=>String(x).padStart(2,'0')).join(':');}

function renderHome(){
  if(!S.user)return;
  const p=S.user.profile,n=new Date();
  $('wDay').textContent=dayName(n);
  $('dDate').textContent=dAr(n);
  if($('hSub'))$('hSub').textContent=`هدفك: ${p.goal} · الدوام ${p.workStart} → ${p.workEnd}`;
  const st=todayStatus();
  const rate=hourRate();
  const total=grandTotal();
  const month=monthCollected()+st.e;
  const collected=totalCollected();
  $('kTotal').textContent=fM(total);
  $('kToday').textContent=fM(st.e+(Number(S.user.dailyEarnings?.[dk()])||0));
  $('kTodayMeta').textContent=st.state;
  $('kHour').textContent=fM(rate);
  $('kMonth').textContent=fM(month);
  $('clockBadge').textContent=st.state;
  $('clockState').textContent=st.state;
  $('clockMeta').textContent=st.meta;
  $('timer').textContent=fDur(st.h*3600000);
  $('clockEarn').textContent=fMoney(st.e);
  $('clockRing').style.strokeDashoffset=327-(327*Math.min(1,st.h/8));
  const active=S.user.workControl?.startedAt&&!S.user.workControl?.stoppedAt;
  $('btnStart').disabled=!!active;
  $('btnStop').disabled=!active;
  $('btnStart').textContent=active?'جلسة جارية':'بدء يدوي';
  $('earnTotal').textContent=fMoney(collected);
  const days=Object.keys(S.user.dailyEarnings||{}).filter(k=>(S.user.dailyEarnings[k]||0)>0).length;
  $('earnDays').textContent=days;
  $('earnToday').textContent=fMoney(st.e+(Number(S.user.dailyEarnings?.[dk()])||0));
  $('earnAvg').textContent=fMoney(days>0?collected/days:0);
  const today=dk();
  const next=S.user.planner.filter(x=>x.date===today).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,5);
  $('nextList').innerHTML=next.length?next.map(x=>`<div class="tl"><time>${esc(x.time)}</time><i></i><div><b>${esc(x.title)}</b><span>${esc(x.category||'مهمة')}</span></div></div>`).join(''):'<div class="empty"><b>يومك مفتوح</b><span>أضف مهمة.</span></div>';
  const notes=S.user.notes.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3);
  $('notePreview').innerHTML=notes.length?notes.map(x=>`<div class="np-item"><b>${esc(x.title)}</b><span>${esc((x.content||'').slice(0,100))}</span></div>`).join(''):'<div class="empty"><b>المذكرة جاهزة</b><span>اكتب أول ملاحظة.</span></div>';
}
function manualStart(){
  if(S.user.workControl?.startedAt&&!S.user.workControl?.stoppedAt)return toast('هناك جلسة عمل جارية بالفعل.');
  saveU({workControl:{date:dk(),startedAt:new Date().toISOString(),stoppedAt:null,hourlyRate:hourRate()}});
  renderHome();toast('بدأت الجلسة.');
}
function manualStop(){
  const session=S.user.workControl;
  if(!session?.startedAt||session.stoppedAt)return;
  const stoppedAt=new Date();
  const startedAt=new Date(session.startedAt);
  if(!Number.isFinite(startedAt.getTime())||stoppedAt<=startedAt)return toast('تعذر التحقق من وقت بداية الجلسة.');
  const savedRate=Number(session.hourlyRate);
  const sessionRate=Number.isFinite(savedRate)&&savedRate>0?savedRate:hourRate();
  const earnings={...(S.user.dailyEarnings||{})};
  const split=splitEarningsByDate(startedAt,stoppedAt,sessionRate);
  Object.entries(split).forEach(([key,amount])=>{earnings[key]=(Number(earnings[key])||0)+amount;});
  saveU({workControl:{...session,stoppedAt:stoppedAt.toISOString(),stoppedDate:dk(stoppedAt)},dailyEarnings:earnings});
  renderHome();toast('تم حفظ الجلسة.');
}

function renderWork(){
  if(!S.user)return;
  const p=S.user.profile;
  const rate=hourRate();
  const prog=monthProgress();
  $('bigRate').textContent=fM(rate);
  $('wSalaryV').textContent=fMoney(p.salary);
  $('wHoursD').textContent=hB(p.workStart,p.workEnd).toFixed(1);
  $('wDaysV').textContent=p.workDays;
  $('wSched').textContent=`${p.workStart} → ${p.workEnd}`;
  $('monthPct').textContent=prog+'%';
  $('monthBar').style.width=prog+'%';
  const entries=Object.entries(S.user.dailyEarnings||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,20);
  $('daysList').innerHTML=entries.length?entries.map(([k,v])=>{
    const d=new Date(k);const isToday=k===dk();const isOff=!isWorkday(d);
    return `<div class="day-row"><div><b>${dayName(d)}</b><small>${dAr(d)}</small></div><span class="kind ${isOff?'off':'earn'}">${isOff?'إجازة':(isToday?'اليوم':'مكتمل')}</span><b>${fMoney(v)}</b></div>`;
  }).join(''):'<div class="empty"><b>لا يوجد سجل بعد</b><span>سيبدأ التتبع من أول يوم عمل.</span></div>';
  renderEarnChart();
}
function renderEarnChart(){
  const entries=[];
  const today=new Date();
  for(let i=29;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);
    const k=dk(d);
    entries.push({key:k,day:d.getDate(),value:(Number(S.user.dailyEarnings[k])||0)+(i===0?calcToday().e:0)});
  }
  const max=Math.max(1,...entries.map(e=>e.value));
  $('earnChart').innerHTML=entries.map(e=>{
    const h=Math.max(6,(e.value/max)*160);
    return `<div class="wc-bar" style="height:${h}px"><b>${e.value>0?fM(e.value):''}</b><span>${e.day}</span></div>`;
  }).join('');
}
function openEditWork(){
  const p=S.user.profile;
  dlg('بيانات العمل','',`
    <div class="two">
      <label>الدخل<input id="ewSalary" type="number" value="${esc(p.salary)}"></label>
      <label>النوع<select id="ewType"><option value="monthly" ${p.salaryType==='monthly'?'selected':''}>شهري</option><option value="hourly" ${p.salaryType==='hourly'?'selected':''}>بالساعة</option></select></label>
      <label>أيام / أسبوع<input id="ewDays" type="number" min="1" max="7" value="${esc(p.workDays)}"></label>
      <label>الإجازة<input id="ewOff" value="${esc(p.offDays)}"></label>
      <label>البداية<input id="ewStart" type="time" value="${esc(p.workStart)}"></label>
      <label>النهاية<input id="ewEnd" type="time" value="${esc(p.workEnd)}"></label>
    </div>
    <div class="dactions"><button class="btn btn-primary" onclick="YS.saveWork()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveWork(){
  const salary=Number($('ewSalary').value),days=Number($('ewDays').value),start=$('ewStart').value,end=$('ewEnd').value;
  if(!Number.isFinite(salary)||salary<=0||salary>1e9)return toast('أدخل دخلًا موجبًا وصالحًا.');
  if(!Number.isInteger(days)||days<1||days>7)return toast('أيام العمل يجب أن تكون من 1 إلى 7.');
  if(!start||!end||start===end)return toast('حدّد بداية ونهاية مختلفتين للوردية.');
  saveU({profile:{...S.user.profile,salary,salaryType:$('ewType').value,workDays:days,offDays:$('ewOff').value.trim(),workStart:start,workEnd:end}});
  closeDlg();renderAll();toast('تم التحديث.');
}

function renderMoney(){
  if(!S.user)return;
  const items=S.user.finance||[];
  const exp=items.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
  const ext=items.filter(x=>x.kind==='extra').reduce((a,x)=>a+Number(x.amount||0),0);
  const earned=grandTotal();
  const net=earned+ext-exp;
  $('mnNet').textContent=fM(net);
  $('mnEarn').textContent=fM(earned);
  $('mnExp').textContent=fM(exp);
  $('mnExt').textContent=fM(ext);
  const bud=S.user.profile.budget||{};
  const cats=[{id:'food',name:'طعام',c:'#14B8A6'},{id:'transport',name:'مواصلات',c:'#F59E0B'},{id:'bills',name:'فواتير',c:'#DC2626'},{id:'shopping',name:'تسوق',c:'#7C3AED'},{id:'fun',name:'ترفيه',c:'#DB2777'},{id:'other',name:'أخرى',c:'#64748B'}];
  const spent={};
  const monthKey=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  items.filter(x=>x.kind==='expense'&&String(x.createdAt||'').startsWith(monthKey)).forEach(x=>{const c=x.category||'other';spent[c]=(spent[c]||0)+Number(x.amount||0);});
  $('budgetList').innerHTML=cats.map(c=>{
    const limit=Number(bud[c.id])||0;
    const used=spent[c.id]||0;
    const pct=limit>0?Math.min(100,Math.round(used/limit*100)):0;
    return `<div class="budget-row"><div class="budget-head"><b>${c.name}</b><span>${fM(used)} / ${fM(limit)}</span></div><div class="budget-bar"><i style="width:${pct}%;background:${c.c}"></i></div></div>`;
  }).join('');
  const list=items.filter(x=>S.mFilter==='all'||x.kind===S.mFilter).slice().reverse().slice(0,15);
  $('moneyList').innerHTML=list.length?list.map(x=>`<div class="row"><div><b>${esc(x.title)}</b><small>${shAr(new Date(x.createdAt))}</small></div><span class="kind ${x.kind==='expense'?'expense':'extra'}">${x.kind==='expense'?'مصروف':'دخل'}</span><button class="del" aria-label="حذف ${esc(x.title)}" onclick="YS.removeMoney('${safeInlineId(x.id)}')">×</button><b>${x.kind==='expense'?'-':'+'}${fM(x.amount)}</b></div>`).join(''):'<div class="empty"><b>لا توجد حركات</b><span>أضف أول حركة.</span></div>';
}
function removeMoney(id){saveU({finance:S.user.finance.filter(x=>x.id!==id)});renderMoney();renderHome();toast('تم الحذف.');}
function openAddMoney(){
  const cats=[['food','طعام'],['transport','مواصلات'],['bills','فواتير'],['shopping','تسوق'],['fun','ترفيه'],['other','أخرى']];
  dlg('حركة مالية','',`
    <div class="two">
      <label>النوع<select id="mKind"><option value="expense">مصروف</option><option value="extra">دخل إضافي</option></select></label>
      <label>المبلغ<input id="mAmt" type="number" min="0.01" max="1000000000" step="0.01" placeholder="250"></label>
    </div>
    <label>الوصف<input id="mTitle" placeholder="غداء"></label>
    <label>التصنيف<select id="mCat">${cats.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select></label>
    <div class="dactions"><button class="btn btn-primary" onclick="YS.saveMoney()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveMoney(){
  const amt=Number($('mAmt').value);
  if(!Number.isFinite(amt)||amt<=0||amt>1e9)return toast('أدخل مبلغًا موجبًا لا يتجاوز مليارًا.');
  const item={id:uid(),kind:$('mKind').value,amount:amt,title:$('mTitle').value.trim()||'حركة',category:$('mCat').value,createdAt:new Date().toISOString()};
  saveU({finance:[...S.user.finance,item]});
  closeDlg();renderMoney();renderHome();toast('تم الحفظ.');
}
function openEditBudget(){
  const b=S.user.profile.budget||{};
  dlg('الميزانية الشهرية','',`
    <div class="two">
      <label>طعام<input id="bFood" type="number" value="${esc(b.food||0)}"></label>
      <label>مواصلات<input id="bTransport" type="number" value="${esc(b.transport||0)}"></label>
      <label>فواتير<input id="bBills" type="number" value="${esc(b.bills||0)}"></label>
      <label>تسوق<input id="bShopping" type="number" value="${esc(b.shopping||0)}"></label>
      <label>ترفيه<input id="bFun" type="number" value="${esc(b.fun||0)}"></label>
      <label>أخرى<input id="bOther" type="number" value="${esc(b.other||0)}"></label>
    </div>
    <div class="dactions"><button class="btn btn-primary" onclick="YS.saveBudget()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveBudget(){
  const b={food:Number($('bFood').value)||0,transport:Number($('bTransport').value)||0,bills:Number($('bBills').value)||0,shopping:Number($('bShopping').value)||0,fun:Number($('bFun').value)||0,other:Number($('bOther').value)||0};
  if(Object.values(b).some(v=>v<0||v>1e9))return toast('حدود الميزانية يجب أن تكون بين صفر ومليار.');
  saveU({profile:{...S.user.profile,budget:b}});
  closeDlg();renderMoney();toast('تم الحفظ.');
}

function renderPlanner(){
  if(!S.user)return;
  const d=S.pDate,k=dk(d);
  const items=S.user.planner.filter(x=>x.date===k);
  $('planDay').textContent=dayName(d);
  $('planDate').textContent=dAr(d);
  let h='';
  for(let x=6;x<=23;x++){
    const hh=String(x).padStart(2,'0');
    const f=items.filter(i=>String(i.time).startsWith(hh+':'));
    h+=`<div class="hour"><div class="hour-time">${hh}:00</div><div class="slot ${f.length?'':'empty'}">${f.map(i=>`<div class="chip"><span>${esc(i.title)}</span><b>${esc(i.time)}</b></div>`).join('')}</div></div>`;
  }
  $('schedule').innerHTML=h;
  const p=S.user.profile;
  $('routine').innerHTML=[['الاستيقاظ',p.wake],['الذهاب',p.goWork||'—'],['العمل',`${p.workStart} → ${p.workEnd}`],['النوم',p.sleep]].map(x=>`<div class="rr"><span>${x[0]}</span><b>${esc(x[1]||'—')}</b></div>`).join('');
  renderFocus();
}
function openAddTask(){
  dlg('مهمة جديدة','',`
    <div class="two">
      <label>التاريخ<input id="tDate" type="date" value="${dk(S.pDate)}"></label>
      <label>الوقت<input id="tTime" type="time" value="09:00"></label>
    </div>
    <label>العنوان<input id="tTitle" placeholder="اجتماع"></label>
    <label>التصنيف<select id="tCat"><option>عمل</option><option>تعلم</option><option>استراحة</option><option>صحة</option><option>شخصي</option></select></label>
    <div class="dactions"><button class="btn btn-primary" onclick="YS.saveTask()">إضافة</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveTask(){
  const t=$('tTitle').value.trim(),date=$('tDate').value,time=$('tTime').value;
  if(!t||t.length>120)return toast('اكتب عنوانًا لا يتجاوز 120 حرفًا.');
  const parsedDate=new Date(`${date}T00:00:00`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||dk(parsedDate)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return toast('تحقق من التاريخ والوقت.');
  saveU({planner:[...S.user.planner,{id:uid(),date,time,title:t,category:$('tCat').value,done:false}]});
  closeDlg();renderPlanner();renderHome();toast('تمت الإضافة.');
}
function renderFocus(){
  $('focusTimer').textContent=`${String(Math.floor(S.focus.s/60)).padStart(2,'0')}:${String(S.focus.s%60).padStart(2,'0')}`;
  $('focusToggle').textContent=S.focus.r?'إيقاف':'بدء';
}
function toggleFocus(){
  if(S.focus.r){clearInterval(S.focus.i);S.focus.r=false;}
  else{S.focus.r=true;S.focus.i=setInterval(()=>{S.focus.s--;if(S.focus.s<=0){resetFocus();toast('انتهت الجلسة');}renderFocus();},1000);}
  renderFocus();
}
function resetFocus(){clearInterval(S.focus.i);S.focus.r=false;S.focus.s=1500;renderFocus();}

function renderNotes(){
  if(!S.user)return;
  let l=S.user.notes.slice();
  if(S.nFilter==='pinned')l=l.filter(x=>x.pinned);
  if(S.nSearch)l=l.filter(x=>`${x.title} ${x.content}`.toLowerCase().includes(S.nSearch));
  l.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.updatedAt)-new Date(a.updatedAt));
  $('notesGrid').innerHTML=l.length?l.map(n=>`<article class="note-card ${n.pinned?'pin-card':''}"><div class="note-top"><span class="note-type">${esc(n.category||'عام')}</span><button class="pin" aria-label="${n.pinned?'إلغاء تثبيت':'تثبيت'} الملاحظة" onclick="YS.pinNote('${safeInlineId(n.id)}')">${n.pinned?'★':'☆'}</button></div><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="note-foot"><small>${shAr(new Date(n.updatedAt))}</small><div class="acts"><button aria-label="تعديل الملاحظة" onclick="YS.editNote('${safeInlineId(n.id)}')">✎</button><button aria-label="حذف الملاحظة" onclick="YS.removeNote('${safeInlineId(n.id)}')">×</button></div></div></article>`).join(''):'<div class="card" style="grid-column:1/-1;text-align:center;padding:36px"><b style="font-size:14px">لا توجد ملاحظات</b></div>';
}
function openNote(n=null){
  const x=n||{title:'',content:''};
  dlg(n?'تعديل':'ملاحظة جديدة','',`<label>العنوان<input id="nT" value="${esc(x.title)}"></label><label>المحتوى<textarea id="nC">${esc(x.content)}</textarea></label><div class="dactions"><button class="btn btn-primary" onclick="YS.saveNote('${safeInlineId(x.id)}')">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveNote(id){
  const c=$('nC').value.trim();
  if(!c)return toast('اكتب المحتوى.');
  if(c.length>10000||$('nT').value.trim().length>120)return toast('العنوان أو محتوى الملاحظة أطول من الحد المسموح.');
  const old=S.user.notes.find(x=>x.id===id);
  const n={id:id||uid(),title:$('nT').value.trim()||'بدون عنوان',content:c,category:old?.category||'عام',pinned:old?.pinned||false,updatedAt:new Date().toISOString()};
  saveU({notes:[...S.user.notes.filter(x=>x.id!==n.id),n]});
  closeDlg();renderNotes();renderHome();toast('تم الحفظ.');
}
function editNote(id){const n=S.user.notes.find(x=>x.id===id);if(n)openNote(n);}
function pinNote(id){saveU({notes:S.user.notes.map(x=>x.id===id?{...x,pinned:!x.pinned}:x)});renderNotes();}
function removeNote(id){saveU({notes:S.user.notes.filter(x=>x.id!==id)});renderNotes();renderHome();toast('تم الحذف.');}

function renderExercise(){
  if(!S.user)return;
  const now=new Date(),wAgo=new Date(now.getTime()-7*86400000);
  const ww=S.user.workouts.filter(w=>new Date(w.createdAt)>=wAgo);
  $('wkCount').textContent=ww.length;
  $('wkReps').textContent=fM(ww.reduce((a,w)=>a+(Number(w.reps)||0)*(Number(w.sets)||1),0));
  $('wkVol').textContent=fM(ww.reduce((a,w)=>a+(Number(w.weight)||0)*(Number(w.reps)||0)*(Number(w.sets)||1),0));
  $('wkMin').textContent=fM(ww.reduce((a,w)=>a+(Number(w.duration)||0),0));
  const l=S.user.workouts.filter(w=>S.exFilter==='all'||w.category===S.exFilter).slice().reverse();
  $('workoutList').innerHTML=l.length?l.map(w=>{const category=['gym','cardio','home'].includes(w.category)?w.category:'home';return `<div class="workout-item cat-${category}"><div class="wo-head"><b>${esc(w.name)}</b><span>${shAr(new Date(w.createdAt))}</span></div><div class="wo-meta"><div><span>مجموعات</span><b>${esc(w.sets||0)}</b></div><div><span>تكرار</span><b>${esc(w.reps||0)}</b></div><div><span>وزن</span><b>${esc(w.weight||0)}</b></div><div><span>دقائق</span><b>${esc(w.duration||0)}</b></div></div><button class="wo-del" onclick="YS.removeWorkout('${safeInlineId(w.id)}')">حذف</button></div>`;}).join(''):'<div class="empty"><b>لا تمارين</b><span>أضف جلستك الأولى.</span></div>';
  const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const c=[0,0,0,0,0,0,0];
  ww.forEach(w=>{c[new Date(w.createdAt).getDay()]++;});
  const mx=Math.max(1,...c);
  $('weekChart').innerHTML=c.map((v,i)=>`<div class="wc-bar" style="height:${Math.max(6,(v/mx)*150)}px"><b>${v||''}</b><span>${days[i].slice(0,3)}</span></div>`).join('');
}
function openWorkout(){
  dlg('تمرين جديد','',`<label>الاسم<input id="exN" placeholder="بنش برس"></label><div class="two"><label>النوع<select id="exC"><option value="gym">جيم</option><option value="cardio">كارديو</option><option value="home">منزلي</option></select></label><label>دقائق<input id="exD" type="number" placeholder="45"></label><label>مجموعات<input id="exS" type="number" placeholder="4"></label><label>تكرار<input id="exR" type="number" placeholder="10"></label></div><label>الوزن (kg)<input id="exW" type="number" step="0.5" placeholder="60"></label><div class="dactions"><button class="btn btn-primary" onclick="YS.saveWorkout()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveWorkout(){
  const n=$('exN').value.trim();
  const sets=Number($('exS').value)||0,reps=Number($('exR').value)||0,weight=Number($('exW').value)||0,duration=Number($('exD').value)||0;
  if(!n||n.length>120)return toast('اكتب اسم تمرين لا يتجاوز 120 حرفًا.');
  if(!['gym','cardio','home'].includes($('exC').value)||sets<0||sets>100||reps<0||reps>1000||weight<0||weight>2000||duration<0||duration>1440)return toast('تحقق من أرقام التمرين.');
  saveU({workouts:[...S.user.workouts,{id:uid(),name:n,category:$('exC').value,sets,reps,weight,duration,createdAt:new Date().toISOString()}]});
  closeDlg();renderExercise();toast('تم الحفظ.');
}
function removeWorkout(id){saveU({workouts:S.user.workouts.filter(x=>x.id!==id)});renderExercise();toast('تم الحذف.');}

function renderDiet(){
  if(!S.user)return;
  const t=dk();
  const m=S.user.meals.filter(x=>x.date===t);
  $('calToday').textContent=fM(m.reduce((a,x)=>a+(Number(x.kcal)||0),0));
  $('calGoal').textContent=fM(S.user.profile.calorieGoal||2000);
  const wg=Math.min(30,Math.max(1,Math.trunc(Number(S.user.profile.waterGoal)||8))),w=Math.min(wg,Math.max(0,Math.trunc(Number(S.user.waterLog[t])||0)));
  $('waterCount').textContent=`${w}/${wg}`;
  $('protToday').textContent=m.reduce((a,x)=>a+(Number(x.protein)||0),0)+'g';
  $('mealsList').innerHTML=m.length?m.map(x=>`<div class="meal-item"><div class="meal-info"><b>${esc(x.name)}</b><small>${esc(x.type||'وجبة')} · ${esc(x.protein||0)}g بروتين</small><button class="wo-del" onclick="YS.removeMeal('${safeInlineId(x.id)}')">حذف</button></div><span class="meal-kcal">${esc(x.kcal||0)} kcal</span></div>`).join(''):'<div class="empty"><b>لا وجبات</b><span>أضف وجبتك.</span></div>';
  let h='';for(let i=0;i<wg;i++)h+=`<div class="water-cup ${i<w?'on':''}" onclick="YS.setWater(${i+1})">💧</div>`;
  $('waterGrid').innerHTML=h;
}
function openMeal(){
  dlg('وجبة جديدة','',`<label>الاسم<input id="mlN" placeholder="صدر دجاج"></label><div class="two"><label>النوع<select id="mlT"><option>فطار</option><option>غداء</option><option>عشاء</option><option>سناك</option></select></label><label>سعرات<input id="mlK" type="number" min="0" max="100000" step="1" placeholder="450"></label><label>بروتين<input id="mlP" type="number" min="0" max="10000" step="0.1" placeholder="30"></label></div><div class="dactions"><button class="btn btn-primary" onclick="YS.saveMeal()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveMeal(){
  const n=$('mlN').value.trim();
  if(!n)return toast('اكتب الاسم.');
  const kcal=Number($('mlK').value),protein=Number($('mlP').value);
  if(!Number.isFinite(kcal)||kcal<0||kcal>100000)return toast('السعرات يجب أن تكون بين صفر و100,000.');
  if(!Number.isFinite(protein)||protein<0||protein>10000)return toast('البروتين يجب أن يكون بين صفر و10,000 جرام.');
  saveU({meals:[...S.user.meals,{id:uid(),date:dk(),name:n,type:$('mlT').value,kcal,protein}]});
  closeDlg();renderDiet();toast('تم الحفظ.');
}
function removeMeal(id){saveU({meals:S.user.meals.filter(x=>x.id!==id)});renderDiet();toast('تم الحذف.');}
function addWater(){const t=dk(),g=Math.min(30,Math.max(1,Math.trunc(Number(S.user.profile.waterGoal)||8))),c=Math.min(g,Math.max(0,Math.trunc(Number(S.user.waterLog[t])||0)));if(c>=g)return toast('وصلت الهدف');saveU({waterLog:{...S.user.waterLog,[t]:c+1}});renderDiet();}
function setWater(n){const goal=Math.min(30,Math.max(1,Math.trunc(Number(S.user.profile.waterGoal)||8)));if(!Number.isInteger(n)||n<1||n>goal)return;saveU({waterLog:{...S.user.waterLog,[dk()]:n}});renderDiet();}
function resetWater(){saveU({waterLog:{...S.user.waterLog,[dk()]:0}});renderDiet();toast('تم التصفير.');}

const PLANS={balanced:[['الصباح','ماء + ترتيب الأولويات'],['العمل','فواصل حركة قصيرة'],['بعد العمل','وجبة متنوعة + نشاط'],['المساء','نوم منتظم']],training:[['الأسبوع','3 جلسات نشاط'],['يوميًا','مشي أو حركة'],['الاستشفاء','إحماء وتهدئة'],['المساء','نوم منتظم']],diet:[['الفطار','بروتين + كارب'],['الغداء','نصف الطبق خضار'],['العشاء','خفيف'],['الماء','8 أكواب']]};
function renderHealth(){
  if(!S.user)return;
  const p=S.user.profile;
  $('hAge').textContent=p.age||'—';
  $('hWeight').textContent=p.weight||'—';
  $('hHeight').textContent=p.height||'—';
  const d=S.user.habits.filter(x=>x.done).length;
  const pct=S.user.habits.length?Math.round(d/S.user.habits.length*100):0;
  $('habitPct').textContent=pct+'%';
  $('habits').innerHTML=S.user.habits.map(h=>`<div class="habit ${h.done?'done':''}"><button aria-label="${h.done?'إلغاء إكمال':'إكمال'} ${esc(h.title)}" onclick="YS.toggleHabit('${safeInlineId(h.id)}')">${h.done?'✓':'○'}</button><div><b>${esc(h.title)}</b><span>${esc(h.meta)}</span></div><small>${h.done?'تم':'اليوم'}</small></div>`).join('');
  $('healthPlan').innerHTML=(PLANS[S.user.healthPlan]||PLANS.balanced).map(x=>`<div class="plan-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
}
function toggleHabit(id){saveU({habits:S.user.habits.map(x=>x.id===id?{...x,done:!x.done}:x)});renderHealth();}
function changePlan(){const o=['balanced','training','diet'];const n=o[(o.indexOf(S.user.healthPlan)+1)%o.length];saveU({healthPlan:n});renderHealth();toast('تم التغيير.');}
function openHealth(){
  const p=S.user.profile;
  dlg('البيانات الصحية','',`<div class="two"><label>العمر<input id="hA" type="number" value="${esc(p.age||'')}"></label><label>الوزن<input id="hW" type="number" step="0.1" value="${esc(p.weight||'')}"></label><label>الطول<input id="hH" type="number" step="0.1" value="${esc(p.height||'')}"></label></div><div class="dactions"><button class="btn btn-primary" onclick="YS.saveHealth()">حفظ</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
function saveHealth(){
  const age=$('hA').value,weight=$('hW').value,height=$('hH').value;
  if(age&&(!Number.isFinite(Number(age))||Number(age)<1||Number(age)>120))return toast('تحقق من العمر.');
  if(weight&&(!Number.isFinite(Number(weight))||Number(weight)<=0||Number(weight)>500))return toast('تحقق من الوزن.');
  if(height&&(!Number.isFinite(Number(height))||Number(height)<=0||Number(height)>300))return toast('تحقق من الطول.');
  saveU({profile:{...S.user.profile,age,weight,height}});closeDlg();renderHealth();toast('تم الحفظ.');
}

/* CALCULATOR (safe expression parser) */
function calcKey(k){
  const d=$('calcDisp');
  if(k==='C'){S.calcExp='';d.value='0';return;}
  if(k==='⌫'){S.calcExp=S.calcExp.slice(0,-1);d.value=S.calcExp||'0';return;}
  if(k==='='){
    if(!S.calcExp)return;
    try{
      const expression=S.calcExp;
      const r=evaluateExpression(expression);
      const out=r.toLocaleString('en-US',{maximumFractionDigits:10});
      d.value=out;
      S.calcExp=String(r);
      S.calcHistory.unshift({expression,result:r});
      S.calcHistory=S.calcHistory.slice(0,6);
      renderCalcHistory();
    }catch(error){d.value='خطأ';toast(error.message||'صيغة العملية غير صالحة.');}
    return;
  }
  if(!/^[0-9.+\-−×÷*/()%]$/.test(k))return;
  S.calcExp+=k;
  d.value=S.calcExp;
}
function renderCalcHistory(){
  const list=$('calcHistory');
  if(!list)return;
  list.replaceChildren();
  if(!S.calcHistory.length){const empty=document.createElement('li');empty.className='calc-history-empty';empty.textContent='ستظهر نتائجك الأخيرة هنا.';list.append(empty);return;}
  S.calcHistory.forEach(item=>{
    const row=document.createElement('li'),button=document.createElement('button'),expression=document.createElement('span'),result=document.createElement('b');
    button.type='button';button.className='calc-history-item';expression.textContent=item.expression;result.textContent=Number(item.result).toLocaleString('en-US',{maximumFractionDigits:10});
    button.append(expression,result);button.addEventListener('click',()=>{S.calcExp=item.expression;$('calcDisp').value=item.expression;});row.append(button);list.append(row);
  });
}
function clearCalcHistory(){S.calcHistory=[];renderCalcHistory();}

function renderSettings(){
  if(!S.user)return;
  const p=S.user.profile;
  $('setName').value=S.user.name;
  $('setEmail').value=S.user.email;
  $('setJob').value=p.job||'';
  $('setPreviewName').textContent=S.user.name||'حسابك';
  $('setPreviewJob').textContent=p.job||'أضف المسمى الوظيفي من بياناتك أدناه.';
  $('setHourlyRate').textContent=hourlyRate(p)>0?`${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(hourlyRate(p))} EGP`:'—';
  $('setProfileIncome').textContent=Number(p.salary)>0?fMoney(p.salary):'غير محدد';
  $('setStart').value=p.workStart||'';
  $('setEnd').value=p.workEnd||'';
  $('setCalGoal').value=p.calorieGoal||2000;
  $('setWaterGoal').value=p.waterGoal||8;
  paintAvatar($('setAvatarPreview'),S.avatarUrl,S.user.name);
  $('avatarRemoveBtn').classList.toggle('hidden',!S.user.avatarPath);
}
async function saveSettings(e){
  e.preventDefault();
  const name=$('setName').value.trim(),job=$('setJob').value.trim();
  if(!name||name.length>80)return toast('اكتب اسمًا صالحًا لا يتجاوز 80 حرفًا.');
  if(job.length>100)return toast('اسم الوظيفة طويل جدًا.');
  if(!$('setStart').value||!$('setEnd').value||$('setStart').value===$('setEnd').value)return toast('حدّد بداية ونهاية مختلفتين للوردية.');
  const calories=Number($('setCalGoal').value),water=Number($('setWaterGoal').value);
  if(!Number.isInteger(calories)||calories<500||calories>10000)return toast('هدف السعرات يجب أن يكون بين 500 و10,000.');
  if(!Number.isInteger(water)||water<1||water>30)return toast('هدف الماء يجب أن يكون بين 1 و30 كوبًا.');
  const submit=document.querySelector('#settingsForm button[type="submit"]');submit.disabled=true;
  try{
    await updateUserProfile(S.user.id,{full_name:name,job_title:job});
    await saveU({name,profile:{...S.user.profile,job,workStart:$('setStart').value,workEnd:$('setEnd').value,calorieGoal:calories,waterGoal:water}});
    renderAll();toast('تم حفظ التغييرات ومزامنتها.');
  }catch(error){toast(readableAuthError(error));}
  finally{submit.disabled=false;}
}
function delAccount(){dlg('حذف الحساب','سيُحذف الحساب وبياناته نهائيًا ولا يمكن التراجع عن ذلك. إذا تعذّر إكمال الطلب، تواصل مع إدارة الموقع.',`<div class="dactions"><button class="btn btn-danger" onclick="YS.confirmDel()">حذف نهائي</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);}
async function confirmDel(){
  try{
    await S.saveQueue.catch(()=>{});
    await deleteAccount();
    try{await signOut();}catch{}
    clearAppTimers();
    S.user=null;S.isDev=false;S.avatarUrl='';S.supportId=null;S.supportConversations=[];S.supportProfiles=[];S.supportProfilesAt=0;S.devProfiles=[];closeDlg();showLogin();toast('تم حذف الحساب وبياناته.');
  }catch(error){toast(readableAuthError(error));}
}
async function uploadProfilePhoto(file){
  if(!file)return;
  const button=$('avatarUploadBtn');button.disabled=true;shMsg('avatarMsg','جار رفع الصورة…','info');
  try{
    const result=await uploadAvatar(S.user.id,file,S.user.avatarPath||'');
    S.user.avatarPath=result.path;S.avatarUrl=result.url;
    shMsg('avatarMsg','تم تحديث الصورة.','success');renderTop();
  }catch(error){shMsg('avatarMsg',readableAuthError(error));}
  finally{button.disabled=false;$('avatarFile').value='';}
}
async function clearProfilePhoto(){
  if(!S.user.avatarPath)return;
  $('avatarRemoveBtn').disabled=true;
  try{
    await removeAvatar(S.user.id,S.user.avatarPath);
    S.user.avatarPath='';S.avatarUrl='';renderTop();shMsg('avatarMsg','تمت إزالة الصورة.','success');
  }catch(error){shMsg('avatarMsg',readableAuthError(error));}
  finally{$('avatarRemoveBtn').disabled=false;}
}

async function renderDev(force=true){
  if(!S.isDev)return;
  if(force){
    $('devList').innerHTML='<div class="empty"><b>جار تحميل الحسابات…</b></div>';
    try{S.devProfiles=await adminListProfiles()||[];S.supportProfiles=S.devProfiles;S.supportProfilesAt=Date.now();}
    catch(error){$('devList').innerHTML='<div class="empty"><b>تعذّر تحميل الحسابات</b><span>تحقّق من صلاحية حسابك وحاول مرة أخرى.</span></div>';return;}
  }
  const l=S.devProfiles;
  const target=$('notifyTarget'),selected=target.value;
  target.replaceChildren();
  const prompt=document.createElement('option');prompt.value='';prompt.textContent='اختر مستخدمًا';target.append(prompt);
  l.forEach(profile=>{const option=document.createElement('option');option.value=profile.id;option.textContent=`${profile.full_name||'مستخدم'} — ${profile.email||''}`;target.append(option);});
  if(l.some(profile=>profile.id===selected))target.value=selected;
  try{
  const p=l.filter(u=>u.account_status==='pending').length;
  const a=l.filter(u=>u.account_status==='approved').length;
  const r=l.filter(u=>u.account_status==='rejected').length;
  $('dTotal').textContent=l.length;
  $('dPend').textContent=p;
  $('dApp').textContent=a;
  $('dRej').textContent=r;
  $('fPend').textContent=p;
  let filtered=l;
  if(S.dFilter==='pending')filtered=l.filter(u=>u.account_status==='pending');
  else if(S.dFilter==='approved')filtered=l.filter(u=>u.account_status==='approved');
  else if(S.dFilter==='rejected')filtered=l.filter(u=>u.account_status==='rejected');
  const search=String($('devSearch')?.value||'').trim().toLocaleLowerCase();
  if(search)filtered=filtered.filter(u=>[u.full_name,u.email,u.job_title].some(value=>String(value||'').toLocaleLowerCase().includes(search)));
  filtered.sort((a,b)=>{const sa=a.account_status==='pending'?0:1,sb=b.account_status==='pending'?0:1;if(sa!==sb)return sa-sb;return new Date(b.created_at)-new Date(a.created_at);});
  $('devList').innerHTML=filtered.length?filtered.map(u=>{
    const st=['pending','approved','rejected'].includes(u.account_status)?u.account_status:'pending';
    const lbl=st==='pending'?'قيد المراجعة':st==='approved'?'مقبول':'مرفوض';
    const init=(u.full_name||'?').trim().charAt(0).toUpperCase();
    return `<div class="user-card ${st}"><div class="uhead"><div class="uhead-l"><div class="uav">${esc(init)}</div><div><b>${esc(u.full_name||'—')}</b><small>${esc(u.email||'—')}</small></div></div><span class="st-tag ${st}">${lbl}</span></div><div class="udetails"><div><span>الوظيفة</span><b>${esc(u.job_title||'—')}</b></div><div><span>تاريخ التسجيل</span><b>${esc(shAr(new Date(u.created_at)))}</b></div></div><div class="uacts">${st==='pending'?`<button class="btn btn-primary sm" onclick="YS.approve('${safeInlineId(u.id)}')">✓ قبول</button><button class="btn btn-danger sm" onclick="YS.reject('${safeInlineId(u.id)}')">✕ رفض</button>`:''}${st==='approved'?`<button class="btn btn-danger sm" onclick="YS.reject('${safeInlineId(u.id)}')">تعليق</button>`:''}${st==='rejected'?`<button class="btn btn-primary sm" onclick="YS.approve('${safeInlineId(u.id)}')">إعادة قبول</button>`:''}${u.id!==S.user.id?`<button class="btn btn-ghost sm" onclick="YS.delUser('${safeInlineId(u.id)}')">حذف</button>`:''}</div></div>`;
  }).join(''):'<div class="empty" style="grid-column:1/-1;padding:36px"><b>لا توجد حسابات مطابقة</b><span>جرّب تغيير الحالة أو عبارة البحث.</span></div>';
  }catch(error){$('devList').innerHTML='<div class="empty"><b>تعذر عرض الحسابات</b><span>حدّث القائمة وحاول مرة أخرى.</span></div>';}
}
function openSupportStart(){
  if(S.isDev)return toast('افتح محادثة المستخدم من صندوق الدعم للرد عليه.');
  dlg('محادثة دعم جديدة','سيطّلع فريق المطوّرين على رسالتك.',`<label>الموضوع<input id="supportSubject" maxlength="120" required placeholder="مثال: مشكلة في حسابي"></label><label>رسالتك<textarea id="supportFirstMessage" maxlength="4000" required placeholder="اشرح ما تحتاج المساعدة فيه"></textarea></label><div class="dactions"><button class="btn btn-primary" onclick="YS.createSupportThread()">بدء المحادثة</button><button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button></div>`);
}
async function createSupportThread(){
  const subject=$('supportSubject').value.trim(),body=$('supportFirstMessage').value.trim();
  if(!subject||subject.length>120||!body||body.length>4000)return toast('أدخل عنوانًا ورسالة ضمن الحدود المحددة.');
  try{
    const thread=await createSupportConversation(S.user.id,subject);
    S.supportId=thread.id;
    await sendSupportMessage(thread.id,S.user.id,body);
    closeDlg();await renderSupport();toast('تم إرسال طلبك إلى فريق الدعم.');
  }catch(error){toast(readableAuthError(error));}
}
async function renderSupport(forceProfiles=false){
  if(!S.user||S.supportBusy)return;
  S.supportBusy=true;
  const threads=$('supportThreads'),messages=$('supportMessages'),form=$('supportReplyForm');
  $('supportInboxTitle').textContent=S.isDev?'طلبات جميع المستخدمين':'محادثاتي';
  $('newSupportThread').classList.toggle('hidden',S.isDev);
  try{
    S.supportConversations=await getSupportConversations();
    let profiles=[];
    if(S.isDev){
      if(forceProfiles||Date.now()-S.supportProfilesAt>60000){S.supportProfiles=await adminListProfiles();S.supportProfilesAt=Date.now();}
      profiles=S.supportProfiles;
    }
    const profileById=new Map(profiles.map(p=>[p.id,p]));
    threads.replaceChildren();
    if(!S.supportConversations.length){const empty=document.createElement('p');empty.className='support-empty';empty.textContent=S.isDev?'لا توجد طلبات دعم بعد.':'لا توجد محادثات بعد.';threads.append(empty);}
    S.supportConversations.forEach(thread=>{
      const button=document.createElement('button'),title=document.createElement('b'),meta=document.createElement('small'),p=profileById.get(thread.user_id);
      button.type='button';button.className='support-thread'+(thread.id===S.supportId?' active':'');
      title.textContent=S.isDev?`${p?.full_name||p?.email||'مستخدم'} — ${thread.subject}`:thread.subject;
      meta.textContent=`${thread.status==='open'?'مفتوحة':'مغلقة'} · ${shAr(new Date(thread.updated_at||thread.created_at))}`;
      button.append(title,meta);button.addEventListener('click',()=>{S.supportId=thread.id;renderSupport();});threads.append(button);
    });
    const active=S.supportConversations.find(t=>t.id===S.supportId)||S.supportConversations[0]||null;
    S.supportId=active?.id||null;
    if(!active){$('supportThreadSubject').textContent='الدعم الفني';$('supportThreadStatus').textContent='اختر محادثة';$('supportCloseThread').classList.add('hidden');form.classList.add('hidden');messages.replaceChildren();const empty=document.createElement('p');empty.className='support-empty';empty.textContent='ابدأ محادثة جديدة وسيصل طلبك إلى جميع المطوّرين.';messages.append(empty);return;}
    $('supportThreadSubject').textContent=active.subject;
    $('supportThreadStatus').textContent=active.status==='open'?'محادثة مفتوحة':'محادثة مغلقة';
    const closeButton=$('supportCloseThread');closeButton.classList.toggle('hidden',!S.isDev);closeButton.textContent=active.status==='open'?'إغلاق المحادثة':'إعادة فتح المحادثة';
    form.classList.toggle('hidden',active.status==='closed'&&!S.isDev);
    const rows=await getSupportMessages(active.id);messages.replaceChildren();
    if(!rows.length){const empty=document.createElement('p');empty.className='support-empty';empty.textContent='لا توجد رسائل بعد.';messages.append(empty);}
    rows.forEach(item=>{const article=document.createElement('article'),who=document.createElement('b'),text=document.createElement('p'),time=document.createElement('time');article.className='support-bubble'+(item.sender_id===S.user.id?' mine':'');who.textContent=item.sender_id===S.user.id?'أنت':'فريق الدعم';text.textContent=item.body;time.textContent=new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at));article.append(who,text,time);messages.append(article);});
    messages.scrollTop=messages.scrollHeight;
  }catch(error){threads.replaceChildren();const fail=document.createElement('p');fail.className='support-empty';fail.textContent='تعذر تحميل صندوق الدعم. تأكد من تشغيل تحديث قاعدة البيانات.';threads.append(fail);}
  finally{S.supportBusy=false;}
}
async function sendSupportReply(e){
  e.preventDefault();const body=$('supportReply').value.trim();if(!body||body.length>4000||!S.supportId)return;
  const submit=document.querySelector('#supportReplyForm button[type="submit"]');submit.disabled=true;
  try{await sendSupportMessage(S.supportId,S.user.id,body);$('supportReply').value='';await renderSupport();}
  catch(error){shMsg('supportMsg',readableAuthError(error));}
  finally{submit.disabled=false;}
}
async function toggleSupportStatus(){
  const thread=S.supportConversations.find(t=>t.id===S.supportId);if(!thread||!S.isDev)return;
  try{await adminSetSupportStatus(thread.id,thread.status==='open'?'closed':'open');await renderSupport();}
  catch{toast('تعذر تحديث حالة المحادثة.');}
}
async function refreshNotificationCount(){
  if(!S.user||!$('notificationCount'))return;
  try{const rows=await getUserNotifications(),unread=rows.filter(n=>!n.read_at).length,badge=$('notificationCount');badge.textContent=unread;badge.classList.toggle('hidden',unread===0);}
  catch{}
}
async function renderNotifications(){
  if(!S.user)return;const root=$('notificationsList');root.replaceChildren();
  try{
    const rows=await getUserNotifications();
    if(!rows.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='لا توجد إشعارات حتى الآن.';root.append(empty);return;}
    rows.forEach(n=>{const card=document.createElement('article'),title=document.createElement('h2'),body=document.createElement('p'),time=document.createElement('time');card.className='notification-card'+(!n.read_at?' unread':'');title.textContent=n.title;body.textContent=n.body;time.textContent=new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(n.created_at));card.append(title,body,time);if(!n.read_at){const button=document.createElement('button');button.type='button';button.className='btn btn-ghost sm';button.textContent='تحديد كمقروء';button.addEventListener('click',async()=>{try{await markNotificationRead(n.id);await renderNotifications();await refreshNotificationCount();}catch{toast('تعذر تحديث الإشعار.');}});card.append(button);}root.append(card);});
    await refreshNotificationCount();
  }catch{const fail=document.createElement('div');fail.className='empty';fail.textContent='تعذر تحميل الإشعارات. تأكد من تشغيل تحديث قاعدة البيانات.';root.append(fail);}
}
async function sendDeveloperNotification(e){
  e.preventDefault();if(!S.isDev)return;
  const target=$('notifyTarget').value,title=$('notifyTitle').value.trim(),body=$('notifyBody').value.trim(),button=document.querySelector('#notifyForm button[type="submit"]');
  if(!target||!title||title.length>120||!body||body.length>2000)return shMsg('notifyMsg','اختر مستخدمًا واكتب عنوانًا ورسالة ضمن الحدود.');
  button.disabled=true;
  try{await createUserNotification(target,title,body);$('notifyForm').reset();shMsg('notifyMsg','تم إرسال الإشعار داخل التطبيق.','success');}
  catch(error){shMsg('notifyMsg',readableAuthError(error));}
  finally{button.disabled=false;}
}

async function approve(id){try{await adminSetProfileStatus(id,'approved');await renderDev();toast('تمت الموافقة.');}catch{toast('تعذر تغيير الحالة. تحقّق من صلاحية المطوّر.');}}
async function reject(id){try{await adminSetProfileStatus(id,'rejected');await renderDev();toast('تم رفض الطلب.');}catch{toast('تعذر تغيير الحالة. تحقّق من صلاحية المطوّر.');}}
async function delUser(id){
  if(id===S.user.id)return toast('استخدم حذف الحساب من إعداداتك لإزالة حسابك.');
  if(!confirm('حذف حساب هذا المستخدم وبياناته نهائيًا؟'))return;
  try{await deleteAccount(id);await renderDev();toast('تم حذف الحساب.');}
  catch(error){toast(readableAuthError(error));}
}

function bind(){
  $$('[data-eye]').forEach(b=>b.addEventListener('click',()=>{
    const e=$(b.dataset.eye);
    e.type=e.type==='password'?'text':'password';
    b.textContent=e.type==='password'?'إظهار':'إخفاء';
  }));
  $('f-login').addEventListener('submit',doLogin);
  $('forgotPassword').addEventListener('click',doForgotPassword);
  $('f-recovery').addEventListener('submit',doPasswordRecovery);
  $('cancelRecovery').addEventListener('click',showLogin);
  $('goSignup').addEventListener('click',showSignup);
  $('backLogin').addEventListener('click',showLogin);
  $('backLogin2').addEventListener('click',logout);
  $('f-account').addEventListener('submit',doAccount);
  $('f-wizard').addEventListener('submit',doRegister);
  $('wNext').addEventListener('click',wizNext);
  $('wPrev').addEventListener('click',wizPrev);
  $('f-wizard').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.target.matches('textarea')){
      e.preventDefault();
      if(S.wiz<3)wizNext();
      else doRegister(e);
    }
  });

  /* DRAWER */
  $('drawer').inert=true;$('drawer').setAttribute('aria-hidden','true');
  $('hamBtn').addEventListener('click',toggleDrawer);
  $('drawerOverlay').addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{
    const modal=$('modal');
    if(e.key==='Escape'){
      if(!modal.classList.contains('hidden'))closeDlg();
      else closeDrawer();
      return;
    }
    if(e.key!=='Tab'||modal.classList.contains('hidden'))return;
    const focusable=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
    if(!focusable.length){e.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  document.addEventListener('keydown',e=>{
    if(S.page!=='calc'||!$('pg-calc').classList.contains('on'))return;
    if(e.target.matches('input,textarea,select'))return;
    const map={Enter:'=',Backspace:'⌫',Escape:'C'};
    const key=map[e.key]||e.key;
    if(/^[0-9.+\-*/()%]$/.test(key)||['=','⌫','C'].includes(key)){e.preventDefault();calcKey(key);}
  });

  /* NAV */
  $$('.dr-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
  $('logoutBtn').addEventListener('click',logout);
  $('profileBtn').addEventListener('click',()=>go('settings'));
  $('quickTask').addEventListener('click',()=>{S.pDate=new Date();go('planner');openAddTask();});
  $('quickNote').addEventListener('click',()=>{go('notes');openNote();});
  $('quickMoney').addEventListener('click',()=>{go('money');openAddMoney();});
  $('quickCalc').addEventListener('click',()=>go('calc'));
  $('themeBtn').addEventListener('click',()=>{
    const o=['teal','slate','dark','navy'];
    const c=gP().theme||'teal';
    const n=o[(o.indexOf(c)+1)%o.length];
    setTheme(n);toast('الثيم: '+n);
  });

  /* WORK */
  $('btnStart').addEventListener('click',manualStart);
  $('btnStop').addEventListener('click',manualStop);
  $('editWork').addEventListener('click',openEditWork);

  /* MONEY */
  $('addMoney').addEventListener('click',openAddMoney);
  $('editBudget').addEventListener('click',openEditBudget);
  $$('.flt[data-mf]').forEach(b=>b.addEventListener('click',()=>{
    S.mFilter=b.dataset.mf;
    $$('.flt[data-mf]').forEach(x=>x.classList.toggle('on',x===b));
    renderMoney();
  }));

  /* PLANNER */
  $('addTask').addEventListener('click',openAddTask);
  $('prevDay').addEventListener('click',()=>{S.pDate.setDate(S.pDate.getDate()-1);renderPlanner();});
  $('nextDay').addEventListener('click',()=>{S.pDate.setDate(S.pDate.getDate()+1);renderPlanner();});
  $('todayBtn').addEventListener('click',()=>{S.pDate=new Date();renderPlanner();});
  $('focusToggle').addEventListener('click',toggleFocus);
  $('focusReset').addEventListener('click',resetFocus);

  /* NOTES */
  $('newNote').addEventListener('click',()=>openNote());
  $('noteSearch').addEventListener('input',e=>{S.nSearch=e.target.value.trim().toLowerCase();renderNotes();});
  $$('.flt[data-nf]').forEach(b=>b.addEventListener('click',()=>{
    S.nFilter=b.dataset.nf;
    $$('.flt[data-nf]').forEach(x=>x.classList.toggle('on',x===b));
    renderNotes();
  }));

  /* EXERCISE */
  $('addWorkout').addEventListener('click',openWorkout);
  $$('.flt[data-ef]').forEach(b=>b.addEventListener('click',()=>{
    S.exFilter=b.dataset.ef;
    $$('.flt[data-ef]').forEach(x=>x.classList.toggle('on',x===b));
    renderExercise();
  }));

  /* DIET */
  $('addMeal').addEventListener('click',openMeal);
  $('addWater').addEventListener('click',addWater);
  $('resetWater').addEventListener('click',resetWater);

  /* HEALTH */
  $('editHealth').addEventListener('click',openHealth);
  $('changePlan').addEventListener('click',changePlan);

  /* CALC */
  $$('.ck').forEach(b=>b.addEventListener('click',()=>calcKey(b.dataset.c)));
  $('clearCalcHistory').addEventListener('click',clearCalcHistory);

  /* SETTINGS */
  $('settingsForm').addEventListener('submit',saveSettings);
  $('setName').addEventListener('input',e=>{$('setPreviewName').textContent=e.target.value.trim()||'حسابك';});
  $('setJob').addEventListener('input',e=>{$('setPreviewJob').textContent=e.target.value.trim()||'أضف المسمى الوظيفي من بياناتك أدناه.';});
  $('delAcc').addEventListener('click',delAccount);
  $('avatarUploadBtn').addEventListener('click',()=>$('avatarFile').click());
  $('avatarFile').addEventListener('change',e=>uploadProfilePhoto(e.target.files?.[0]));
  $('avatarRemoveBtn').addEventListener('click',clearProfilePhoto);
  $$('.theme-tile').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.theme)));

  /* DEV */
  $$('.flt[data-df]').forEach(b=>b.addEventListener('click',()=>{
    S.dFilter=b.dataset.df;
    $$('.flt[data-df]').forEach(x=>x.classList.toggle('on',x===b));
    renderDev(false);
  }));
  $('devSearch').addEventListener('input',()=>renderDev(false));
  $('devRefresh').addEventListener('click',()=>renderDev(true));
  $('newSupportThread').addEventListener('click',openSupportStart);
  $('refreshSupport').addEventListener('click',()=>renderSupport(true));
  $('supportReplyForm').addEventListener('submit',sendSupportReply);
  $('supportCloseThread').addEventListener('click',toggleSupportStatus);
  $('refreshNotifications').addEventListener('click',renderNotifications);
  $('notifyForm').addEventListener('submit',sendDeveloperNotification);
}

async function boot(){
  setTheme(gP().theme||'teal');
  bind();
  if(!supabaseConfigured){
    showLogin();
    shMsg('lMsg','الخدمة غير متاحة مؤقتًا. يُرجى المحاولة لاحقًا.','info');
    return;
  }
  try{
    if(await consumeRecoveryLink()){showRecovery();return;}
    const session=await getSession();
    if(session?.user){await openUserSession(session.user);return;}
  }catch(error){
    showLogin();
    shMsg('lMsg',readableAuthError(error));
    return;
  }
  showLogin();
}

window.YS={
  go,closeDlg,
  saveMoney,removeMoney,saveBudget,saveWork,saveTask,
  saveNote,editNote,pinNote,removeNote,
  saveWorkout,removeWorkout,
  saveMeal,removeMeal,setWater,toggleHabit,saveHealth,
  approve,reject,delUser,confirmDel
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();
})();
