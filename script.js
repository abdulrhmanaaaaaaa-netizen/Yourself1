(() => {
'use strict';

// ═══════════════ CONSTANTS ═══════════════
const UK = 'yfs_v15_users';
const SK = 'yfs_v15_sess';
const PK = 'yfs_v15_pref';

// Developer accounts — only these emails can access dev panel
const DEV_EMAILS = ['hoang@gmail.com', 'haider@gmail.com'];
const DEV_PASSWORDS = {
  'hoang@gmail.com':  'Hoang123',
  'haider@gmail.com': 'asdfghjkl123'
};

const $ = id => document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];

// ═══════════════ HELPERS ═══════════════
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const emailOf = x => String(x||'').trim().toLowerCase();
const dk = (d=new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fM = n => (Math.round(Number(n)||0)).toLocaleString('en-US');
const fMoney = n => (Math.round(Number(n)||0)).toLocaleString('en-US') + ' EGP';
const dAr = d => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d));
const shAr = d => new Intl.DateTimeFormat('ar-EG',{day:'2-digit',month:'2-digit'}).format(new Date(d));
const dayName = d => new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(new Date(d));
const tM = t => { const [h,m]=String(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); };
const hB = (a,b) => { let x=tM(a), y=tM(b); if(y<x) y+=1440; return (y-x)/60; };

// ═══════════════ STORAGE ═══════════════
const lU = () => { try { return JSON.parse(localStorage.getItem(UK)||'[]'); } catch { return []; } };
const sU = u => localStorage.setItem(UK, JSON.stringify(u));
const gS = () => { try { return JSON.parse(localStorage.getItem(SK)||'null'); } catch { return null; } };
const sS = e => localStorage.setItem(SK, JSON.stringify({email:e, at:Date.now()}));
const cS = () => localStorage.removeItem(SK);
const gP = () => { try { return JSON.parse(localStorage.getItem(PK)||'{}'); } catch { return {}; } };
const sP = p => localStorage.setItem(PK, JSON.stringify(p));

// ═══════════════ STATE ═══════════════
const S = {
  user: null, isDev: false, page: 'home',
  mFilter: 'all', nFilter: 'all', nSearch: '', exFilter: 'all', dFilter: 'pending',
  pDate: new Date(),
  focus: { s:1500, r:false, i:null },
  tick: null,
  wiz: 1,
  tempAcc: null
};

// ═══════════════ DEFAULTS ═══════════════
const defProf = () => ({
  job:'', salaryType:'monthly', salary:0, workDays:5,
  workStart:'08:30', workEnd:'17:00', offDays:'الجمعة، السبت',
  wake:'07:00', sleep:'23:00', goal:'تنظيم الوقت', activity:'moderate',
  age:'', weight:'', height:'', calorieGoal:2000, waterGoal:8, budget:{}
});

const defHabits = () => {
  const d = dk();
  return [
    {id:'water', title:'الماء',        meta:'الترطيب',        done:false, date:d},
    {id:'move',  title:'حركة بسيطة',   meta:'مشي أو تمدد',    done:false, date:d},
    {id:'meal',  title:'وجبة متوازنة', meta:'اختيار متنوع',   done:false, date:d},
    {id:'sleep', title:'نوم منتظم',    meta:'',              done:false, date:d}
  ];
};

const newU = (o={}) => ({
  id: uid(), name:'', email:'', password:'',
  status: 'pending',
  role: 'user',
  createdAt: new Date().toISOString(),
  profile: defProf(),
  finance: [], notes: [], planner: [],
  workControl: null,
  dailyEarnings: {},
  habits: defHabits(),
  healthPlan: 'balanced',
  workouts: [], meals: [], waterLog: {},
  ...o
});

function normU(u){
  if(!u) return null;
  const base = newU();
  const today = dk();
  let habits = Array.isArray(u.habits) && u.habits.length ? u.habits : base.habits;
  if(habits[0] && habits[0].date !== today){
    habits = habits.map(h => ({...h, done:false, date:today}));
  }
  return {
    ...base, ...u,
    profile: {...base.profile, ...(u.profile||{})},
    finance: Array.isArray(u.finance) ? u.finance : [],
    notes:   Array.isArray(u.notes)   ? u.notes   : [],
    planner: Array.isArray(u.planner) ? u.planner : [],
    habits,
    workouts: Array.isArray(u.workouts) ? u.workouts : [],
    meals:    Array.isArray(u.meals)    ? u.meals    : [],
    waterLog: u.waterLog || {},
    workControl: u.workControl || null,
    dailyEarnings: (u.dailyEarnings && typeof u.dailyEarnings === 'object') ? u.dailyEarnings : {}
  };
}

function saveU(patch){
  if(!S.user) return;
  S.user = normU({...S.user, ...patch});
  const l = lU();
  const i = l.findIndex(x => x.id === S.user.id);
  if(i >= 0) l[i] = S.user;
  else l.push(S.user);
  sU(l);
}

// ═══════════════ WORK LOGIC ═══════════════
const offM = {
  'الأحد':0,'الاحد':0,'sunday':0,
  'الاثنين':1,'الإثنين':1,'monday':1,
  'الثلاثاء':2,'tuesday':2,
  'الأربعاء':3,'الاربعاء':3,'wednesday':3,
  'الخميس':4,'thursday':4,
  'الجمعة':5,'friday':5,
  'السبت':6,'saturday':6
};

function offIdx(){
  const r = String(S.user?.profile?.offDays||'').toLowerCase();
  return [...new Set(
    r.split(/[،,;؛+\/|]+/).map(s=>s.trim())
     .filter(s=>offM[s]!==undefined).map(s=>offM[s])
  )];
}

function isWorkday(d = new Date()){
  if(!S.user) return false;
  const o = offIdx();
  if(o.length) return !o.includes(d.getDay());
  const n = Number(S.user.profile.workDays) || 5;
  if(n >= 7) return true;
  return d.getDay() >= 1 && d.getDay() <= Math.min(n,6);
}

function workWin(d = new Date()){
  const p = S.user.profile;
  const s = new Date(d);
  s.setHours(Math.floor(tM(p.workStart)/60), tM(p.workStart)%60, 0, 0);
  const e = new Date(d);
  e.setHours(Math.floor(tM(p.workEnd)/60), tM(p.workEnd)%60, 0, 0);
  if(e <= s) e.setDate(e.getDate() + 1);
  return {start:s, end:e};
}

function hourRate(){
  if(!S.user) return 0;
  const p = S.user.profile;
  const sal = Number(p.salary) || 0;
  if(p.salaryType === 'hourly') return sal;
  const h = hB(p.workStart, p.workEnd);
  const days = Number(p.workDays) || 5;
  return h > 0 ? sal / (days * 4.345 * h) : 0;
}

function calcToday(){
  if(!S.user) return {h:0, e:0, locked:true, mode:'off'};
  const now = new Date();
  if(!isWorkday(now)) return {h:0, e:0, locked:true, mode:'off'};

  const rate = hourRate();
  const {start, end} = workWin(now);
  const fullHours = (end - start) / 3600000;

  const mc = S.user.workControl;
  if(mc && mc.date === dk() && mc.startedAt){
    const ms = new Date(mc.startedAt);
    const me = mc.stoppedAt ? new Date(mc.stoppedAt) : now;
    const s = ms > start ? ms : start;
    const e = me < end ? me : end;
    const hrs = Math.max(0, (e - s) / 3600000);
    return {h:hrs, e:rate*hrs, locked:!!mc.stoppedAt || now>=end, mode:'manual'};
  }

  if(now < start) return {h:0, e:0, locked:false, mode:'auto'};
  if(now >= end)  return {h:fullHours, e:rate*fullHours, locked:true, mode:'auto'};
  const hrs = (now - start) / 3600000;
  return {h:hrs, e:rate*hrs, locked:false, mode:'auto'};
}

