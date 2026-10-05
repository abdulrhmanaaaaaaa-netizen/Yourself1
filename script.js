(() => {
  'use strict';

  const KEY = 'yourself_pro_v4_users';
  const SESSION = 'yourself_pro_v4_session';
  const PREF = 'yourself_pro_v4_pref';

  const DEVELOPERS = [
    { email: 'Hoang@gmail.com', password: 'Hoang123', role: 'developer' },
    { email: 'Haider@gmail.com', password: 'asdfghjkl123', role: 'developer' }
  ];

  const $ = id => document.getElementById(id);
  const $$ = s => [...document.querySelectorAll(s)];

  const app = {
    user: null,
    page: 'home',
    moneyFilter: 'all',
    noteFilter: 'all',
    noteSearch: '',
    plannerDate: new Date(),
    focus: { running: false, seconds: 1500, interval: null },
    secretClicks: 0,
    secretTimer: null
  };

  const DEFAULTS = {
    profile: {
      job: '', salaryType: 'monthly', salary: 0, workDays: 5,
      workStart: '08:30', workEnd: '17:00', offDays: 'الجمعة، السبت',
      wake: '07:00', sleep: '23:00', goWork: '08:00', backWork: '17:30',
      goal: 'تنظيم الوقت', activity: 'moderate', age: '', weight: '', height: ''
    },
    finance: [], notes: [], planner: [], workLogs: [],
    habits: [
      { id:'water', title:'الماء', meta:'الترطيب خلال اليوم', done:false },
      { id:'move', title:'حركة بسيطة', meta:'مشي أو تمدد أو نشاط مناسب', done:false },
      { id:'meal', title:'وجبة متوازنة', meta:'اختيار وجبة متنوعة ومناسبة', done:false },
      { id:'sleep', title:'نوم منتظم', meta:'الاقتراب من موعد نومك المعتاد', done:false }
    ],
    healthPlan: 'balanced'
  };

  const clone = x => JSON.parse(JSON.stringify(x));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const emailOf = x => String(x || '').trim().toLowerCase();
  const esc = x => String(x ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = n => `${Math.round(Number(n) || 0).toLocaleString('en-US')} EGP`;
  const num = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dateText = d => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(d);
  const shortDate = d => new Intl.DateTimeFormat('ar-EG',{day:'2-digit',month:'2-digit'}).format(d);
  const timeMinutes = t => { const [h,m] = String(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); };
  const hoursBetween = (a,b) => { let x=timeMinutes(a), y=timeMinutes(b); if(y<x)y+=1440; return (y-x)/60; };

  function users(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];} }
  function saveUsers(v){ localStorage.setItem(KEY,JSON.stringify(v)); }
  function pref(){ try{return JSON.parse(localStorage.getItem(PREF)||'{}');}catch{return {};} }
  function setSession(email){ localStorage.setItem(SESSION,JSON.stringify({email,at:Date.now()})); }
  function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION)||'null');}catch{return null;} }
  function clearSession(){ localStorage.removeItem(SESSION); }

  function normalizeUser(user){
    const base = clone(DEFAULTS);
    return {
      ...base, ...user,
      profile: {...base.profile,...(user.profile||{})},
      finance: Array.isArray(user.finance)?user.finance:[],
      notes: Array.isArray(user.notes)?user.notes:[],
      planner: Array.isArray(user.planner)?user.planner:[],
      workLogs: Array.isArray(user.workLogs)?user.workLogs:[],
      habits: Array.isArray(user.habits)?user.habits:base.habits,
      healthPlan: user.healthPlan || 'balanced'
    };
  }

  function persistUser(patch){
    if(!app.user) return;
    const next = normalizeUser({...app.user,...patch});
    const list = users();
    const i = list.findIndex(u => u.id === app.user.id);
    if(i < 0) return;
    list[i] = next;
    saveUsers(list);
    app.user = next;
  }

  function loadUser(u){ app.user = normalizeUser(u); }

  function offIndexes(profile){
    const map = {
      'الأحد':0,'الاحد':0,'sunday':0,'sun':0,
      'الاثنين':1,'الإثنين':1,'monday':1,'mon':1,
      'الثلاثاء':2,'tuesday':2,'tue':2,
      'الأربعاء':3,'الاربعاء':3,'wednesday':3,'wed':3,
      'الخميس':4,'thursday':4,'thu':4,
      'الجمعة':5,'friday':5,'fri':5,
      'السبت':6,'saturday':6,'sat':6
    };
    const raw = String(profile.offDays||'').toLowerCase();
    return [...new Set(raw.split(/[،,;؛+\/|]+/).map(s=>s.trim()).filter(s=>map[s] !== undefined).map(s=>map[s]))];
  }

  function isWorkday(date = new Date()){
    if(!app.user) return false;
    const p = app.user.profile;
    const off = offIndexes(p);
    if(off.length) return !off.includes(date.getDay());
    const days = Number(p.workDays)||5;
    if(days >= 7) return true;
    return date.getDay() >= 1 && date.getDay() <= Math.min(days,6);
  }

  function workWindow(date = new Date()){
    const p = app.user.profile;
    const start = new Date(date); start.setHours(Math.floor(timeMinutes(p.workStart)/60),timeMinutes(p.workStart)%60,0,0);
    const end = new Date(date); end.setHours(Math.floor(timeMinutes(p.workEnd)/60),timeMinutes(p.workEnd)%60,0,0);
    if(end <= start) end.setDate(end.getDate()+1);
    return {start,end};
  }

  function hourlyRate(){
    if(!app.user) return 0;
    const p=app.user.profile;
    const salary=Number(p.salary)||0;
    if(p.salaryType==='hourly') return salary;
    const hours=hoursBetween(p.workStart,p.workEnd);
    const days=Number(p.workDays)||5;
    return hours>0 ? salary/(days*4.345*hours) : 0;
  }

  function automaticSnapshot(now = new Date()){
    if(!app.user) return {state:'—',meta:'—',elapsedMs:0,mode:'auto'};
    if(!isWorkday(now)) return {state:'إجازة اليوم',meta:'لا يوجد احتساب تلقائي',elapsedMs:0,mode:'off'};
    const {start,end}=workWindow(now);
    if(now < start) return {state:'قبل بداية العمل',meta:`يبدأ تلقائيًا ${app.user.profile.workStart}`,elapsedMs:0,mode:'auto'};
    if(now >= end) return {state:'انتهى وقت العمل',meta:`انتهى تلقائيًا ${app.user.profile.workEnd}`,elapsedMs:end-start,mode:'auto'};
    return {state:'يعمل تلقائيًا',meta:`يتوقف تلقائيًا ${app.user.profile.workEnd}`,elapsedMs:now-start,mode:'auto'};
  }

  function todaySnapshot(){
    const key=dayKey();
    const control=app.user?.workControl || null;
    if(control && control.date===key && control.startedAt){
      const start=new Date(control.startedAt);
      const scheduledEnd=workWindow(new Date()).end;
      const stop=control.stoppedAt ? new Date(control.stoppedAt) : new Date();
      const end = stop < scheduledEnd ? stop : scheduledEnd;
      return {state:control.stoppedAt?'انتهت الجلسة':(new Date()>=scheduledEnd?'انتهى وقت العمل':'عمل يدوي الآن'),meta:control.stoppedAt?'تم حفظ الجلسة اليدوية':'الجلسة محفوظة حتى إغلاق المتصفح',elapsedMs:Math.max(0,end-start),mode:'manual'};
    }
    return automaticSnapshot(new Date());
  }

  function workMonthlyProgress(){
    if(!app.user) return 0;
    const now=new Date();
    const first=new Date(now.getFullYear(),now.getMonth(),1);
    const last=new Date(now.getFullYear(),now.getMonth()+1,0);
    let scheduled=0,elapsed=0;
    for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1)){
      const date=new Date(d);
      if(!isWorkday(date)) continue;
      const {start,end}=workWindow(date);
      scheduled += end-start;
      if(dayKey(date) < dayKey(now)) elapsed += end-start;
      else if(dayKey(date)===dayKey(now)) elapsed += Math.max(0,Math.min(now,end)-start);
    }
    return scheduled ? Math.min(100,Math.round(elapsed/scheduled*100)) : 0;
  }

  function showMsg(id,text,type='error'){ const el=$(id); if(!el)return; el.textContent=text; el.className=`message ${type}`; }
  function toast(text){ const el=document.createElement('div'); el.className='toast'; el.textContent=text; $('toast').appendChild(el); setTimeout(()=>el.remove(),3200); }

  function boot(){
    theme(pref().theme||'mint');
    bindAuth(); bindApp(); bindSecret();
    const s=getSession();
    if(s?.email){ const u=users().find(x=>emailOf(x.email)===emailOf(s.email)); if(u) enterApp(u); }
    renderPublicPreview();
  }

  function bindAuth(){
    $$('[data-auth]').forEach(b=>b.addEventListener('click',()=>switchAuth(b.dataset.auth)));
    $$('[data-pass]').forEach(b=>b.addEventListener('click',()=>togglePassword(b.dataset.pass,b)));
    $('regPassword').addEventListener('input',passwordStrength);
    $('loginForm').addEventListener('submit',login);
    $('registerForm').addEventListener('submit',register);
    $('loginHelp').addEventListener('click',()=>openDialog('مساعدة الدخول','استخدم الحساب الذي أنشأته على هذا المتصفح. هذه النسخة تحفظ البيانات محليًا.'));
    $('demoBtn').addEventListener('click',()=>openDialog('Yourself','يمكنك تسجيل حساب جديد وإدخال بيانات العمل والوقت والصحة كلها في نموذج واحد.'));
  }

  function switchAuth(mode){
    $$('[data-auth]').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));
    $('loginForm').classList.toggle('hidden',mode!=='login');
    $('registerForm').classList.toggle('hidden',mode!=='register');
  }

  function togglePassword(id,btn){ const input=$(id); input.type=input.type==='password'?'text':'password'; btn.textContent=input.type==='password'?'إظهار':'إخفاء'; }

  function passwordStrength(){
    const v=$('regPassword').value;
    const tests=[v.length>=8,/[A-Zأ-ي]/.test(v),/\d/.test(v),/[^A-Za-z0-9أ-ي]/.test(v)];
    const score=tests.filter(Boolean).length;
    $$('.strength i').forEach((x,i)=>x.classList.toggle('on',i<score));
    const s=$('.strength small'); if(s)s.textContent=score<2?'قوة كلمة المرور · ضعيفة':score===2?'قوة كلمة المرور · متوسطة':score===3?'قوة كلمة المرور · جيدة':'قوة كلمة المرور · قوية';
  }

  function login(e){
    e.preventDefault();
    const email=emailOf($('loginEmail').value),pass=$('loginPassword').value;
    if(!email||!pass) return showMsg('loginMessage','أدخل البريد الإلكتروني وكلمة المرور.');
    if(DEVELOPERS.some(d=>emailOf(d.email)===email && d.password===pass)){ openDeveloper(); return; }
    const u=users().find(x=>emailOf(x.email)===email && x.password===pass);
    if(!u) return showMsg('loginMessage','البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    setSession(u.email); showMsg('loginMessage','تم الدخول بنجاح.','success'); enterApp(u);
  }

  function register(e){
    e.preventDefault();
    const data={
      name:$('regName').value.trim(),email:emailOf($('regEmail').value),password:$('regPassword').value,
      profile:{job:$('regJob').value.trim(),salaryType:$('regSalaryType').value,salary:Number($('regSalary').value)||0,workDays:Number($('regWorkDays').value)||5,workStart:$('regStart').value||'08:30',workEnd:$('regEnd').value||'17:00',offDays:$('regOff').value.trim()||'الجمعة، السبت',wake:$('regWake').value||'07:00',sleep:$('regSleep').value||'23:00',goWork:$('regGo').value||'08:00',backWork:$('regBack').value||'17:30',goal:$('regGoal').value,activity:$('regActivity').value,age:$('regAge').value,weight:$('regWeight').value,height:$('regHeight').value}
    };
    if(!data.name) return showMsg('registerMessage','اكتب الاسم الكامل.');
    if(!data.email) return showMsg('registerMessage','اكتب بريدًا إلكترونيًا صحيحًا.');
    if(data.password.length<8) return showMsg('registerMessage','كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    if(data.password!==$('regPassword2').value) return showMsg('registerMessage','تأكيد كلمة المرور غير مطابق.');
    if(!data.profile.job) return showMsg('registerMessage','اكتب الوظيفة أو المجال.');
    if(data.profile.salary<=0) return showMsg('registerMessage','أدخل الدخل حتى يتم حساب قيمة الساعة.');
    if(users().some(x=>emailOf(x.email)===data.email) || DEVELOPERS.some(x=>emailOf(x.email)===data.email)) return showMsg('registerMessage','هذا البريد مستخدم بالفعل.');
    const u=normalizeUser({id:uid(),...data,finance:[],notes:[],planner:starterPlanner(data.profile),workLogs:[],habits:clone(DEFAULTS.habits),healthPlan:'balanced',createdAt:new Date().toISOString()});
    saveUsers([...users(),u]); setSession(u.email); enterApp(u); toast('تم إنشاء الحساب وتجهيز Yourself بالكامل ✦');
  }

  function starterPlanner(p){
    const k=dayKey();
    return [
      {id:uid(),date:k,time:p.goWork,title:'الذهاب للعمل',category:'روتين',done:false},
      {id:uid(),date:k,time:p.workStart,title:'بداية العمل',category:'عمل',done:false},
      {id:uid(),date:k,time:'13:00',title:'فاصل + غداء',category:'استراحة',done:false},
      {id:uid(),date:k,time:p.workEnd,title:'إغلاق يوم العمل',category:'عمل',done:false},
      {id:uid(),date:k,time:p.backWork,title:'العودة ووقت شخصي',category:'شخصي',done:false}
    ];
  }

  function enterApp(u){
    loadUser(u); $('authView').classList.add('hidden'); $('appView').classList.remove('hidden'); renderAll(); syncWork();
  }

  function bindApp(){
    $$('.nav,[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
    $('logout').addEventListener('click',()=>{clearSession();location.reload();});
    $('profileBtn').addEventListener('click',()=>go('settings'));
    $('searchBtn').addEventListener('click',()=>openSearch());
    $('manualStart').addEventListener('click',manualStart);
    $('manualStop').addEventListener('click',manualStop);
    $('editWork').addEventListener('click',()=>openWorkDialog());
    $('addMoney').addEventListener('click',()=>openMoneyDialog());
    $$('.filter[data-money]').forEach(b=>b.addEventListener('click',()=>{app.moneyFilter=b.dataset.money; $$('.filter[data-money]').forEach(x=>x.classList.toggle('active',x===b)); renderMoney();}));
    $('addTask').addEventListener('click',()=>openTaskDialog());
    $('prevDay').addEventListener('click',()=>{app.plannerDate.setDate(app.plannerDate.getDate()-1);renderPlanner();});
    $('nextDay').addEventListener('click',()=>{app.plannerDate.setDate(app.plannerDate.getDate()+1);renderPlanner();});
    $('todayBtn').addEventListener('click',()=>{app.plannerDate=new Date();renderPlanner();});
    $('newNote').addEventListener('click',()=>openNoteDialog());
    $('noteSearch').addEventListener('input',e=>{app.noteSearch=e.target.value.trim().toLowerCase();renderNotes();});
    $$('.filter[data-note]').forEach(b=>b.addEventListener('click',()=>{app.noteFilter=b.dataset.note; $$('.filter[data-note]').forEach(x=>x.classList.toggle('active',x===b)); renderNotes();}));
    $('editHealth').addEventListener('click',()=>openHealthDialog());
    $('changePlan').addEventListener('click',changePlan);
    $('focusToggle').addEventListener('click',toggleFocus); $('focusReset').addEventListener('click',resetFocus);
    $('settingsForm').addEventListener('submit',saveSettings); $('deleteLocal').addEventListener('click',()=>openDialog('حذف الحساب','سيتم حذف بيانات حسابك من هذا المتصفح فقط.',`<div class="dialog-actions"><button class="danger-btn" onclick="Yourself.deleteAccount()">حذف نهائي</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`));
    $$('.theme').forEach(b=>b.addEventListener('click',()=>theme(b.dataset.theme)));
  }

  function go(page){
    if(!app.user)return;
    app.page=page; $$('.page').forEach(p=>p.classList.toggle('active-page',p.id===`page-${page}`)); $$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    if(page==='home')renderHome(); if(page==='work')renderWork(); if(page==='planner')renderPlanner(); if(page==='notes')renderNotes(); if(page==='health')renderHealth(); if(page==='settings')renderSettings();
  }

  function renderAll(){renderTop();renderHome();renderWork();renderPlanner();renderNotes();renderHealth();renderSettings();go('home');}
  function renderTop(){const name=app.user.name||'Yourself'; $('topName').textContent=name; $('topJob').textContent=app.user.profile.job||'مساحتك الشخصية'; $('heroName').textContent=name.split(' ')[0]; $('avatar').textContent=name.trim().slice(0,1).toUpperCase()||'Y'; const h=new Date().getHours(); $('greeting').textContent=h<12?'صباح الخير':h<18?'مساء الخير':'مساء هادئ';}

  function renderHome(){
    const p=app.user.profile,s=todaySnapshot(),rate=hourlyRate(),h=s.elapsedMs/3600000,items=app.user.finance||[];
    const deductions=items.filter(x=>x.kind==='deduction').reduce((a,x)=>a+Number(x.amount||0),0),extra=items.filter(x=>x.kind==='extra').reduce((a,x)=>a+Number(x.amount||0),0);
    $('weekday').textContent=new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(new Date()); $('dateText').textContent=dateText(new Date()); $('todayText').textContent=`${p.workStart} → ${p.workEnd} · ${s.state} · هدفك: ${p.goal}`;
    $('hourRate').textContent=num(rate); $('todayEarned').textContent=num(h*rate); $('todayHours').textContent=`${h.toFixed(2)}h`; $('todayHoursMeta').textContent=s.state; $('todayTasks').textContent=app.user.planner.filter(x=>x.date===dayKey()).length;
    $('clockBadge').textContent=s.state; $('clockState').textContent=s.state; $('clockMeta').textContent=s.meta; $('timer').textContent=formatDuration(s.elapsedMs); $('clockEarn').textContent=money(h*rate); updateManualButtons(s);
    $('sideState').textContent=s.mode==='off'?'إجازة اليوم':s.state; $('sideMeta').textContent=s.mode==='off'?'لا يوجد احتساب':'محسوب من جدولك';
    $('baseMoney').textContent=num(Number(p.salary)||0); $('deductMoney').textContent=num(deductions); $('extraMoney').textContent=num(extra); $('netMoney').textContent=money(Math.max(0,Number(p.salary||0)+extra-deductions));
    renderNext(); renderPreviewNotes();
  }

  function formatDuration(ms){let t=Math.max(0,Math.floor(ms/1000)),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');}
  function updateManualButtons(s){const active=app.user.workControl?.date===dayKey() && app.user.workControl?.startedAt && !app.user.workControl?.stoppedAt; $('manualStart').disabled=!!active || s.mode==='off' || s.state==='انتهى وقت العمل'; $('manualStop').disabled=!active; $('manualStart').textContent=active?'العمل اليدوي جارٍ':'بدء يدوي';}

  function syncWork(){
    if(!app.user)return;
    const c=app.user.workControl;
    if(c?.date && c.date!==dayKey() && c.startedAt){
      const logs=[...app.user.workLogs]; if(!logs.some(x=>x.startedAt===c.startedAt))logs.push({id:uid(),date:c.date,startedAt:c.startedAt,stoppedAt:c.stoppedAt||new Date(c.date+'T23:59:59').toISOString(),mode:'manual'});
      persistUser({workLogs:logs,workControl:null});
    }
    renderHome();
  }

  function manualStart(){const key=dayKey(); if(!isWorkday(new Date()))return toast('اليوم إجازة حسب جدولك.'); const {end}=workWindow(new Date()); if(new Date()>=end)return toast('انتهى وقت العمل اليوم.'); persistUser({workControl:{date:key,startedAt:new Date().toISOString(),stoppedAt:null}}); renderHome(); toast('بدأت الجلسة اليدوية.');}
  function manualStop(){if(!app.user.workControl?.startedAt)return; persistUser({workControl:{...app.user.workControl,stoppedAt:new Date().toISOString()}}); renderHome(); toast('تم حفظ الجلسة اليدوية.');}

  function renderNext(){const key=dayKey();const items=app.user.planner.filter(x=>x.date===key).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,5);$('nextList').innerHTML=items.length?items.map(x=>`<div class="timeline-item"><time>${esc(x.time)}</time><i></i><div><strong>${esc(x.title)}</strong><span>${esc(x.category||'مهمة')}</span></div></div>`).join(''):`<div class="info-note"><b>اليوم مفتوح</b><span>أضف أول مهمة من تنظيم الوقت.</span></div>`;}
  function renderPreviewNotes(){const items=app.user.notes.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3);$('notePreview').innerHTML=items.length?items.map(n=>`<div class="preview-note"><b>${esc(n.title)}</b><span>${esc(n.content.slice(0,120))}</span></div>`).join(''):`<div class="info-note"><b>المذكرة جاهزة</b><span>اكتب أول ملاحظة أو فكرة من قسم المذكرة.</span></div>`;}

  function renderWork(){const p=app.user.profile,rate=hourlyRate(),prog=workMonthlyProgress(),snap=todaySnapshot();$('bigRate').textContent=num(rate);$('workSalary').textContent=money(p.salary);$('workHoursDay').textContent=hoursBetween(p.workStart,p.workEnd).toFixed(1);$('workDays').textContent=p.workDays;$('workSchedule').textContent=`${p.workStart} → ${p.workEnd}`;$('monthPct').textContent=`${prog}%`;$('monthBar').style.width=`${prog}%`;renderMoney();}
  function renderMoney(){const list=app.user.finance.filter(x=>app.moneyFilter==='all'||x.kind===app.moneyFilter).slice().reverse();$('moneyList').innerHTML=list.slice(0,6).map(x=>`<div class="money-row"><div><b>${esc(x.title)}</b><small>${shortDate(new Date(x.createdAt))}</small></div><span class="kind ${x.kind}">${x.kind==='deduction'?'خصم':'إضافي'}</span><button onclick="Yourself.removeMoney('${x.id}')">×</button><b>${x.kind==='deduction'?'-':'+'}${num(x.amount)}</b></div>`).join('')||`<div class="info-note"><b>لا توجد عمليات</b><span>أضف خصمًا أو مبلغًا إضافيًا.</span></div>`;$('moneyTable').innerHTML=list.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td><span class="kind ${x.kind}">${x.kind==='deduction'?'خصم':'إضافي'}</span></td><td>${x.kind==='deduction'?'-':'+'}${num(x.amount)} EGP</td><td>${shortDate(new Date(x.createdAt))}</td><td><button class="table-action" onclick="Yourself.removeMoney('${x.id}')">حذف</button></td></tr>`).join('')||`<tr><td colspan="5">لا توجد بيانات</td></tr>`;}
  function removeMoney(id){persistUser({finance:app.user.finance.filter(x=>x.id!==id)});renderWork();renderHome();toast('تم حذف العملية.');}

  function renderPlanner(){const d=app.plannerDate,key=dayKey(d),p=app.user.profile,items=app.user.planner.filter(x=>x.date===key);$('planDay').textContent=new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(d);$('planDate').textContent=dateText(d);let html='';for(let h=6;h<=23;h++){const hh=String(h).padStart(2,'0');const found=items.filter(x=>String(x.time).startsWith(`${hh}:`));html+=`<div class="hour"><div class="hour-time">${hh}:00</div><div class="slot ${found.length?'':'slot-empty'}">${found.map(x=>`<div class="task-chip"><span>${esc(x.title)}</span><b>${esc(x.time)}</b></div>`).join('')}</div></div>`;}$('schedule').innerHTML=html;$('routine').innerHTML=[['الاستيقاظ',p.wake],['الذهاب',p.goWork],['العمل',`${p.workStart} → ${p.workEnd}`],['الرجوع',p.backWork],['النوم',p.sleep]].map(x=>`<div class="routine-row"><span>${x[0]}</span><b>${esc(x[1]||'—')}</b></div>`).join('');renderFocus();}

  function renderNotes(){let list=app.user.notes;if(app.noteFilter==='pinned')list=list.filter(x=>x.pinned);else if(app.noteFilter!=='all')list=list.filter(x=>x.category===app.noteFilter);if(app.noteSearch)list=list.filter(x=>`${x.title} ${x.content}`.toLowerCase().includes(app.noteSearch));list=list.slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.updatedAt)-new Date(a.updatedAt));$('notesGrid').innerHTML=list.map(n=>`<article class="note-card ${n.pinned?'pinned':''}"><div class="note-top"><span class="note-type">${esc(n.category)}</span><button class="pin" onclick="Yourself.pinNote('${n.id}')">${n.pinned?'★':'☆'}</button></div><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="note-foot"><small>${shortDate(new Date(n.updatedAt))}</small><div><button onclick="Yourself.editNote('${n.id}')">✎</button><button onclick="Yourself.removeNote('${n.id}')">×</button></div></div></article>`).join('')||`<div class="panel"><b>المذكرة جاهزة لك.</b><p>أنشئ أول ملاحظة.</p></div>`;}

  function renderHealth(){const p=app.user.profile;$('healthAge').textContent=p.age||'—';$('healthWeight').textContent=p.weight||'—';$('healthHeight').textContent=p.height||'—';const done=app.user.habits.filter(x=>x.done).length,pct=app.user.habits.length?Math.round(done/app.user.habits.length*100):0;$('habitPct').textContent=`${pct}%`;$('habits').innerHTML=app.user.habits.map(h=>`<div class="habit ${h.done?'done':''}"><button onclick="Yourself.toggleHabit('${h.id}')">${h.done?'✓':'○'}</button><div><b>${esc(h.title)}</b><span>${esc(h.meta)}</span></div><small>${h.done?'تم':'اليوم'}</small></div>`).join('');const plans={balanced:[['الصباح','ماء + بداية هادئة + ترتيب الأولويات'],['العمل','فواصل قصيرة للحركة وتغيير الوضعية'],['بعد العمل','وجبة متنوعة + نشاط خفيف مناسب'],['المساء','تهدئة اليوم ونوم منتظم']],training:[['الأسبوع','3 جلسات نشاط مناسبة لمستواك'],['يوميًا','مشي أو حركة خفيفة حسب طاقتك'],['الاستشفاء','إحماء وتهدئة وراحة كافية'],['المساء','روتين نوم مستقر']],focus:[['البداية','حدد مهمة رئيسية واحدة'],['التركيز','25 دقيقة تركيز + 5 دقائق فاصل'],['منتصف اليوم','فاصل وابتعاد قصير عن الشاشة'],['الإغلاق','اكتب ما تم وما ينتقل للغد']]};$('healthPlan').innerHTML=plans[app.user.healthPlan||'balanced'].map(x=>`<div class="plan-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');}
  function toggleHabit(id){persistUser({habits:app.user.habits.map(x=>x.id===id?{...x,done:!x.done}:x)});renderHealth();}
  function changePlan(){const order=['balanced','training','focus'],next=order[(order.indexOf(app.user.healthPlan)+1)%order.length];persistUser({healthPlan:next});renderHealth();toast('تم تغيير الخطة.');}

  function renderSettings(){const p=app.user.profile;$('setName').value=app.user.name;$('setEmail').value=app.user.email;$('setJob').value=p.job||'';$('setGoal').value=p.goal||'تنظيم الوقت';$('setStart').value=p.workStart||'';$('setEnd').value=p.workEnd||'';}
  function saveSettings(e){e.preventDefault();persistUser({name:$('setName').value.trim()||app.user.name,profile:{...app.user.profile,job:$('setJob').value.trim(),goal:$('setGoal').value,workStart:$('setStart').value,workEnd:$('setEnd').value}});renderAll();toast('تم حفظ التغييرات.');}

  function openMoneyDialog(){openDialog('حركة مالية','أضف خصمًا أو مبلغًا إضافيًا.',`<div class="modal-grid"><label>النوع<select id="mType"><option value="deduction">خصم</option><option value="extra">إضافي</option></select></label><label>المبلغ<input id="mAmount" type="number" min="0" step="0.01" placeholder="250"></label></div><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">الوصف<input id="mTitle" type="text" placeholder="مثال: مواصلات"></label><div class="dialog-actions"><button class="main-btn" onclick="Yourself.saveMoney()">حفظ</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}
  function saveMoney(){const amount=Number($('mAmount').value)||0;if(amount<=0)return toast('أدخل مبلغًا صحيحًا.');const item={id:uid(),kind:$('mType').value,amount,title:$('mTitle').value.trim()||'حركة مالية',createdAt:new Date().toISOString()};persistUser({finance:[...app.user.finance,item]});closeDialog();renderWork();renderHome();toast('تم حفظ الحركة المالية.');}

  function openTaskDialog(){openDialog('مهمة جديدة','أضف مهمة إلى اليوم الذي تريده.',`<div class="modal-grid"><label>التاريخ<input id="tDate" type="date" value="${dayKey(app.plannerDate)}"></label><label>الوقت<input id="tTime" type="time" value="09:00"></label></div><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">العنوان<input id="tTitle" type="text" placeholder="مثال: إنهاء المهمة الرئيسية"></label><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">التصنيف<select id="tCategory"><option>عمل</option><option>تعلم</option><option>استراحة</option><option>صحة</option><option>شخصي</option><option>روتين</option></select></label><div class="dialog-actions"><button class="main-btn" onclick="Yourself.saveTask()">إضافة</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}
  function saveTask(){const title=$('tTitle').value.trim();if(!title)return toast('اكتب عنوان المهمة.');persistUser({planner:[...app.user.planner,{id:uid(),date:$('tDate').value,time:$('tTime').value,title,category:$('tCategory').value,done:false}]});closeDialog();renderPlanner();renderHome();toast('تمت إضافة المهمة.');}

  function openNoteDialog(note=null){const n=note||{title:'',content:'',category:'idea'};openDialog(note?'تعديل الملاحظة':'ملاحظة جديدة','اكتب ملاحظتك واحفظها في مساحتك.',`<label>العنوان<input id="nTitle" type="text" value="${esc(n.title)}" placeholder="عنوان الملاحظة"></label><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">التصنيف<select id="nCategory"><option value="idea" ${n.category==='idea'?'selected':''}>فكرة</option><option value="work" ${n.category==='work'?'selected':''}>عمل</option><option value="finance" ${n.category==='finance'?'selected':''}>مال</option><option value="health" ${n.category==='health'?'selected':''}>صحة</option><option value="personal" ${n.category==='personal'?'selected':''}>شخصية</option></select></label><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">المحتوى<textarea id="nContent" placeholder="اكتب هنا...">${esc(n.content)}</textarea></label><div class="dialog-actions"><button class="main-btn" onclick="Yourself.saveNote('${n.id||''}')">حفظ</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}
  function saveNote(id){const content=$('nContent').value.trim();if(!content)return toast('اكتب محتوى الملاحظة.');const old=app.user.notes.find(x=>x.id===id);const n={id:id||uid(),title:$('nTitle').value.trim()||'ملاحظة بدون عنوان',content,category:$('nCategory').value,pinned:old?.pinned||false,updatedAt:new Date().toISOString()};persistUser({notes:[...app.user.notes.filter(x=>x.id!==n.id),n]});closeDialog();renderNotes();renderHome();toast('تم حفظ الملاحظة.');}
  function editNote(id){const n=app.user.notes.find(x=>x.id===id);if(n)openNoteDialog(n)}
  function pinNote(id){persistUser({notes:app.user.notes.map(x=>x.id===id?{...x,pinned:!x.pinned}:x)});renderNotes();}
  function removeNote(id){persistUser({notes:app.user.notes.filter(x=>x.id!==id)});renderNotes();renderHome();toast('تم حذف الملاحظة.');}

  function openWorkDialog(){const p=app.user.profile;openDialog('تعديل بيانات العمل','حدّث الدخل والدوام وسيعاد حساب قيمة الساعة.',`<div class="modal-grid"><label>الدخل<input id="wSalary" type="number" value="${p.salary}"></label><label>نوع الدخل<select id="wType"><option value="monthly" ${p.salaryType==='monthly'?'selected':''}>شهري</option><option value="hourly" ${p.salaryType==='hourly'?'selected':''}>بالساعة</option></select></label><label>أيام العمل<input id="wDays" type="number" min="1" max="7" value="${p.workDays}"></label><label>أيام الإجازة<input id="wOff" type="text" value="${esc(p.offDays)}"></label><label>البداية<input id="wStart" type="time" value="${p.workStart}"></label><label>النهاية<input id="wEnd" type="time" value="${p.workEnd}"></label></div><div class="dialog-actions"><button class="main-btn" onclick="Yourself.saveWork()">حفظ</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}
  function saveWork(){persistUser({profile:{...app.user.profile,salary:Number($('wSalary').value)||0,salaryType:$('wType').value,workDays:Number($('wDays').value)||5,offDays:$('wOff').value.trim(),workStart:$('wStart').value,workEnd:$('wEnd').value}});closeDialog();renderAll();toast('تم تحديث بيانات العمل.');}

  function openHealthDialog(){const p=app.user.profile;openDialog('تعديل البيانات الصحية','هذه البيانات للمتابعة العامة الشخصية.',`<div class="modal-grid"><label>العمر<input id="hAge" type="number" value="${p.age||''}"></label><label>الوزن<input id="hWeight" type="number" value="${p.weight||''}"></label><label>الطول<input id="hHeight" type="number" value="${p.height||''}"></label><label>النشاط<select id="hActivity"><option value="light" ${p.activity==='light'?'selected':''}>خفيف</option><option value="moderate" ${p.activity==='moderate'?'selected':''}>متوسط</option><option value="high" ${p.activity==='high'?'selected':''}>مرتفع</option></select></label></div><div class="dialog-actions"><button class="main-btn" onclick="Yourself.saveHealth()">حفظ</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}
  function saveHealth(){persistUser({profile:{...app.user.profile,age:$('hAge').value,weight:$('hWeight').value,height:$('hHeight').value,activity:$('hActivity').value}});closeDialog();renderHealth();toast('تم تحديث البيانات.');}

  function openSearch(){openDialog('بحث سريع','انتقل مباشرة إلى القسم الذي تحتاجه.',`<div class="modal-grid"><button class="ghost-btn" onclick="Yourself.go('home');Yourself.closeDialog()">الرئيسية</button><button class="ghost-btn" onclick="Yourself.go('work');Yourself.closeDialog()">العمل والدخل</button><button class="ghost-btn" onclick="Yourself.go('planner');Yourself.closeDialog()">تنظيم الوقت</button><button class="ghost-btn" onclick="Yourself.go('notes');Yourself.closeDialog()">المذكرة</button><button class="ghost-btn" onclick="Yourself.go('health');Yourself.closeDialog()">الصحة</button><button class="ghost-btn" onclick="Yourself.go('settings');Yourself.closeDialog()">الإعدادات</button></div>`);}

  function bindSecret(){ $('brandSecret').addEventListener('click',()=>{app.secretClicks++;clearTimeout(app.secretTimer);app.secretTimer=setTimeout(()=>app.secretClicks=0,1600);if(app.secretClicks>=5){app.secretClicks=0;openDialog('مركز المطوّر','هذا الدخول مخفي عن المستخدمين العاديين.',`<label>البريد الإلكتروني<input id="devEmail" type="email"></label><label style="display:flex;flex-direction:column;gap:6px;margin-top:10px">كلمة المرور<input id="devPassword" type="password"></label><div class="dialog-actions"><button class="main-btn" onclick="Yourself.openDeveloperFromDialog()">الدخول</button><button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button></div>`);}}); }
  function openDeveloper(){openDialog('مركز المطوّر','بيانات المطورين تظل غير ظاهرة للمستخدم العادي.','<div class="info-note"><b>تم التعرف على صلاحية المطور</b><span>انتقل مباشرة إلى لوحة الإدارة.</span></div><div class="dialog-actions"><button class="main-btn" onclick="Yourself.enterDeveloper()">فتح المركز</button></div>');}
  function developerAuth(){const e=emailOf($('devEmail').value),p=$('devPassword').value;if(!DEVELOPERS.some(x=>emailOf(x.email)===e&&x.password===p))return toast('بيانات المطور غير صحيحة.');enterDeveloper();}
  function enterDeveloper(){closeDialog();const list=users(),ops=list.reduce((a,u)=>a+(u.finance?.length||0),0),notes=list.reduce((a,u)=>a+(u.notes?.length||0),0);openDialog('مركز المطوّر','إدارة الحسابات الموجودة في هذه النسخة المحلية.',`<div class="dev-summary"><div class="dev-stat"><span>الحسابات</span><b>${list.length}</b></div><div class="dev-stat"><span>العمليات</span><b>${ops}</b></div><div class="dev-stat"><span>الملاحظات</span><b>${notes}</b></div><div class="dev-stat"><span>حالة</span><b>ON</b></div></div><div class="dev-users">${list.length?list.map(u=>`<div class="dev-user"><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span><span>${esc(u.profile?.job||'بدون وظيفة')}</span><span>${money(u.profile?.salary||0)}</span><div class="dev-actions"><button onclick="Yourself.inspectUser('${u.id}')">عرض</button><button onclick="Yourself.deleteUser('${u.id}')">حذف</button></div></div>`).join(''):'<div class="info-note">لا توجد حسابات.</div>'}</div>`);}
  function openDeveloperFromDialog(){developerAuth();}
  function inspectUser(id){const u=users().find(x=>x.id===id);if(!u)return;openDialog('بيانات المستخدم','عرض إداري للحساب المحلي.',`<div class="info-note"><b>${esc(u.name)}</b><span>البريد: ${esc(u.email)}<br>الوظيفة: ${esc(u.profile?.job||'—')}<br>الدخل: ${money(u.profile?.salary||0)}<br>العمل: ${esc(u.profile?.workStart||'—')} → ${esc(u.profile?.workEnd||'—')}<br>العمر: ${esc(u.profile?.age||'—')} · الوزن: ${esc(u.profile?.weight||'—')} · الطول: ${esc(u.profile?.height||'—')}</span></div>`);}
  function deleteUser(id){saveUsers(users().filter(x=>x.id!==id));enterDeveloper();toast('تم حذف الحساب.');}

  function deleteAccount(){if(!app.user)return;saveUsers(users().filter(x=>x.id!==app.user.id));clearSession();location.reload();}

  function openDialog(title,desc,body){const m=$('modal');m.classList.remove('hidden');m.innerHTML=`<div class="dialog"><div class="dialog-head"><div><span class="kicker">YOURSELF</span><h3>${esc(title)}</h3><p>${esc(desc)}</p></div><button class="close" type="button" onclick="Yourself.closeDialog()">×</button></div><div class="dialog-body">${body}</div></div>`;}
  function closeDialog(){$('modal').classList.add('hidden');$('modal').innerHTML='';}

  function renderFocus(){const m=Math.floor(app.focus.seconds/60),s=app.focus.seconds%60;$('focusTimer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;$('focusToggle').textContent=app.focus.running?'إيقاف':'بدء';}
  function toggleFocus(){if(app.focus.running){clearInterval(app.focus.interval);app.focus.running=false;}else{app.focus.running=true;app.focus.interval=setInterval(()=>{app.focus.seconds--;if(app.focus.seconds<=0){resetFocus();toast('انتهت جلسة التركيز.');}renderFocus();},1000);}renderFocus();}
  function resetFocus(){clearInterval(app.focus.interval);app.focus.running=false;app.focus.seconds=1500;renderFocus();}

  function theme(name){document.documentElement.classList.remove('theme-night','theme-sand');if(name==='night')document.documentElement.classList.add('theme-night');if(name==='sand')document.documentElement.classList.add('theme-sand');const p=pref();p.theme=name;localStorage.setItem(PREF,JSON.stringify(p));$$('.theme').forEach(x=>x.classList.toggle('active',x.dataset.theme===name));}
  function renderPublicPreview(){const first=users()[0];if(first){app.user=normalizeUser(first);$('publicRate').textContent=money(hourlyRate());$('publicWork').textContent=`${app.user.profile.workStart} → ${app.user.profile.workEnd}`;app.user=null;} }

  window.Yourself={removeMoney,go,saveMoney,closeDialog,saveTask,editNote,saveNote,pinNote,removeNote,saveWork,saveHealth,toggleHabit,deleteAccount,openDeveloperFromDialog,enterDeveloper,inspectUser,deleteUser};
  setInterval(()=>{if(app.user)syncWork();},1000);
  document.addEventListener('DOMContentLoaded',boot);
})();