function collectPastDays(){
  if(!S.user) return;
  const created = new Date(S.user.createdAt);
  created.setHours(0,0,0,0);
  const today = new Date();
  today.setHours(0,0,0,0);

  const earnings = {...(S.user.dailyEarnings || {})};
  let changed = false;
  const rate = hourRate();

  const d = new Date(created);
  while(d < today){
    const k = dk(d);
    if(earnings[k] === undefined){
      if(isWorkday(d)){
        const {start, end} = workWin(d);
        earnings[k] = rate * ((end - start) / 3600000);
      } else {
        earnings[k] = 0;
      }
      changed = true;
    }
    d.setDate(d.getDate() + 1);
  }

  const now = new Date();
  const todayKey = dk();
  if(isWorkday(now)){
    const {start, end} = workWin(now);
    if(now >= end && earnings[todayKey] === undefined){
      earnings[todayKey] = rate * ((end - start) / 3600000);
      changed = true;
    }
  }

  if(changed) saveU({dailyEarnings: earnings});
}

function totalCollected(){
  const e = S.user?.dailyEarnings || {};
  return Object.values(e).reduce((a,b) => a + (Number(b)||0), 0);
}

function grandTotal(){
  return totalCollected() + calcToday().e;
}

function monthCollected(){
  if(!S.user) return 0;
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const e = S.user.dailyEarnings || {};
  return Object.entries(e)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((a,[,v]) => a + (Number(v)||0), 0);
}

function todayStatus(){
  const s = calcToday();
  if(s.mode === 'off') return {state:'إجازة اليوم', meta:'لا يوجد احتساب', ...s};
  if(s.locked)         return {state:'انتهى وقت العمل', meta:'اكتمل مكسب اليوم', ...s};
  const p = S.user.profile;
  const {start} = workWin();
  const n = new Date();
  if(n < start) return {state:'قبل بداية العمل', meta:`يبدأ ${p.workStart}`, ...s};
  if(s.mode === 'manual') return {state:'عمل يدوي جارٍ', meta:'الجلسة محفوظة', ...s};
  return {state:'يعمل تلقائيًا', meta:`يتوقف ${p.workEnd}`, ...s};
}

function monthProgress(){
  if(!S.user) return 0;
  const n = new Date();
  const first = new Date(n.getFullYear(), n.getMonth(), 1);
  const last  = new Date(n.getFullYear(), n.getMonth()+1, 0);
  let sc=0, el=0;
  for(let d = new Date(first); d <= last; d.setDate(d.getDate()+1)){
    const dt = new Date(d);
    if(!isWorkday(dt)) continue;
    const {start, end} = workWin(dt);
    sc += end - start;
    if(dk(dt) < dk(n)) el += end - start;
    else if(dk(dt) === dk(n)) el += Math.max(0, Math.min(n, end) - start);
  }
  return sc ? Math.min(100, Math.round(el/sc*100)) : 0;
}

// ═══════════════ UI HELPERS ═══════════════
function toast(t){
  const e = document.createElement('div');
  e.className = 'toast';
  e.textContent = t;
  $('toast').appendChild(e);
  setTimeout(() => e.remove(), 3000);
}

function shMsg(id, t, ty='error'){
  const e = $(id);
  if(!e) return;
  e.textContent = t;
  e.className = 'msg ' + ty;
}

function dlg(title, desc, body){
  const m = $('modal');
  m.classList.remove('hidden');
  m.innerHTML = `<div class="dialog">
    <div class="dhead">
      <div>
        <span class="eyebrow">YOURSELF</span>
        <h3>${esc(title)}</h3>
        ${desc ? `<p style="font-size:12.5px;color:var(--ink3);margin-top:3px">${esc(desc)}</p>` : ''}
      </div>
      <button class="dclose" onclick="YS.closeDlg()">×</button>
    </div>
    ${body}
  </div>`;
}

function closeDlg(){
  const m = $('modal');
  m.classList.add('hidden');
  m.innerHTML = '';
}

function setTheme(n){
  document.documentElement.className = '';
  if(n && n !== 'teal') document.documentElement.classList.add('theme-' + n);
  const p = gP(); p.theme = n; sP(p);
  $$('.theme-tile').forEach(b => b.classList.toggle('on', b.dataset.theme === n));
}

// ═══════════════ SCREENS ═══════════════
function hideAll(){
  ['s-login','s-signup','s-pending','s-app'].forEach(i => $(i)?.classList.add('hidden'));
}
function showLogin(){
  hideAll();
  $('s-login').classList.remove('hidden');
  $('lEmail').value = '';
  $('lPass').value = '';
  shMsg('lMsg','');
}
function showSignup(){
  hideAll();
  $('s-signup').classList.remove('hidden');
  $('f-account').classList.remove('hidden');
  $('f-wizard').classList.add('hidden');
  shMsg('aMsg','');
  shMsg('wMsg','');
}
function showWizard(){
  $('f-account').classList.add('hidden');
  $('f-wizard').classList.remove('hidden');
  setWiz(1);
  shMsg('wMsg','');
}
function showPending(email){
  hideAll();
  $('s-pending').classList.remove('hidden');
  $('pendEmail').textContent = email;
}
function showApp(u){
  S.user = normU(u);
  S.isDev = DEV_EMAILS.includes(emailOf(u.email));
  collectPastDays();
  hideAll();
  $('s-app').classList.remove('hidden');
  $('tabDev').classList.toggle('hidden', !S.isDev);
  renderAll();
  go('home');
  startTick();
  startStatusBar();
}
function logout(){
  cS();
  if(S.tick) clearInterval(S.tick);
  S.user = null;
  S.isDev = false;
  showLogin();
}

// ═══════════════ AUTH ═══════════════
function doLogin(e){
  e.preventDefault();
  const em = emailOf($('lEmail').value);
  const pw = $('lPass').value;
  if(!em || !pw) return shMsg('lMsg','أدخل البريد وكلمة المرور.');

  // Developer login — by email only
  if(DEV_EMAILS.includes(em)){
    if(DEV_PASSWORDS[em] !== pw){
      return shMsg('lMsg','كلمة مرور المطوّر غير صحيحة.');
    }
    let u = lU().find(x => emailOf(x.email) === em);
    if(!u){
      u = newU({
        name: em.split('@')[0],
        email: em,
        password: pw,
        status: 'approved',
        role: 'developer',
        profile: {...defProf(), job:'Developer', salary:0, workStart:'09:00', workEnd:'18:00'}
      });
      const l = lU(); l.push(u); sU(l);
    } else {
      const l = lU();
      const i = l.findIndex(x => x.id === u.id);
      l[i].role = 'developer';
      l[i].status = 'approved';
      sU(l);
      u = l[i];
    }
    sS(u.email);
    return showApp(u);
  }

  // Normal user
  const u = lU().find(x => emailOf(x.email) === em);
  if(!u || u.password !== pw) return shMsg('lMsg','بيانات الدخول غير صحيحة.');

  if(u.status === 'pending')
    return shMsg('lMsg','حسابك قيد مراجعة المطوّر. يرجى الانتظار حتى الموافقة.', 'info');

  if(u.status === 'rejected')
    return shMsg('lMsg','تم رفض طلب إنشاء حسابك. تواصل مع المطوّر.');

  sS(u.email);
  showApp(u);
}

function doAccount(e){
  e.preventDefault();
  const n = $('aName').value.trim();
  const em = emailOf($('aEmail').value);
  const p = $('aPass').value;
  const p2 = $('aPass2').value;

  if(!n) return shMsg('aMsg','اكتب اسمك.');
  if(!em || !/\S+@\S+\.\S+/.test(em)) return shMsg('aMsg','بريد غير صالح.');
  if(p.length < 8) return shMsg('aMsg','كلمة المرور 8 أحرف على الأقل.');
  if(p !== p2) return shMsg('aMsg','التأكيد غير مطابق.');
  if(lU().some(x => emailOf(x.email) === em) || DEV_EMAILS.includes(em))
    return shMsg('aMsg','البريد مستخدم.');

  S.tempAcc = {name:n, email:em, password:p};
  showWizard();
}

function setWiz(s){
  S.wiz = s;
  $$('.pane').forEach(p => p.classList.toggle('on', +p.dataset.pane === s));
  $$('.step[data-s]').forEach(el => {
    const n = +el.dataset.s;
    el.classList.toggle('on', n === s);
    el.classList.toggle('done', n < s);
    const b = el.querySelector('b');
    if(b) b.textContent = n < s ? '✓' : (n+1);
  });
  const prev = $('wPrev'), next = $('wNext'), fin = $('wFinish');
  if(prev) prev.disabled = s === 1;
  if(next) next.classList.toggle('hidden', s === 3);
  if(fin)  fin.classList.toggle('hidden', s !== 3);
  shMsg('wMsg','');
}

function wizNext(){
  const s = S.wiz;
  if(s === 2){
    const j = $('wJob').value.trim();
    const sal = Number($('wSalary').value);
    if(!j) return shMsg('wMsg','اكتب الوظيفة.');
    if(!sal || sal <= 0) return shMsg('wMsg','أدخل الدخل.');
  }
  setWiz(Math.min(3, s+1));
}

function wizPrev(){
  if(S.wiz > 1) setWiz(S.wiz-1);
  else showSignup();
}

function doRegister(e){
  e.preventDefault();
  if(!S.tempAcc) return showSignup();
  const act = document.querySelector('input[name="act"]:checked')?.value || 'moderate';

  const u = newU({
    name: S.tempAcc.name,
    email: S.tempAcc.email,
    password: S.tempAcc.password,
    status: 'pending',
    role: 'user',
    profile: {
      job: $('wJob').value.trim(),
      salaryType: $('wType').value,
      salary: Number($('wSalary').value) || 0,
      workDays: Number($('wDays').value) || 5,
      workStart: $('wStart').value || '08:30',
      workEnd: $('wEnd').value || '17:00',
      offDays: $('wOff').value.trim() || 'الجمعة، السبت',
      wake: $('wWake').value || '07:00',
      sleep: $('wSleep').value || '23:00',
      goal: $('wGoal').value,
      activity: act,
      age: $('wAge').value,
      weight: $('wWeight').value,
      height: $('wHeight').value,
      calorieGoal: Number($('wCalGoal').value) || 2000,
      waterGoal: Number($('wWaterGoal').value) || 8
    },
    dailyEarnings: {}
  });

  const d = dk();
  u.planner = [
    {id:uid(),date:d,time:u.profile.workStart,title:'بداية العمل',category:'عمل',done:false},
    {id:uid(),date:d,time:u.profile.workEnd,title:'إغلاق العمل',category:'عمل',done:false}
  ];

  const l = lU(); l.push(u); sU(l);
  const em = u.email;
  S.tempAcc = null;
  showPending(em);
  toast('تم إرسال طلبك للمطوّر');
}

// ═══════════════ NAV ═══════════════
function go(p){
  if(!S.user) return;
  S.page = p;
  $$('.page').forEach(x => x.classList.toggle('on', x.id === 'pg-' + p));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.page === p));
  if(p === 'home')     renderHome();
  if(p === 'work')     renderWork();
  if(p === 'money')    renderMoney();
  if(p === 'planner')  renderPlanner();
  if(p === 'notes')    renderNotes();
  if(p === 'exercise') renderExercise();
  if(p === 'diet')     renderDiet();
  if(p === 'health')   renderHealth();
  if(p === 'settings') renderSettings();
  if(p === 'dev')      renderDev();
}

function startTick(){
  if(S.tick) clearInterval(S.tick);
  S.tick = setInterval(() => {
    if(S.user && S.page === 'home') renderHome();
  }, 1000);
}

function startStatusBar(){
  const update = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    const el = $('stTime');
    if(el) el.textContent = `${hh}:${mm}:${ss}`;
    const us = $('stUser');
    if(us && S.user) us.textContent = S.user.email;
  };
  update();
  setInterval(update, 1000);
}

// ═══════════════ RENDER ═══════════════
function renderTop(){
  const n = S.user.name || 'صديقي';
  $('uName').textContent = n;
  $('uJob').textContent = S.user.profile.job || 'مساحتك';
  $('hName').textContent = n.split(' ')[0];
  $('avatar').textContent = n.trim().charAt(0).toUpperCase() || 'Y';
}

function renderAll(){
  renderTop();
  renderHome(); renderWork(); renderMoney(); renderPlanner();
  renderNotes(); renderExercise(); renderDiet(); renderHealth(); renderSettings();
  if(S.isDev) renderDev();
}

function fDur(ms){
  const t = Math.max(0, Math.floor(ms/1000));
  return [Math.floor(t/3600), Math.floor((t%3600)/60), t%60]
    .map(x => String(x).padStart(2,'0')).join(':');
}

function renderHome(){
  if(!S.user) return;
  const p = S.user.profile;
  const n = new Date();

  $('wDay').textContent = dayName(n);
  $('dDate').textContent = dAr(n);
  if($('hSub')) $('hSub').textContent = `هدفك: ${p.goal} · الدوام ${p.workStart} → ${p.workEnd}`;

  const st = todayStatus();
  const rate = hourRate();
  const total = grandTotal();
  const month = monthCollected();
  const collected = totalCollected();

  $('kTotal').textContent = fM(total);
  $('kToday').textContent = fM(st.e);
  $('kTodayMeta').textContent = st.state;
  $('kHour').textContent = fM(rate);
  $('kMonth').textContent = fM(month);

  $('clockBadge').textContent = st.state;
  $('clockState').textContent = st.state;
  $('clockMeta').textContent = st.meta;
  $('timer').textContent = fDur(st.h * 3600000);
  $('clockEarn').textContent = fMoney(st.e);
  $('clockRing').style.strokeDashoffset = 327 - (327 * Math.min(1, st.h/8));

  const active = S.user.workControl?.date === dk()
    && S.user.workControl?.startedAt
    && !S.user.workControl?.stoppedAt;
  $('btnStart').disabled = !!active || st.mode === 'off' || st.locked;
  $('btnStop').disabled = !active;
  $('btnStart').textContent = active ? 'جلسة جارية' : 'بدء يدوي';

  $('earnTotal').textContent = fMoney(collected);
  const days = Object.keys(S.user.dailyEarnings || {}).filter(k => (S.user.dailyEarnings[k] || 0) > 0).length;
  $('earnDays').textContent = days;
  $('earnToday').textContent = fMoney(st.e);
  $('earnAvg').textContent = fMoney(days > 0 ? collected / days : 0);

  const today = dk();
  const next = S.user.planner.filter(x => x.date === today).sort((a,b) => a.time.localeCompare(b.time)).slice(0, 5);
  $('nextList').innerHTML = next.length
    ? next.map(x => `<div class="tl"><time>${esc(x.time)}</time><i></i><div><b>${esc(x.title)}</b><span>${esc(x.category || 'مهمة')}</span></div></div>`).join('')
    : '<div class="empty"><b>يومك مفتوح</b><span>أضف مهمة.</span></div>';

  const notes = S.user.notes.slice()
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
  $('notePreview').innerHTML = notes.length
    ? notes.map(x => `<div class="np-item"><b>${esc(x.title)}</b><span>${esc((x.content || '').slice(0, 100))}</span></div>`).join('')
    : '<div class="empty"><b>المذكرة جاهزة</b><span>اكتب أول ملاحظة.</span></div>';
}

function manualStart(){
  const k = dk();
  if(!isWorkday(new Date())) return toast('اليوم إجازة.');
  const {end} = workWin();
  if(new Date() >= end) return toast('انتهى وقت العمل.');
  saveU({workControl:{date:k, startedAt:new Date().toISOString(), stoppedAt:null}});
  renderHome();
  toast('بدأت الجلسة.');
}

function manualStop(){
  if(!S.user.workControl?.startedAt) return;
  saveU({workControl: {...S.user.workControl, stoppedAt: new Date().toISOString()}});
  renderHome();
  toast('تم حفظ الجلسة.');
}

function renderWork(){
  if(!S.user) return;
  const p = S.user.profile;
  const rate = hourRate();
  const prog = monthProgress();

  $('bigRate').textContent = fM(rate);
  $('wSalaryV').textContent = fMoney(p.salary);
  $('wHoursD').textContent = hB(p.workStart, p.workEnd).toFixed(1);
  $('wDaysV').textContent = p.workDays;
  $('wSched').textContent = `${p.workStart} → ${p.workEnd}`;
  $('monthPct').textContent = prog + '%';
  $('monthBar').style.width = prog + '%';

  const entries = Object.entries(S.user.dailyEarnings || {})
    .sort((a,b) => b[0].localeCompare(a[0])).slice(0, 20);

  $('daysList').innerHTML = entries.length
    ? entries.map(([k, v]) => {
        const d = new Date(k);
        const isToday = k === dk();
        const isOff = !isWorkday(d);
        return `<div class="day-row">
          <div><b>${dayName(d)}</b><small>${dAr(d)}</small></div>
          <span class="kind ${isOff ? 'off' : 'earn'}">${isOff ? 'إجازة' : (isToday ? 'اليوم' : 'مكتمل')}</span>
          <b>${fMoney(v)}</b>
        </div>`;
      }).join('')
    : '<div class="empty"><b>لا يوجد سجل بعد</b><span>سيبدأ التتبع من أول يوم عمل.</span></div>';

  renderEarnChart();
}

function renderEarnChart(){
  const entries = [];
  const today = new Date();
  for(let i = 29; i >= 0; i--){
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = dk(d);
    entries.push({
      key: k,
      day: d.getDate(),
      value: S.user.dailyEarnings[k] || (i === 0 ? calcToday().e : 0)
    });
  }
  const max = Math.max(1, ...entries.map(e => e.value));
  $('earnChart').innerHTML = entries.map(e => {
    const h = Math.max(6, (e.value / max) * 160);
    return `<div class="wc-bar" style="height:${h}px" title="${e.key}: ${fMoney(e.value)}">
      <b>${e.value > 0 ? fM(e.value) : ''}</b>
      <span>${e.day}</span>
    </div>`;
  }).join('');
}

function openEditWork(){
  const p = S.user.profile;
  dlg('بيانات العمل', 'حدّث الدخل والدوام.', `
    <div class="two">
      <label>الدخل الأساسي<input id="ewSalary" type="number" value="${p.salary}"></label>
      <label>نوع الدخل<select id="ewType">
        <option value="monthly" ${p.salaryType==='monthly'?'selected':''}>شهري</option>
        <option value="hourly" ${p.salaryType==='hourly'?'selected':''}>بالساعة</option>
      </select></label>
      <label>أيام / أسبوع<input id="ewDays" type="number" min="1" max="7" value="${p.workDays}"></label>
      <label>أيام الإجازة<input id="ewOff" value="${esc(p.offDays)}"></label>
      <label>بداية العمل<input id="ewStart" type="time" value="${p.workStart}"></label>
      <label>نهاية العمل<input id="ewEnd" type="time" value="${p.workEnd}"></label>
    </div>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveWork()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveWork(){
  saveU({profile: {...S.user.profile,
    salary: Number($('ewSalary').value) || 0,
    salaryType: $('ewType').value,
    workDays: Number($('ewDays').value) || 5,
    offDays: $('ewOff').value.trim(),
    workStart: $('ewStart').value,
    workEnd: $('ewEnd').value
  }});
  closeDlg();
  renderAll();
  toast('تم التحديث.');
}

function renderMoney(){
  if(!S.user) return;
  const items = S.user.finance || [];
  const exp = items.filter(x => x.kind === 'expense').reduce((a,x) => a + Number(x.amount||0), 0);
  const ext = items.filter(x => x.kind === 'extra').reduce((a,x) => a + Number(x.amount||0), 0);
  const earned = grandTotal();
  const net = earned + ext - exp;

  $('mnNet').textContent = fM(Math.max(0, net));
  $('mnEarn').textContent = fM(earned);
  $('mnExp').textContent = fM(exp);
  $('mnExt').textContent = fM(ext);

  const bud = S.user.profile.budget || {};
  const cats = [
    {id:'food', name:'طعام', c:'#14B8A6'},
    {id:'transport', name:'مواصلات', c:'#F59E0B'},
    {id:'bills', name:'فواتير', c:'#DC2626'},
    {id:'shopping', name:'تسوق', c:'#7C3AED'},
    {id:'fun', name:'ترفيه', c:'#DB2777'},
    {id:'other', name:'أخرى', c:'#64748B'}
  ];
  const spent = {};
  items.filter(x => x.kind === 'expense').forEach(x => {
    const c = x.category || 'other';
    spent[c] = (spent[c] || 0) + Number(x.amount || 0);
  });

  $('budgetList').innerHTML = cats.map(c => {
    const limit = Number(bud[c.id]) || 0;
    const used = spent[c.id] || 0;
    const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
    return `<div class="budget-row">
      <div class="budget-head"><b>${c.name}</b><span>${fM(used)} / ${fM(limit)}</span></div>
      <div class="budget-bar"><i style="width:${pct}%;background:${c.c}"></i></div>
    </div>`;
  }).join('');

  const list = items.filter(x => S.mFilter === 'all' || x.kind === S.mFilter)
    .slice().reverse().slice(0, 15);

  $('moneyList').innerHTML = list.length
    ? list.map(x => `<div class="row">
        <div><b>${esc(x.title)}</b><small>${shAr(new Date(x.createdAt))}</small></div>
        <span class="kind ${x.kind}">${x.kind === 'expense' ? 'مصروف' : 'دخل'}</span>
        <button class="del" onclick="YS.removeMoney('${x.id}')">×</button>
        <b>${x.kind === 'expense' ? '-' : '+'}${fM(x.amount)}</b>
      </div>`).join('')
    : '<div class="empty"><b>لا توجد حركات</b><span>أضف أول حركة.</span></div>';
}

function removeMoney(id){
  saveU({finance: S.user.finance.filter(x => x.id !== id)});
  renderMoney(); renderHome();
  toast('تم الحذف.');
}

function openAddMoney(){
  const cats = [
    ['food','طعام'], ['transport','مواصلات'], ['bills','فواتير'],
    ['shopping','تسوق'], ['fun','ترفيه'], ['other','أخرى']
  ];
  dlg('حركة مالية', '', `
    <div class="two">
      <label>النوع<select id="mKind">
        <option value="expense">مصروف</option>
        <option value="extra">دخل إضافي</option>
      </select></label>
      <label>المبلغ<input id="mAmt" type="number" placeholder="250"></label>
    </div>
    <label>الوصف<input id="mTitle" placeholder="مثال: غداء"></label>
    <label>التصنيف<select id="mCat">
      ${cats.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}
    </select></label>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveMoney()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveMoney(){
  const amt = Number($('mAmt').value) || 0;
  if(amt <= 0) return toast('أدخل مبلغًا.');
  const item = {
    id: uid(),
    kind: $('mKind').value,
    amount: amt,
    title: $('mTitle').value.trim() || 'حركة',
    category: $('mCat').value,
    createdAt: new Date().toISOString()
  };
  saveU({finance: [...S.user.finance, item]});
  closeDlg(); renderMoney(); renderHome();
  toast('تم الحفظ.');
}

function openEditBudget(){
  const b = S.user.profile.budget || {};
  dlg('الميزانية الشهرية', 'حدد الميزانية لكل تصنيف.', `
    <div class="two">
      <label>طعام<input id="bFood" type="number" value="${b.food||0}"></label>
      <label>مواصلات<input id="bTransport" type="number" value="${b.transport||0}"></label>
      <label>فواتير<input id="bBills" type="number" value="${b.bills||0}"></label>
      <label>تسوق<input id="bShopping" type="number" value="${b.shopping||0}"></label>
      <label>ترفيه<input id="bFun" type="number" value="${b.fun||0}"></label>
      <label>أخرى<input id="bOther" type="number" value="${b.other||0}"></label>
    </div>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveBudget()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveBudget(){
  const b = {
    food: Number($('bFood').value) || 0,
    transport: Number($('bTransport').value) || 0,
    bills: Number($('bBills').value) || 0,
    shopping: Number($('bShopping').value) || 0,
    fun: Number($('bFun').value) || 0,
    other: Number($('bOther').value) || 0
  };
  saveU({profile: {...S.user.profile, budget: b}});
  closeDlg(); renderMoney();
  toast('تم الحفظ.');
}

function renderPlanner(){
  if(!S.user) return;
  const d = S.pDate;
  const k = dk(d);
  const items = S.user.planner.filter(x => x.date === k);

  $('planDay').textContent = dayName(d);
  $('planDate').textContent = dAr(d);

  let h = '';
  for(let x = 6; x <= 23; x++){
    const hh = String(x).padStart(2,'0');
    const f = items.filter(i => String(i.time).startsWith(hh + ':'));
    h += `<div class="hour">
      <div class="hour-time">${hh}:00</div>
      <div class="slot ${f.length ? '' : 'empty'}">
        ${f.map(i => `<div class="chip"><span>${esc(i.title)}</span><b>${esc(i.time)}</b></div>`).join('')}
      </div>
    </div>`;
  }
  $('schedule').innerHTML = h;

  const p = S.user.profile;
  $('routine').innerHTML = [
    ['الاستيقاظ', p.wake],
    ['الذهاب', p.goWork || '—'],
    ['العمل', `${p.workStart} → ${p.workEnd}`],
    ['النوم', p.sleep]
  ].map(x => `<div class="rr"><span>${x[0]}</span><b>${esc(x[1] || '—')}</b></div>`).join('');

  renderFocus();
}

function openAddTask(){
  dlg('مهمة جديدة', '', `
    <div class="two">
      <label>التاريخ<input id="tDate" type="date" value="${dk(S.pDate)}"></label>
      <label>الوقت<input id="tTime" type="time" value="09:00"></label>
    </div>
    <label>العنوان<input id="tTitle" placeholder="مثال: اجتماع"></label>
    <label>التصنيف<select id="tCat">
      <option>عمل</option><option>تعلم</option><option>استراحة</option>
      <option>صحة</option><option>شخصي</option>
    </select></label>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveTask()">إضافة</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveTask(){
  const t = $('tTitle').value.trim();
  if(!t) return toast('اكتب العنوان.');
  saveU({planner: [...S.user.planner, {
    id: uid(), date: $('tDate').value, time: $('tTime').value,
    title: t, category: $('tCat').value, done: false
  }]});
  closeDlg(); renderPlanner(); renderHome();
  toast('تمت الإضافة.');
}

function renderFocus(){
  $('focusTimer').textContent = `${String(Math.floor(S.focus.s/60)).padStart(2,'0')}:${String(S.focus.s%60).padStart(2,'0')}`;
  $('focusToggle').textContent = S.focus.r ? 'إيقاف' : 'بدء';
}

function toggleFocus(){
  if(S.focus.r){
    clearInterval(S.focus.i);
    S.focus.r = false;
  } else {
    S.focus.r = true;
    S.focus.i = setInterval(() => {
      S.focus.s--;
      if(S.focus.s <= 0){ resetFocus(); toast('انتهت الجلسة'); }
      renderFocus();
    }, 1000);
  }
  renderFocus();
}

function resetFocus(){
  clearInterval(S.focus.i);
  S.focus.r = false;
  S.focus.s = 1500;
  renderFocus();
}

function renderNotes(){
  if(!S.user) return;
  let l = S.user.notes.slice();
  if(S.nFilter === 'pinned') l = l.filter(x => x.pinned);
  if(S.nSearch) l = l.filter(x => `${x.title} ${x.content}`.toLowerCase().includes(S.nSearch));
  l.sort((a,b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));

  $('notesGrid').innerHTML = l.length
    ? l.map(n => `<article class="note-card ${n.pinned ? 'pin-card' : ''}">
        <div class="note-top">
          <span class="note-type">${esc(n.category || 'عام')}</span>
          <button class="pin" onclick="YS.pinNote('${n.id}')">${n.pinned ? '★' : '☆'}</button>
        </div>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.content)}</p>
        <div class="note-foot">
          <small>${shAr(new Date(n.updatedAt))}</small>
          <div class="acts">
            <button onclick="YS.editNote('${n.id}')">✎</button>
            <button onclick="YS.removeNote('${n.id}')">×</button>
          </div>
        </div>
      </article>`).join('')
    : '<div class="card" style="grid-column:1/-1;text-align:center;padding:36px"><b style="font-size:14px">لا توجد ملاحظات</b></div>';
}

function openNote(n = null){
  const x = n || {title:'', content:''};
  dlg(n ? 'تعديل الملاحظة' : 'ملاحظة جديدة', '', `
    <label>العنوان<input id="nT" value="${esc(x.title)}"></label>
    <label>المحتوى<textarea id="nC">${esc(x.content)}</textarea></label>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveNote('${x.id||''}')">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveNote(id){
  const c = $('nC').value.trim();
  if(!c) return toast('اكتب المحتوى.');
  const old = S.user.notes.find(x => x.id === id);
  const n = {
    id: id || uid(),
    title: $('nT').value.trim() || 'بدون عنوان',
    content: c,
    category: old?.category || 'عام',
    pinned: old?.pinned || false,
    updatedAt: new Date().toISOString()
  };
  saveU({notes: [...S.user.notes.filter(x => x.id !== n.id), n]});
  closeDlg(); renderNotes(); renderHome();
  toast('تم الحفظ.');
}

function editNote(id){
  const n = S.user.notes.find(x => x.id === id);
  if(n) openNote(n);
}
function pinNote(id){
  saveU({notes: S.user.notes.map(x => x.id === id ? {...x, pinned: !x.pinned} : x)});
  renderNotes();
}
function removeNote(id){
  saveU({notes: S.user.notes.filter(x => x.id !== id)});
  renderNotes(); renderHome();
  toast('تم الحذف.');
}

function renderExercise(){
  if(!S.user) return;
  const now = new Date();
  const wAgo = new Date(now.getTime() - 7*86400000);
  const ww = S.user.workouts.filter(w => new Date(w.createdAt) >= wAgo);

  $('wkCount').textContent = ww.length;
  $('wkReps').textContent = fM(ww.reduce((a,w) => a + (Number(w.reps)||0) * (Number(w.sets)||1), 0));
  $('wkVol').textContent = fM(ww.reduce((a,w) => a + (Number(w.weight)||0) * (Number(w.reps)||0) * (Number(w.sets)||1), 0));
  $('wkMin').textContent = fM(ww.reduce((a,w) => a + (Number(w.duration)||0), 0));

  const l = S.user.workouts.filter(w => S.exFilter === 'all' || w.category === S.exFilter).slice().reverse();
  $('workoutList').innerHTML = l.length
    ? l.map(w => `<div class="workout-item cat-${w.category}">
        <div class="wo-head"><b>${esc(w.name)}</b><span>${shAr(new Date(w.createdAt))}</span></div>
        <div class="wo-meta">
          <div><span>مجموعات</span><b>${w.sets || 0}</b></div>
          <div><span>تكرار</span><b>${w.reps || 0}</b></div>
          <div><span>وزن</span><b>${w.weight || 0}</b></div>
          <div><span>دقائق</span><b>${w.duration || 0}</b></div>
        </div>
        <button class="wo-del" onclick="YS.removeWorkout('${w.id}')">حذف</button>
      </div>`).join('')
    : '<div class="empty"><b>لا تمارين</b><span>أضف جلستك الأولى.</span></div>';

  const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const c = [0,0,0,0,0,0,0];
  ww.forEach(w => { c[new Date(w.createdAt).getDay()]++; });
  const mx = Math.max(1, ...c);
  $('weekChart').innerHTML = c.map((v,i) =>
    `<div class="wc-bar" style="height:${Math.max(6, (v/mx)*150)}px">
      <b>${v || ''}</b><span>${days[i].slice(0,3)}</span>
    </div>`).join('');
}

function openWorkout(){
  dlg('تمرين جديد', '', `
    <label>الاسم<input id="exN" placeholder="بنش برس"></label>
    <div class="two">
      <label>النوع<select id="exC">
        <option value="gym">جيم</option>
        <option value="cardio">كارديو</option>
        <option value="home">منزلي</option>
      </select></label>
      <label>دقائق<input id="exD" type="number" placeholder="45"></label>
      <label>مجموعات<input id="exS" type="number" placeholder="4"></label>
      <label>تكرار<input id="exR" type="number" placeholder="10"></label>
    </div>
    <label>الوزن (kg)<input id="exW" type="number" step="0.5" placeholder="60"></label>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveWorkout()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveWorkout(){
  const n = $('exN').value.trim();
  if(!n) return toast('اكتب الاسم.');
  saveU({workouts: [...S.user.workouts, {
    id: uid(), name: n,
    category: $('exC').value,
    sets: Number($('exS').value) || 0,
    reps: Number($('exR').value) || 0,
    weight: Number($('exW').value) || 0,
    duration: Number($('exD').value) || 0,
    createdAt: new Date().toISOString()
  }]});
  closeDlg(); renderExercise();
  toast('تم الحفظ.');
}

function removeWorkout(id){
  saveU({workouts: S.user.workouts.filter(x => x.id !== id)});
  renderExercise();
  toast('تم الحذف.');
}

function renderDiet(){
  if(!S.user) return;
  const t = dk();
  const m = S.user.meals.filter(x => x.date === t);

  $('calToday').textContent = fM(m.reduce((a,x) => a + (Number(x.kcal)||0), 0));
  $('calGoal').textContent = fM(S.user.profile.calorieGoal || 2000);
  const w = S.user.waterLog[t] || 0;
  const wg = S.user.profile.waterGoal || 8;
  $('waterCount').textContent = `${w}/${wg}`;
  $('protToday').textContent = m.reduce((a,x) => a + (Number(x.protein)||0), 0) + 'g';

  $('mealsList').innerHTML = m.length
    ? m.map(x => `<div class="meal-item">
        <div class="meal-info">
          <b>${esc(x.name)}</b>
          <small>${esc(x.type || 'وجبة')} · ${x.protein || 0}g بروتين</small>
          <button class="wo-del" onclick="YS.removeMeal('${x.id}')">حذف</button>
        </div>
        <span class="meal-kcal">${x.kcal || 0} kcal</span>
      </div>`).join('')
    : '<div class="empty"><b>لا وجبات</b><span>أضف وجبتك.</span></div>';

  let h = '';
  for(let i = 0; i < wg; i++){
    h += `<div class="water-cup ${i < w ? 'on' : ''}" onclick="YS.setWater(${i+1})">💧</div>`;
  }
  $('waterGrid').innerHTML = h;
}

function openMeal(){
  dlg('وجبة جديدة', '', `
    <label>الاسم<input id="mlN" placeholder="صدر دجاج"></label>
    <div class="two">
      <label>النوع<select id="mlT">
        <option>فطار</option><option>غداء</option><option>عشاء</option><option>سناك</option>
      </select></label>
      <label>سعرات<input id="mlK" type="number" placeholder="450"></label>
      <label>بروتين (g)<input id="mlP" type="number" placeholder="30"></label>
    </div>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveMeal()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveMeal(){
  const n = $('mlN').value.trim();
  if(!n) return toast('اكتب الاسم.');
  saveU({meals: [...S.user.meals, {
    id: uid(), date: dk(), name: n,
    type: $('mlT').value,
    kcal: Number($('mlK').value) || 0,
    protein: Number($('mlP').value) || 0
  }]});
  closeDlg(); renderDiet();
  toast('تم الحفظ.');
}

function removeMeal(id){
  saveU({meals: S.user.meals.filter(x => x.id !== id)});
  renderDiet();
  toast('تم الحذف.');
}

function addWater(){
  const t = dk();
  const g = S.user.profile.waterGoal || 8;
  const c = S.user.waterLog[t] || 0;
  if(c >= g) return toast('وصلت الهدف');
  saveU({waterLog: {...S.user.waterLog, [t]: c+1}});
  renderDiet();
}

function setWater(n){
  saveU({waterLog: {...S.user.waterLog, [dk()]: n}});
  renderDiet();
}

function resetWater(){
  saveU({waterLog: {...S.user.waterLog, [dk()]: 0}});
  renderDiet();
  toast('تم التصفير.');
}

const PLANS = {
  balanced: [['الصباح','ماء + ترتيب الأولويات'],['العمل','فواصل حركة قصيرة'],['بعد العمل','وجبة متنوعة + نشاط'],['المساء','نوم منتظم']],
  training: [['الأسبوع','3 جلسات نشاط'],['يوميًا','مشي أو حركة'],['الاستشفاء','إحماء وتهدئة'],['المساء','نوم منتظم']],
  diet:     [['الفطار','بروتين + كارب'],['الغداء','نصف الطبق خضار'],['العشاء','خفيف'],['الماء','8 أكواب']]
};

function renderHealth(){
  if(!S.user) return;
  const p = S.user.profile;
  $('hAge').textContent = p.age || '—';
  $('hWeight').textContent = p.weight || '—';
  $('hHeight').textContent = p.height || '—';

  const d = S.user.habits.filter(x => x.done).length;
  const pct = S.user.habits.length ? Math.round(d / S.user.habits.length * 100) : 0;
  $('habitPct').textContent = pct + '%';

  $('habits').innerHTML = S.user.habits.map(h =>
    `<div class="habit ${h.done ? 'done' : ''}">
      <button onclick="YS.toggleHabit('${h.id}')">${h.done ? '✓' : '○'}</button>
      <div><b>${esc(h.title)}</b><span>${esc(h.meta)}</span></div>
      <small>${h.done ? 'تم' : 'اليوم'}</small>
    </div>`).join('');

  $('healthPlan').innerHTML = (PLANS[S.user.healthPlan] || PLANS.balanced)
    .map(x => `<div class="plan-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
}

function toggleHabit(id){
  saveU({habits: S.user.habits.map(x => x.id === id ? {...x, done: !x.done} : x)});
  renderHealth();
}

function changePlan(){
  const o = ['balanced','training','diet'];
  const n = o[(o.indexOf(S.user.healthPlan) + 1) % o.length];
  saveU({healthPlan: n});
  renderHealth();
  toast('تم التغيير.');
}

function openHealth(){
  const p = S.user.profile;
  dlg('البيانات الصحية', '', `
    <div class="two">
      <label>العمر<input id="hA" type="number" value="${p.age || ''}"></label>
      <label>الوزن<input id="hW" type="number" step="0.1" value="${p.weight || ''}"></label>
      <label>الطول<input id="hH" type="number" step="0.1" value="${p.height || ''}"></label>
    </div>
    <div class="dactions">
      <button class="btn btn-primary" onclick="YS.saveHealth()">حفظ</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}

function saveHealth(){
  saveU({profile: {...S.user.profile, age: $('hA').value, weight: $('hW').value, height: $('hH').value}});
  closeDlg(); renderHealth();
  toast('تم الحفظ.');
}

let calcExp = '';
function calcKey(k){
  const d = $('calcDisp');
  if(k === 'C'){ calcExp = ''; d.value = '0'; $('calcHistory').textContent = ''; return; }
  if(k === '⌫'){ calcExp = calcExp.slice(0,-1); d.value = calcExp || '0'; return; }
  if(k === '='){
    try {
      const r = Function('"use strict";return(' + calcExp.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-') + ')')();
      d.value = Number(r).toLocaleString('en-US', {maximumFractionDigits: 8});
      $('calcHistory').textContent = calcExp + ' =';
      calcExp = String(r);
    } catch { d.value = 'خطأ'; }
    return;
  }
  calcExp += k;
  d.value = calcExp;
}

function toolHour(){
  const s = prompt('الراتب الشهري:');
  const d = prompt('عدد أيام العمل في الشهر:', '22');
  const h = prompt('عدد ساعات العمل في اليوم:', '8');
  if(!s || !d || !h) return;
  const r = Number(s) / (Number(d) * Number(h));
  toast('قيمة الساعة: ' + fMoney(r));
}
function toolDaily(){
  const s = prompt('الراتب الشهري:');
  const d = prompt('أيام العمل في الشهر:', '22');
  if(!s || !d) return;
  toast('المكسب اليومي: ' + fMoney(Number(s) / Number(d)));
}
function toolBMI(){
  const w = prompt('الوزن (kg):');
  const h = prompt('الطول (cm):');
  if(!w || !h) return;
  const bmi = Number(w) / Math.pow(Number(h)/100, 2);
  let cat = '';
  if(bmi < 18.5) cat = 'نقص';
  else if(bmi < 25) cat = 'طبيعي';
  else if(bmi < 30) cat = 'زيادة';
  else cat = 'سمنة';
  toast(`BMI: ${bmi.toFixed(1)} (${cat})`);
}
function toolCal(){
  const w = prompt('الوزن (kg):');
  const h = prompt('الطول (cm):');
  const a = prompt('العمر:');
  const g = prompt('النوع (m/f):', 'm');
  if(!w || !h || !a) return;
  const s = g === 'm' ? 5 : -161;
  const bmr = 10*Number(w) + 6.25*Number(h) - 5*Number(a) + s;
  toast('السعرات التقريبية: ' + Math.round(bmr * 1.5) + ' kcal');
}

function renderSettings(){
  if(!S.user) return;
  const p = S.user.profile;
  $('setName').value = S.user.name;
  $('setEmail').value = S.user.email;
  $('setJob').value = p.job || '';
  $('setStart').value = p.workStart || '';
  $('setEnd').value = p.workEnd || '';
  $('setCalGoal').value = p.calorieGoal || 2000;
  $('setWaterGoal').value = p.waterGoal || 8;
}

function saveSettings(e){
  e.preventDefault();
  saveU({
    name: $('setName').value.trim() || S.user.name,
    profile: {...S.user.profile,
      job: $('setJob').value.trim(),
      workStart: $('setStart').value,
      workEnd: $('setEnd').value,
      calorieGoal: Number($('setCalGoal').value) || 2000,
      waterGoal: Number($('setWaterGoal').value) || 8
    }
  });
  renderAll();
  toast('تم الحفظ.');
}

function delAccount(){
  dlg('حذف الحساب', 'لن يمكن استرجاعه.', `
    <div class="dactions">
      <button class="btn btn-danger" onclick="YS.confirmDel()">حذف نهائي</button>
      <button class="btn btn-ghost" onclick="YS.closeDlg()">إلغاء</button>
    </div>`);
}
function confirmDel(){
  sU(lU().filter(x => x.id !== S.user.id));
  cS();
  S.user = null;
  showLogin();
  toast('تم الحذف.');
}

function renderDev(){
  const l = lU();
  const p = l.filter(u => u.status === 'pending').length;
  const a = l.filter(u => u.status === 'approved').length;
  const r = l.filter(u => u.status === 'rejected').length;

  $('dTotal').textContent = l.length;
  $('dPend').textContent = p;
  $('dApp').textContent = a;
  $('dRej').textContent = r;
  $('fPend').textContent = p;

  let filtered = l;
  if(S.dFilter === 'pending') filtered = l.filter(u => u.status === 'pending');
  else if(S.dFilter === 'approved') filtered = l.filter(u => u.status === 'approved');
  else if(S.dFilter === 'rejected') filtered = l.filter(u => u.status === 'rejected');

  filtered.sort((a,b) => {
    const sa = a.status === 'pending' ? 0 : 1;
    const sb = b.status === 'pending' ? 0 : 1;
    if(sa !== sb) return sa - sb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  $('devList').innerHTML = filtered.length
    ? filtered.map(u => {
        const st = u.status || 'approved';
        const lbl = st === 'pending' ? 'قيد المراجعة' : st === 'approved' ? 'مقبول' : 'مرفوض';
        const init = (u.name || '?').trim().charAt(0).toUpperCase();
        return `<div class="user-card ${st}">
          <div class="uhead">
            <div class="uhead-l">
              <div class="uav">${init}</div>
              <div>
                <b>${esc(u.name || '—')}</b>
                <small>${esc(u.email || '—')}</small>
              </div>
            </div>
            <span class="st-tag ${st}">${lbl}</span>
          </div>
          <div class="udetails">
            <div><span>الوظيفة</span><b>${esc(u.profile?.job || '—')}</b></div>
            <div><span>الدخل</span><b>${fMoney(u.profile?.salary || 0)}</b></div>
            <div><span>الدوام</span><b>${esc(u.profile?.workStart || '—')} → ${esc(u.profile?.workEnd || '—')}</b></div>
            <div><span>ساعات / يوم</span><b>${hB(u.profile?.workStart || '00:00', u.profile?.workEnd || '00:00').toFixed(1)}h</b></div>
            <div><span>الإجازة</span><b>${esc(u.profile?.offDays || '—')}</b></div>
            <div><span>التسجيل</span><b>${shAr(new Date(u.createdAt))}</b></div>
          </div>
          <div class="uacts">
            ${st === 'pending' ? `
              <button class="btn btn-primary sm" onclick="YS.approve('${u.id}')">✓ قبول</button>
              <button class="btn btn-danger sm" onclick="YS.reject('${u.id}')">✕ رفض</button>
            ` : ''}
            ${st === 'approved' ? `
              <button class="btn btn-danger sm" onclick="YS.reject('${u.id}')">تعليق</button>
            ` : ''}
            ${st === 'rejected' ? `
              <button class="btn btn-primary sm" onclick="YS.approve('${u.id}')">إعادة قبول</button>
            ` : ''}
            <button class="btn btn-ghost sm" onclick="YS.delUser('${u.id}')">حذف</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty" style="grid-column:1/-1;padding:36px"><b>لا نتائج</b></div>';
}

function approve(id){
  const l = lU();
  const i = l.findIndex(x => x.id === id);
  if(i < 0) return;
  l[i].status = 'approved';
  l[i].approvedAt = new Date().toISOString();
  sU(l);
  renderDev();
  toast('تم القبول ✓');
}
function reject(id){
  const l = lU();
  const i = l.findIndex(x => x.id === id);
  if(i < 0) return;
  l[i].status = 'rejected';
  l[i].rejectedAt = new Date().toISOString();
  sU(l);
  renderDev();
  toast('تم الرفض.');
}
function delUser(id){
  if(!confirm('حذف الحساب؟')) return;
  sU(lU().filter(x => x.id !== id));
  renderDev();
  toast('تم الحذف.');
}

function gSearch(q){
  q = q.trim().toLowerCase();
  if(!q) return;
  const r = [];
  S.user.planner.forEach(t => { if(t.title.toLowerCase().includes(q)) r.push({type:'مهمة', text:t.title, page:'planner'}); });
  S.user.notes.forEach(n => { if((n.title + n.content).toLowerCase().includes(q)) r.push({type:'ملاحظة', text:n.title, page:'notes'}); });
  S.user.workouts.forEach(w => { if(w.name.toLowerCase().includes(q)) r.push({type:'تمرين', text:w.name, page:'exercise'}); });
  S.user.finance.forEach(f => { if(f.title.toLowerCase().includes(q)) r.push({type:'مالية', text:f.title, page:'money'}); });

  if(!r.length) return dlg('لا نتائج', `"${esc(q)}"`, '');

  dlg('نتائج البحث', `${r.length} نتيجة`, `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${r.slice(0,15).map(x => `
        <button class="tool-btn" onclick="YS.go('${x.page}');YS.closeDlg()" style="text-align:right">
          <small style="color:var(--ink3);font-size:10px">${x.type}</small>
          <div style="font-weight:600;font-size:13px;margin-top:2px">${esc(x.text)}</div>
        </button>
      `).join('')}
    </div>`);
}

function bind(){
  $$('[data-eye]').forEach(b => b.addEventListener('click', () => {
    const e = $(b.dataset.eye);
    e.type = e.type === 'password' ? 'text' : 'password';
    b.textContent = e.type === 'password' ? 'إظهار' : 'إخفاء';
  }));

  $('f-login').addEventListener('submit', doLogin);
  $('goSignup').addEventListener('click', showSignup);
  $('backLogin').addEventListener('click', showLogin);
  $('backLogin2').addEventListener('click', showLogin);
  $('f-account').addEventListener('submit', doAccount);
  $('f-wizard').addEventListener('submit', doRegister);
  $('wNext').addEventListener('click', wizNext);
  $('wPrev').addEventListener('click', wizPrev);

  $('f-wizard').addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.target.matches('textarea')){
      e.preventDefault();
      if(S.wiz < 3) wizNext();
      else doRegister(e);
    }
  });

  $$('.tab').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));

  $('profileBtn').addEventListener('click', () => go('settings'));
  $('themeBtn').addEventListener('click', () => {
    const o = ['teal','slate','dark','navy'];
    const c = gP().theme || 'teal';
    const n = o[(o.indexOf(c) + 1) % o.length];
    setTheme(n);
    toast('الثيم: ' + n);
  });

  $('gSearch').addEventListener('keydown', e => {
    if(e.key === 'Enter') gSearch(e.target.value);
  });
  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key === 'k'){
      e.preventDefault();
      $('gSearch').focus();
    }
  });

  $('btnStart').addEventListener('click', manualStart);
  $('btnStop').addEventListener('click', manualStop);
  $('editWork').addEventListener('click', openEditWork);
  $('addMoney').addEventListener('click', openAddMoney);
  $('editBudget').addEventListener('click', openEditBudget);

  $$('.flt[data-mf]').forEach(b => b.addEventListener('click', () => {
    S.mFilter = b.dataset.mf;
    $$('.flt[data-mf]').forEach(x => x.classList.toggle('on', x === b));
    renderMoney();
  }));

  $('addTask').addEventListener('click', openAddTask);
  $('prevDay').addEventListener('click', () => { S.pDate.setDate(S.pDate.getDate() - 1); renderPlanner(); });
  $('nextDay').addEventListener('click', () => { S.pDate.setDate(S.pDate.getDate() + 1); renderPlanner(); });
  $('todayBtn').addEventListener('click', () => { S.pDate = new Date(); renderPlanner(); });
  $('focusToggle').addEventListener('click', toggleFocus);
  $('focusReset').addEventListener('click', resetFocus);

  $('newNote').addEventListener('click', () => openNote());
  $('noteSearch').addEventListener('input', e => { S.nSearch = e.target.value.trim().toLowerCase(); renderNotes(); });
  $$('.flt[data-nf]').forEach(b => b.addEventListener('click', () => {
    S.nFilter = b.dataset.nf;
    $$('.flt[data-nf]').forEach(x => x.classList.toggle('on', x === b));
    renderNotes();
  }));

  $('addWorkout').addEventListener('click', openWorkout);
  $$('.flt[data-ef]').forEach(b => b.addEventListener('click', () => {
    S.exFilter = b.dataset.ef;
    $$('.flt[data-ef]').forEach(x => x.classList.toggle('on', x === b));
    renderExercise();
  }));

  $('addMeal').addEventListener('click', openMeal);
  $('addWater').addEventListener('click', addWater);
  $('resetWater').addEventListener('click', resetWater);

  $('editHealth').addEventListener('click', openHealth);
  $('changePlan').addEventListener('click', changePlan);

  $$('.ck').forEach(b => b.addEventListener('click', () => calcKey(b.dataset.c)));
  $('toolHour').addEventListener('click', toolHour);
  $('toolDaily').addEventListener('click', toolDaily);
  $('toolBMI').addEventListener('click', toolBMI);
  $('toolCal').addEventListener('click', toolCal);

  $('settingsForm').addEventListener('submit', saveSettings);
  $('delAcc').addEventListener('click', delAccount);
  $$('.theme-tile').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));

  $$('.flt[data-df]').forEach(b => b.addEventListener('click', () => {
    S.dFilter = b.dataset.df;
    $$('.flt[data-df]').forEach(x => x.classList.toggle('on', x === b));
    renderDev();
  }));
}

function boot(){
  setTheme(gP().theme || 'teal');
  bind();

  const s = gS();
  if(s?.email){
    const u = lU().find(x => emailOf(x.email) === emailOf(s.email));
    if(u){
      if(DEV_EMAILS.includes(emailOf(u.email))){ showApp(u); return; }
      if(u.status === 'approved'){ showApp(u); return; }
    }
    cS();
  }
  showLogin();
}

window.YS = {
  go, closeDlg,
  saveMoney, removeMoney, saveBudget, saveWork, saveTask,
  saveNote, editNote, pinNote, removeNote,
  saveWorkout, removeWorkout,
  saveMeal, removeMeal, setWater, toggleHabit, saveHealth,
  approve, reject, delUser, confirmDel
};

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
