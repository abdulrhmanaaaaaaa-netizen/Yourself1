(() => {
  'use strict';

  const USERS_KEY   = 'yourself_v11_users';
  const SESSION_KEY = 'yourself_v11_session';
  const PREF_KEY    = 'yourself_v11_pref';
  const DEV_SESSION = 'yourself_v11_dev';

  const DEVS = [
    { email:'hoang@gmail.com',  pass:'Hoang123' },
    { email:'haider@gmail.com', pass:'asdfghjkl123' }
  ];

  const $  = id => document.getElementById(id);
  const $$ = s  => [...document.querySelectorAll(s)];

  // ─── Helpers ───
  const uid     = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const emailOf = x => String(x||'').trim().toLowerCase();
  const dayKey  = (d=new Date()) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtMoney = n => (Math.round(Number(n)||0)).toLocaleString('en-US') + ' EGP';
  const fmtNum   = n => (Math.round(Number(n)||0)).toLocaleString('en-US');
  const dateAr   = d => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d));
  const shortAr  = d => new Intl.DateTimeFormat('ar-EG',{day:'2-digit',month:'2-digit'}).format(new Date(d));
  const timeAr   = d => new Intl.DateTimeFormat('ar-EG',{hour:'2-digit',minute:'2-digit'}).format(new Date(d));
  const timeMins = t => { const [h,m]=String(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); };
  const hoursBetween = (a,b) => { let x=timeMins(a), y=timeMins(b); if(y<x) y+=1440; return (y-x)/60; };

  // ─── Storage ───
  const loadUsers  = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)||'[]'); } catch { return []; } };
  const saveUsers  = u  => localStorage.setItem(USERS_KEY, JSON.stringify(u));
  const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } };
  const setSession = e  => localStorage.setItem(SESSION_KEY, JSON.stringify({ email:e, at:Date.now() }));
  const clearSession = () => localStorage.removeItem(SESSION_KEY);
  const getPref    = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch { return {}; } };
  const setPref    = p  => localStorage.setItem(PREF_KEY, JSON.stringify(p));
  const getDevSession = () => { try { return JSON.parse(localStorage.getItem(DEV_SESSION)||'null'); } catch { return null; } };
  const setDevSession = e => localStorage.setItem(DEV_SESSION, JSON.stringify({ email:e, at:Date.now() }));
  const clearDevSession = () => localStorage.removeItem(DEV_SESSION);

  // ─── State ───
  const S = {
    user: null,
    page: 'dashboard',
    moneyFilter: 'all',
    noteFilter: 'all',
    noteSearch: '',
    exFilter: 'all',
    plannerDate: new Date(),
    focus: { seconds:1500, running:false, interval:null },
    tick: null,
    secret: { count:0, timer:null },
    wizard: 1,
    tempAccount: null,
    devFilter: 'pending'
  };

  // ─── Defaults ───
  const defaultProfile = () => ({
    job:'', salaryType:'monthly', salary:0, workDays:5,
    workStart:'08:30', workEnd:'17:00', offDays:'الجمعة، السبت',
    wake:'07:00', sleep:'23:00', goWork:'08:00', backWork:'17:30',
    goal:'تنظيم الوقت', activity:'moderate',
    age:'', weight:'', height:'',
    calorieGoal:2000, waterGoal:8
  });
  const defaultHabits = () => {
    const d = dayKey();
    return [
      { id:'water', title:'الماء',        meta:'الترطيب خلال اليوم', done:false, date:d },
      { id:'move',  title:'حركة بسيطة',   meta:'مشي أو تمدد',       done:false, date:d },
      { id:'meal',  title:'وجبة متوازنة', meta:'اختيار متنوع',       done:false, date:d },
      { id:'sleep', title:'نوم منتظم',    meta:'قرب موعد نومك',      done:false, date:d }
    ];
  };
  const newUser = (o={}) => ({
    id: uid(), name:'', email:'', password:'',
    status: 'pending', // pending | approved | rejected
    createdAt: new Date().toISOString(),
    profile: defaultProfile(),
    finance: [], notes: [], planner: [],
    workLogs: [], workControl: null,
    habits: defaultHabits(),
    healthPlan: 'balanced',
    workouts: [], meals: [], waterLog: {},
    ...o
  });
  function normalizeUser(u){
    if(!u) return null;
    const base = newUser();
    const today = dayKey();
    let habits = Array.isArray(u.habits) && u.habits.length ? u.habits : base.habits;
    if(habits[0] && habits[0].date !== today){
      habits = habits.map(h => ({ ...h, done:false, date:today }));
    }
    return {
      ...base, ...u,
      profile: { ...base.profile, ...(u.profile||{}) },
      finance:   Array.isArray(u.finance)  ? u.finance  : [],
      notes:     Array.isArray(u.notes)    ? u.notes    : [],
      planner:   Array.isArray(u.planner)  ? u.planner  : [],
      workLogs:  Array.isArray(u.workLogs) ? u.workLogs : [],
      workControl: u.workControl || null,
      habits,
      workouts: Array.isArray(u.workouts) ? u.workouts : [],
      meals:    Array.isArray(u.meals)    ? u.meals    : [],
      waterLog: u.waterLog || {}
    };
  }
  function persistUser(patch){
    if(!S.user) return;
    S.user = normalizeUser({ ...S.user, ...patch });
    const list = loadUsers();
    const i = list.findIndex(x => x.id === S.user.id);
    if(i >= 0) list[i] = S.user; else list.push(S.user);
    saveUsers(list);
  }

  // ─── Work logic (auto earnings) ───
  const offMap = {
    'الأحد':0,'الاحد':0,'sunday':0,
    'الاثنين':1,'الإثنين':1,'monday':1,
    'الثلاثاء':2,'tuesday':2,
    'الأربعاء':3,'الاربعاء':3,'wednesday':3,
    'الخميس':4,'thursday':4,
    'الجمعة':5,'friday':5,
    'السبت':6,'saturday':6
  };
  function offIndexes(){
    const raw = String(S.user?.profile?.offDays||'').toLowerCase();
    return [...new Set(
      raw.split(/[،,;؛+\/|]+/).map(s=>s.trim())
         .filter(s => offMap[s] !== undefined)
         .map(s => offMap[s])
    )];
  }
  function isWorkday(d=new Date()){
    if(!S.user) return false;
    const off = offIndexes();
    if(off.length) return !off.includes(d.getDay());
    const days = Number(S.user.profile.workDays) || 5;
    if(days >= 7) return true;
    return d.getDay() >= 1 && d.getDay() <= Math.min(days, 6);
  }
  function workWindow(d=new Date()){
    const p = S.user.profile;
    const start = new Date(d);
    start.setHours(Math.floor(timeMins(p.workStart)/60), timeMins(p.workStart)%60, 0, 0);
    const end = new Date(d);
    end.setHours(Math.floor(timeMins(p.workEnd)/60), timeMins(p.workEnd)%60, 0, 0);
    if(end <= start) end.setDate(end.getDate() + 1);
    return { start, end };
  }
  function hourlyRate(){
    if(!S.user) return 0;
    const p = S.user.profile;
    const salary = Number(p.salary) || 0;
    if(p.salaryType === 'hourly') return salary;
    const h = hoursBetween(p.workStart, p.workEnd);
    const days = Number(p.workDays) || 5;
    return h > 0 ? salary / (days * 4.345 * h) : 0;
  }
  function calcDayEarnings(date){
    if(!S.user) return { hours:0, earnings:0, locked:true, mode:'off', isToday:false };
    const now = new Date();
    const nowK = dayKey(now);
    const k = dayKey(date);
    if(!isWorkday(date)) return { hours:0, earnings:0, locked:true, mode:'off', isToday:k===nowK };
    const rate = hourlyRate();
    const { start, end } = workWindow(date);
    const fullHours = (end - start) / 3600000;
    if(k < nowK) return { hours:fullHours, earnings:rate*fullHours, locked:true, mode:'auto', isToday:false };
    if(k > nowK) return { hours:0, earnings:0, locked:true, mode:'auto', isToday:false };
    const mc = S.user.workControl;
    if(mc && mc.date === k && mc.startedAt){
      const mStart = new Date(mc.startedAt);
      const mEnd = mc.stoppedAt ? new Date(mc.stoppedAt) : now;
      const s = mStart > start ? mStart : start;
      const e = mEnd < end ? mEnd : end;
      const hrs = Math.max(0, (e - s) / 3600000);
      return { hours:hrs, earnings:rate*hrs, locked:!!mc.stoppedAt || now>=end, mode:'manual', isToday:true };
    }
    if(now < start) return { hours:0, earnings:0, locked:false, mode:'auto', isToday:true };
    if(now >= end) return { hours:fullHours, earnings:rate*fullHours, locked:true, mode:'auto', isToday:true };
    const hrs = (now - start) / 3600000;
    return { hours:hrs, earnings:rate*hrs, locked:false, mode:'auto', isToday:true };
  }
  function monthlyEarned(){
    if(!S.user) return 0;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
    let total = 0;
    for(let d = new Date(first); d <= last; d.setDate(d.getDate()+1)){
      total += calcDayEarnings(new Date(d)).earnings;
    }
    return total;
  }
  function todayStatus(){
    const snap = calcDayEarnings(new Date());
    if(snap.mode === 'off') return { state:'إجازة اليوم', meta:'لا يوجد احتساب', ...snap };
    if(snap.locked) return { state:'انتهى وقت العمل', meta:'اكتمل مكسب اليوم', ...snap };
    const p = S.user.profile;
    const { start } = workWindow(new Date());
    const now = new Date();
    if(now < start) return { state:'قبل بداية العمل', meta:`يبدأ تلقائيًا ${p.workStart}`, ...snap };
    if(snap.mode === 'manual') return { state:'عمل يدوي جارٍ', meta:'الجلسة محفوظة', ...snap };
    return { state:'يعمل تلقائيًا', meta:`يتوقف ${p.workEnd}`, ...snap };
  }
  function monthlyProgress(){
    if(!S.user) return 0;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth()+1, 0);
    let sched=0, elapsed=0;
    for(let d = new Date(first); d <= last; d.setDate(d.getDate()+1)){
      const date = new Date(d);
      if(!isWorkday(date)) continue;
      const { start, end } = workWindow(date);
      sched += end - start;
      if(dayKey(date) < dayKey(now)) elapsed += end - start;
      else if(dayKey(date) === dayKey(now)) elapsed += Math.max(0, Math.min(now, end) - start);
    }
    return sched ? Math.min(100, Math.round(elapsed/sched*100)) : 0;
  }

  // ─── UI Helpers ───
  function toast(text){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toast').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function showMsg(id, text, type='error'){
    const el = $(id);
    if(!el) return;
    el.textContent = text;
    el.className = 'msg ' + type;
  }
  function openDialog(title, desc, body){
    const m = $('modal');
    m.classList.remove('hidden');
    m.innerHTML = `
      <div class="dialog">
        <div class="dialog-head">
          <div>
            <span class="eyebrow">YOURSELF</span>
            <h3>${esc(title)}</h3>
            ${desc ? `<p>${esc(desc)}</p>` : ''}
          </div>
          <button class="close" onclick="Yourself.closeDialog()">×</button>
        </div>
        <div>${body}</div>
      </div>`;
  }
  function closeDialog(){
    const m = $('modal');
    m.classList.add('hidden');
    m.innerHTML = '';
  }
  function setTheme(name){
    document.documentElement.className = '';
    if(name && name !== 'teal') document.documentElement.classList.add('theme-' + name);
    const p = getPref(); p.theme = name; setPref(p);
    $$('.theme-tile').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
  }

  // ─── Screen management ───
  function hideAllScreens(){
    ['loginScreen','accountScreen','registerScreen','pendingScreen','devScreen','appView']
      .forEach(id => $(id)?.classList.add('hidden'));
  }
  function showLogin(){
    hideAllScreens();
    $('loginScreen').classList.remove('hidden');
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    showMsg('loginMsg','');
  }
  function showAccount(){
    hideAllScreens();
    $('accountScreen').classList.remove('hidden');
    showMsg('accMsg','');
  }
  function showRegister(){
    hideAllScreens();
    $('registerScreen').classList.remove('hidden');
    setWizard(1);
    showMsg('registerMsg','');
  }
  function showPending(email){
    hideAllScreens();
    $('pendingScreen').classList.remove('hidden');
    $('pendingEmail').textContent = email;
    $('pendingTime').textContent = timeAr(new Date());
  }
  function showDev(){
    hideAllScreens();
    $('devScreen').classList.remove('hidden');
    renderDevScreen();
  }
  function enterApp(u){
    S.user = normalizeUser(u);
    hideAllScreens();
    $('appView').classList.remove('hidden');
    renderAll();
    go('dashboard');
    startTick();
  }
  function logout(){
    clearSession();
    if(S.tick) clearInterval(S.tick);
    S.user = null;
    showLogin();
  }

  // ─── Auth: Login ───
  function login(e){
    e.preventDefault();
    const email = emailOf($('loginEmail').value);
    const pass = $('loginPassword').value;
    if(!email || !pass) return showMsg('loginMsg','أدخل البريد وكلمة المرور.');

    // Developer check
    if(DEVS.some(d => d.email === email && d.pass === pass)){
      setDevSession(email);
      return showDev();
    }

    const u = loadUsers().find(x => emailOf(x.email) === email);
    if(!u || u.password !== pass)
      return showMsg('loginMsg','بيانات الدخول غير صحيحة.');

    if(u.status === 'pending')
      return showMsg('loginMsg','حسابك قيد المراجعة من المطوّر. يرجى الانتظار حتى الموافقة.', 'info');

    if(u.status === 'rejected')
      return showMsg('loginMsg','تم رفض طلب إنشاء حسابك. تواصل مع المطوّر لمزيد من التفاصيل.');

    if(u.status === 'approved'){
      setSession(u.email);
      return enterApp(u);
    }

    // Legacy accounts without status → treat as approved
    setSession(u.email);
    enterApp(u);
  }

  // ─── Auth: Account (email + password) ───
  function strengthAccount(){
    const v = $('accPass').value;
    const t = [v.length>=8, /[A-Za-zأ-ي]/.test(v), /\d/.test(v), /[^A-Za-z0-9أ-ي]/.test(v)];
    const score = t.filter(Boolean).length;
    const bars = $('accountForm').querySelectorAll('.strength i');
    bars.forEach((x,i) => x.classList.toggle('on', i < score));
    const s = $('accountForm').querySelector('.strength small');
    if(s) s.textContent = 'قوة كلمة المرور · ' +
      (score < 2 ? 'ضعيفة' : score === 2 ? 'متوسطة' : score === 3 ? 'جيدة' : 'قوية');
  }
  function accountSubmit(e){
    e.preventDefault();
    const name = $('accName').value.trim();
    const email = emailOf($('accEmail').value);
    const p = $('accPass').value;
    const p2 = $('accPass2').value;

    if(!name) return showMsg('accMsg','اكتب اسمك الكامل.');
    if(!email || !/\S+@\S+\.\S+/.test(email)) return showMsg('accMsg','أدخل بريدًا صحيحًا.');
    if(p.length < 8) return showMsg('accMsg','كلمة المرور 8 أحرف على الأقل.');
    if(p !== p2) return showMsg('accMsg','تأكيد كلمة المرور غير مطابق.');
    if(loadUsers().some(x => emailOf(x.email) === email) || DEVS.some(x => x.email === email))
      return showMsg('accMsg','هذا البريد مستخدم بالفعل.');

    S.tempAccount = { name, email, password: p };
    showRegister();
  }

  // ─── Register wizard ───
  function setWizard(step){
    S.wizard = step;
    $$('.wp').forEach(p => p.classList.toggle('active', +p.dataset.pane === step));

    // update step indicators (2, 3, 4 correspond to wizard 1, 2, 3)
    $$('.wstep').forEach(s => {
      const n = s.dataset.step ? +s.dataset.step : null;
      if(n === null) return; // account step (1) is always done
      s.classList.toggle('active', n === step);
      s.classList.toggle('done', n < step);
    });
    // progress bar: start at 50% after account, end at 100%
    const pct = 50 + (step - 1) * (50 / 3);
    $('wizBar').style.width = pct + '%';
    const labels = ['البيانات الشخصية','العمل والدخل','الروتين والصحة'];
    $('wizLabel').textContent = `الخطوة ${step + 1} من 4 · ${labels[step - 1]}`;
    $('wPrev').disabled = step === 1;
    $('wNext').classList.toggle('hidden', step === 3);
    $('wFinish').classList.toggle('hidden', step !== 3);
    showMsg('registerMsg','');
  }
  function wizardNext(){
    const step = S.wizard;
    if(step === 1){
      const age = Number($('regAge').value);
      if(age && (age < 1 || age > 120)) return showMsg('registerMsg','العمر غير صحيح.');
    }
    if(step === 2){
      const job = $('regJob').value.trim();
      const sal = Number($('regSalary').value);
      if(!job) return showMsg('registerMsg','اكتب الوظيفة أو المجال.');
      if(!sal || sal <= 0) return showMsg('registerMsg','أدخل قيمة الدخل.');
    }
    setWizard(Math.min(3, step + 1));
  }
  function wizardPrev(){
    if(S.wizard > 1) setWizard(S.wizard - 1);
    else showAccount();
  }

  // ─── Register submit ───
  function registerSubmit(e){
    e.preventDefault();
    if(!S.tempAccount) return showAccount();

    const act = document.querySelector('input[name="act"]:checked')?.value || 'moderate';
    const u = newUser({
      name: S.tempAccount.name,
      email: S.tempAccount.email,
      password: S.tempAccount.password,
      status: 'pending',
      profile: {
        job: $('regJob').value.trim(),
        salaryType: $('regSalaryType').value,
        salary: Number($('regSalary').value) || 0,
        workDays: Number($('regWorkDays').value) || 5,
        workStart: $('regStart').value || '08:30',
        workEnd:   $('regEnd').value   || '17:00',
        offDays:   $('regOff').value.trim() || 'الجمعة، السبت',
        wake:      $('regWake').value || '07:00',
        sleep:     $('regSleep').value || '23:00',
        goWork:    $('regGo').value  || '08:00',
        backWork:  $('regBack').value || '17:30',
        goal:      $('regGoal').value,
        activity:  act,
        age:       $('regAge').value,
        weight:    $('regWeight').value,
        height:    $('regHeight').value,
        calorieGoal: Number($('regCalGoal').value) || 2000,
        waterGoal:   Number($('regWaterGoal').value) || 8
      },
      habits: defaultHabits()
    });
    const d = dayKey();
    u.planner = [
      { id: uid(), date:d, time:u.profile.goWork,    title:'الذهاب للعمل', category:'روتين',   done:false },
      { id: uid(), date:d, time:u.profile.workStart, title:'بداية العمل',  category:'عمل',     done:false },
      { id: uid(), date:d, time:'13:00',             title:'فاصل وغداء',   category:'استراحة', done:false },
      { id: uid(), date:d, time:u.profile.workEnd,   title:'إغلاق العمل',  category:'عمل',     done:false }
    ];
    const list = loadUsers();
    list.push(u);
    saveUsers(list);

    const email = u.email;
    S.tempAccount = null;
    showPending(email);
    toast('تم إرسال طلبك للمطوّر ✦');
  }

  // ═══════════════════════════════════════════════════════
  // DEVELOPER CONSOLE
  // ═══════════════════════════════════════════════════════
  function renderDevScreen(){
    const list = loadUsers();
    const pending = list.filter(u => u.status === 'pending' || !u.status).length;
    const approved = list.filter(u => u.status === 'approved' || (!u.status && u.email)).length;
    const rejected = list.filter(u => u.status === 'rejected').length;
    // Fix: count legacy as approved
    const totalApproved = list.filter(u => u.status !== 'pending' && u.status !== 'rejected').length;

    $('dTotal').textContent = list.length;
    $('dPending').textContent = pending;
    $('dApproved').textContent = totalApproved;
    $('dRejected').textContent = rejected;

    // Notification badge
    const badge = $('devNotifBadge');
    if(pending > 0){
      badge.textContent = pending;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    $('fPending').textContent = pending;

    // Render list based on filter
    renderDevList();
  }
  function renderDevList(){
    const list = loadUsers();
    let filtered = list;
    if(S.devFilter === 'pending') filtered = list.filter(u => u.status === 'pending' || !u.status);
    else if(S.devFilter === 'approved') filtered = list.filter(u => u.status === 'approved' || (!u.status && u.email));
    else if(S.devFilter === 'rejected') filtered = list.filter(u => u.status === 'rejected');

    // Sort: pending first, then by date
    filtered = filtered.slice().sort((a,b) => {
      const sa = a.status === 'pending' || !a.status ? 0 : 1;
      const sb = b.status === 'pending' || !b.status ? 0 : 1;
      if(sa !== sb) return sa - sb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const container = $('devList');
    if(!filtered.length){
      container.innerHTML = `<div class="empty" style="grid-column:1/-1;text-align:center;padding:40px">
        <b>لا توجد حسابات</b>
        <span>${S.devFilter === 'pending' ? 'لا يوجد طلبات في الانتظار.' : 'لا توجد نتائج في هذا التصنيف.'}</span>
      </div>`;
      return;
    }

    container.innerHTML = filtered.map(u => {
      const status = u.status || 'approved';
      const statusLabel = status === 'pending' ? 'قيد المراجعة' : status === 'approved' ? 'مقبول' : 'مرفوض';
      const initial = (u.name || '?').trim().charAt(0).toUpperCase();
      const workHours = hoursBetween(u.profile?.workStart||'00:00', u.profile?.workEnd||'00:00').toFixed(1);
      return `
        <div class="user-card ${status}">
          <div class="user-head">
            <div class="user-head-left">
              <div class="user-avatar">${initial}</div>
              <div>
                <b>${esc(u.name || 'بدون اسم')}</b>
                <small>${esc(u.email || '—')}</small>
              </div>
            </div>
            <span class="status ${status}">${statusLabel}</span>
          </div>

          <div class="user-details">
            <div><span>الوظيفة</span><b>${esc(u.profile?.job || '—')}</b></div>
            <div><span>الدخل</span><b>${fmtMoney(u.profile?.salary || 0)}</b></div>
            <div><span>الدوام</span><b>${esc(u.profile?.workStart||'—')} → ${esc(u.profile?.workEnd||'—')}</b></div>
            <div><span>ساعات / يوم</span><b>${workHours}h</b></div>
            <div><span>الإجازة</span><b>${esc(u.profile?.offDays || '—')}</b></div>
            <div><span>مسجّل في</span><b>${shortAr(new Date(u.createdAt))}</b></div>
          </div>

          <div class="user-actions">
            ${status === 'pending' ? `
              <button class="btn btn-primary sm" onclick="Yourself.approveUser('${u.id}')">✓ قبول</button>
              <button class="btn btn-danger sm" onclick="Yourself.rejectUser('${u.id}')">✕ رفض</button>
            ` : ''}
            ${status === 'approved' ? `
              <button class="btn btn-danger sm" onclick="Yourself.rejectUser('${u.id}')">↺ تعليق الحساب</button>
            ` : ''}
            ${status === 'rejected' ? `
              <button class="btn btn-primary sm" onclick="Yourself.approveUser('${u.id}')">✓ إعادة قبول</button>
            ` : ''}
            <button class="btn btn-ghost sm" onclick="Yourself.inspectUser('${u.id}')">تفاصيل</button>
            <button class="btn btn-ghost sm" onclick="Yourself.deleteUser('${u.id}')">حذف</button>
          </div>
        </div>`;
    }).join('');
  }
  function approveUser(id){
    const list = loadUsers();
    const i = list.findIndex(x => x.id === id);
    if(i < 0) return;
    list[i].status = 'approved';
    list[i].approvedAt = new Date().toISOString();
    saveUsers(list);
    renderDevScreen();
    toast('تم قبول الحساب ✓');
  }
  function rejectUser(id){
    const list = loadUsers();
    const i = list.findIndex(x => x.id === id);
    if(i < 0) return;
    list[i].status = 'rejected';
    list[i].rejectedAt = new Date().toISOString();
    saveUsers(list);
    renderDevScreen();
    toast('تم رفض الحساب.');
  }
  function inspectUser(id){
    const u = loadUsers().find(x => x.id === id);
    if(!u) return;
    const status = u.status || 'approved';
    const statusLabel = status === 'pending' ? 'قيد المراجعة' : status === 'approved' ? 'مقبول' : 'مرفوض';
    openDialog('تفاصيل الحساب', u.name + ' · ' + u.email, `
      <div class="user-details" style="margin-bottom:14px">
        <div><span>الاسم</span><b>${esc(u.name)}</b></div>
        <div><span>البريد</span><b>${esc(u.email)}</b></div>
        <div><span>الحالة</span><b>${statusLabel}</b></div>
        <div><span>الوظيفة</span><b>${esc(u.profile?.job||'—')}</b></div>
        <div><span>الدخل</span><b>${fmtMoney(u.profile?.salary||0)}</b></div>
        <div><span>نوع الدخل</span><b>${u.profile?.salaryType === 'hourly' ? 'بالساعة' : 'شهري'}</b></div>
        <div><span>ساعات/يوم</span><b>${hoursBetween(u.profile?.workStart||'00:00', u.profile?.workEnd||'00:00').toFixed(1)}h</b></div>
        <div><span>أيام/أسبوع</span><b>${u.profile?.workDays||0}</b></div>
        <div><span>الدوام</span><b>${esc(u.profile?.workStart||'—')} → ${esc(u.profile?.workEnd||'—')}</b></div>
        <div><span>الإجازة</span><b>${esc(u.profile?.offDays||'—')}</b></div>
        <div><span>الاستيقاظ</span><b>${esc(u.profile?.wake||'—')}</b></div>
        <div><span>النوم</span><b>${esc(u.profile?.sleep||'—')}</b></div>
        <div><span>العمر</span><b>${esc(u.profile?.age||'—')}</b></div>
        <div><span>الوزن</span><b>${esc(u.profile?.weight||'—')} kg</b></div>
        <div><span>الطول</span><b>${esc(u.profile?.height||'—')} cm</b></div>
        <div><span>الهدف</span><b>${esc(u.profile?.goal||'—')}</b></div>
        <div><span>مسجّل في</span><b>${dateAr(new Date(u.createdAt))}</b></div>
      </div>
      <div class="dialog-actions">
        ${status === 'pending' ? `
          <button class="btn btn-primary" onclick="Yourself.approveUser('${u.id}');Yourself.closeDialog()">✓ قبول الحساب</button>
          <button class="btn btn-danger" onclick="Yourself.rejectUser('${u.id}');Yourself.closeDialog()">✕ رفض</button>
        ` : status === 'approved' ? `
          <button class="btn btn-danger" onclick="Yourself.rejectUser('${u.id}');Yourself.closeDialog()">تعليق الحساب</button>
          <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إغلاق</button>
        ` : `
          <button class="btn btn-primary" onclick="Yourself.approveUser('${u.id}');Yourself.closeDialog()">إعادة قبول</button>
          <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إغلاق</button>
        `}
      </div>`);
  }
  function deleteUser(id){
    if(!confirm('هل تريد حذف هذا الحساب نهائيًا؟')) return;
    saveUsers(loadUsers().filter(x => x.id !== id));
    renderDevScreen();
    toast('تم حذف الحساب.');
  }

  // ─── Auto refresh dev screen (every 5s) ───
  function startDevTick(){
    setInterval(() => {
      if(!$('devScreen').classList.contains('hidden')){
        renderDevScreen();
      }
    }, 5000);
  }

  // ═══════════════════════════════════════════════════════
  // MAIN APP
  // ═══════════════════════════════════════════════════════
  function startTick(){
    if(S.tick) clearInterval(S.tick);
    S.tick = setInterval(() => {
      if(!S.user) return;
      if(S.page === 'dashboard') renderDashboard();
    }, 1000);
  }
  function go(page){
    if(!S.user) return;
    S.page = page;
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    $$('.sb-item, .bn-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    if(page === 'dashboard') renderDashboard();
    if(page === 'work')      renderWork();
    if(page === 'planner')   renderPlanner();
    if(page === 'notes')     renderNotes();
    if(page === 'exercise')  renderExercise();
    if(page === 'diet')      renderDiet();
    if(page === 'health')    renderHealth();
    if(page === 'settings')  renderSettings();
    $('sidebar').classList.remove('open');
  }
  function toggleSidebar(){ $('sidebar').classList.toggle('open'); }

  function renderTop(){
    const name = S.user.name || 'صديقي';
    $('topName').textContent = name;
    $('topJob').textContent  = S.user.profile.job || 'مساحتك';
    $('heroName').textContent= name.split(' ')[0];
    $('avatar').textContent  = name.trim().charAt(0).toUpperCase() || 'Y';
    $('sbName').textContent  = name.split(' ')[0];
    $('tbDate').textContent  = new Intl.DateTimeFormat('ar-EG',{weekday:'long', day:'numeric', month:'short'}).format(new Date());
  }
  function renderAll(){
    renderTop();
    renderDashboard(); renderWork(); renderPlanner(); renderNotes();
    renderExercise(); renderDiet(); renderHealth(); renderSettings();
  }
  function fmtDur(ms){
    const t = Math.max(0, Math.floor(ms/1000));
    const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = t%60;
    return [h,m,s].map(x => String(x).padStart(2,'0')).join(':');
  }

  // ── Dashboard ──
  function renderDashboard(){
    if(!S.user) return;
    const p = S.user.profile;
    const now = new Date();
    $('weekday').textContent  = new Intl.DateTimeFormat('ar-EG', {weekday:'long'}).format(now);
    $('dateText').textContent = dateAr(now);
    $('todayText').textContent = `هدفك: ${p.goal} · الدوام ${p.workStart} → ${p.workEnd}`;

    const st = todayStatus();
    const rate = hourlyRate();
    const monthTotal = monthlyEarned();

    $('kTodayEarned').textContent = fmtNum(st.earnings);
    $('kTodayEarnedMeta').textContent = st.state;
    $('kHourRate').textContent = fmtNum(rate);
    $('kTodayHours').textContent = st.hours.toFixed(2) + 'h';
    $('kTodayHoursMeta').textContent = st.meta;
    $('kMonthEarned').textContent = fmtNum(monthTotal);
    $('kMonthEarnedMeta').textContent = `${monthlyProgress()}% من الشهر`;

    $('clockBadge').textContent = st.state;
    $('clockState').textContent = st.state;
    $('clockMeta').textContent  = st.meta;
    $('timer').textContent      = fmtDur(st.hours * 3600000);
    $('clockEarn').textContent  = fmtMoney(st.earnings);

    const pct = Math.min(1, st.hours / 8);
    $('clockRing').style.strokeDashoffset = 327 - (327 * pct);

    $('sideState').textContent = st.mode === 'off' ? 'إجازة' : st.state;
    $('sideMeta').textContent  = st.meta;

    const active = S.user.workControl?.date === dayKey()
                && S.user.workControl?.startedAt
                && !S.user.workControl?.stoppedAt;
    $('manualStart').disabled = !!active || st.mode === 'off' || st.locked;
    $('manualStop').disabled  = !active;
    $('manualStart').textContent = active ? 'الجلسة جارية' : 'بدء يدوي';

    const items = S.user.finance || [];
    const ded = items.filter(x => x.kind === 'deduction').reduce((a,x) => a + Number(x.amount||0), 0);
    const ext = items.filter(x => x.kind === 'extra').reduce((a,x) => a + Number(x.amount||0), 0);
    const base = Number(p.salary) || 0;
    const net = Math.max(0, base + ext - ded);
    $('baseMoney').textContent   = fmtNum(base);
    $('deductMoney').textContent = fmtNum(ded);
    $('extraMoney').textContent  = fmtNum(ext);
    $('netMoney').textContent    = fmtMoney(net);
    const moneyPct = base > 0 ? Math.round((net / base) * 100) : 0;
    $('moneyPct').textContent = Math.min(100, moneyPct) + '%';
    $('moneyDonut').style.strokeDashoffset = 100.5 - (100.5 * Math.min(1, moneyPct/100));

    const today = dayKey();
    const next = S.user.planner.filter(x => x.date === today).sort((a,b) => a.time.localeCompare(b.time)).slice(0,5);
    $('nextList').innerHTML = next.length ? next.map(x => `
      <div class="tl-item">
        <time>${esc(x.time)}</time><i></i>
        <div><b>${esc(x.title)}</b><span>${esc(x.category || 'مهمة')}</span></div>
      </div>`).join('') : '<div class="empty"><b>يومك مفتوح</b><span>أضف مهمة من قسم تنظيم الوقت.</span></div>';

    const notes = S.user.notes.slice().sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0,3);
    $('notePreview').innerHTML = notes.length ? notes.map(n => `
      <div class="np-item">
        <b>${esc(n.title)}</b>
        <span>${esc((n.content || '').slice(0,120))}</span>
      </div>`).join('') : '<div class="empty"><b>المذكرة جاهزة</b><span>اكتب أول ملاحظة.</span></div>';
  }
  function manualStart(){
    const key = dayKey();
    if(!isWorkday(new Date())) return toast('اليوم إجازة حسب جدولك.');
    const { end } = workWindow(new Date());
    if(new Date() >= end) return toast('انتهى وقت العمل اليوم.');
    persistUser({ workControl: { date:key, startedAt:new Date().toISOString(), stoppedAt:null } });
    renderDashboard();
    toast('بدأت الجلسة اليدوية.');
  }
  function manualStop(){
    if(!S.user.workControl?.startedAt) return;
    persistUser({ workControl: { ...S.user.workControl, stoppedAt: new Date().toISOString() } });
    renderDashboard();
    toast('تم حفظ الجلسة.');
  }

  // ── Work ──
  function renderWork(){
    if(!S.user) return;
    const p = S.user.profile;
    const rate = hourlyRate();
    const prog = monthlyProgress();
    $('bigRate').textContent      = fmtNum(rate);
    $('workSalary').textContent   = fmtMoney(p.salary);
    $('workHoursDay').textContent = hoursBetween(p.workStart, p.workEnd).toFixed(1);
    $('workDays').textContent     = p.workDays;
    $('workSchedule').textContent = `${p.workStart} → ${p.workEnd}`;
    $('monthPct').textContent     = prog + '%';
    $('monthBar').style.width     = prog + '%';

    const list = S.user.finance.filter(x => S.moneyFilter === 'all' || x.kind === S.moneyFilter).slice().reverse();
    $('moneyList').innerHTML = list.length ? list.slice(0,8).map(x => `
      <div class="row">
        <div><b>${esc(x.title)}</b><small>${shortAr(new Date(x.createdAt))}</small></div>
        <span class="kind ${x.kind}">${x.kind === 'deduction' ? 'خصم' : 'إضافي'}</span>
        <button class="del" onclick="Yourself.removeMoney('${x.id}')">×</button>
        <b>${x.kind === 'deduction' ? '-' : '+'}${fmtNum(x.amount)}</b>
      </div>`).join('') : '<div class="empty"><b>لا توجد حركات</b><span>أضف خصمًا أو إضافة.</span></div>';

    $('moneyTable').innerHTML = list.length ? list.map(x => `
      <tr>
        <td><b>${esc(x.title)}</b></td>
        <td><span class="kind ${x.kind}">${x.kind === 'deduction' ? 'خصم' : 'إضافي'}</span></td>
        <td>${x.kind === 'deduction' ? '-' : '+'}${fmtNum(x.amount)} EGP</td>
        <td>${shortAr(new Date(x.createdAt))}</td>
        <td><button class="table-action" onclick="Yourself.removeMoney('${x.id}')">حذف</button></td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--ink-4);padding:24px">لا توجد عمليات</td></tr>';
  }
  function removeMoney(id){
    persistUser({ finance: S.user.finance.filter(x => x.id !== id) });
    renderWork(); renderDashboard();
    toast('تم الحذف.');
  }
  function openMoneyDialog(){
    openDialog('حركة مالية', 'أضف خصمًا أو مبلغًا إضافيًا.', `
      <div class="two">
        <label>النوع<select id="mType"><option value="deduction">خصم</option><option value="extra">إضافي</option></select></label>
        <label>المبلغ<input id="mAmount" type="number" min="0" step="0.01" placeholder="250"></label>
      </div>
      <label>الوصف<input id="mTitle" type="text" placeholder="مثال: مواصلات"></label>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveMoney()">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveMoney(){
    const amount = Number($('mAmount').value) || 0;
    if(amount <= 0) return toast('أدخل مبلغًا صحيحًا.');
    const item = { id: uid(), kind: $('mType').value, amount,
      title: $('mTitle').value.trim() || 'حركة مالية',
      createdAt: new Date().toISOString() };
    persistUser({ finance: [...S.user.finance, item] });
    closeDialog(); renderWork(); renderDashboard();
    toast('تم الحفظ.');
  }
  function openWorkDialog(){
    const p = S.user.profile;
    openDialog('بيانات العمل', 'حدّث الدخل والدوام.', `
      <div class="two">
        <label>الدخل<input id="wSalary" type="number" value="${p.salary}"></label>
        <label>النوع<select id="wType">
          <option value="monthly" ${p.salaryType==='monthly'?'selected':''}>شهري</option>
          <option value="hourly" ${p.salaryType==='hourly'?'selected':''}>بالساعة</option>
        </select></label>
        <label>أيام / أسبوع<input id="wDays" type="number" min="1" max="7" value="${p.workDays}"></label>
        <label>الإجازة<input id="wOff" type="text" value="${esc(p.offDays)}"></label>
        <label>البداية<input id="wStart" type="time" value="${p.workStart}"></label>
        <label>النهاية<input id="wEnd" type="time" value="${p.workEnd}"></label>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveWork()">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveWork(){
    persistUser({ profile: { ...S.user.profile,
      salary: Number($('wSalary').value) || 0,
      salaryType: $('wType').value,
      workDays: Number($('wDays').value) || 5,
      offDays: $('wOff').value.trim(),
      workStart: $('wStart').value,
      workEnd: $('wEnd').value
    }});
    closeDialog(); renderAll();
    toast('تم التحديث.');
  }

  // ── Planner ──
  function renderPlanner(){
    if(!S.user) return;
    const d = S.plannerDate;
    const key = dayKey(d);
    const items = S.user.planner.filter(x => x.date === key);
    $('planDay').textContent  = new Intl.DateTimeFormat('ar-EG', {weekday:'long'}).format(d);
    $('planDate').textContent = dateAr(d);

    let html = '';
    for(let h = 6; h <= 23; h++){
      const hh = String(h).padStart(2,'0');
      const found = items.filter(x => String(x.time).startsWith(hh + ':'));
      html += `
        <div class="hour">
          <div class="hour-time">${hh}:00</div>
          <div class="slot ${found.length ? '' : 'empty'}">
            ${found.map(x => `<div class="task-chip"><span>${esc(x.title)}</span><b>${esc(x.time)}</b></div>`).join('')}
          </div>
        </div>`;
    }
    $('schedule').innerHTML = html;

    const p = S.user.profile;
    $('routine').innerHTML = [
      ['الاستيقاظ', p.wake], ['الذهاب', p.goWork],
      ['العمل', `${p.workStart} → ${p.workEnd}`],
      ['الرجوع', p.backWork], ['النوم', p.sleep]
    ].map(x => `<div class="rr-row"><span>${x[0]}</span><b>${esc(x[1] || '—')}</b></div>`).join('');

    renderFocus();
  }
  function openTaskDialog(){
    openDialog('مهمة جديدة', 'أضف مهمة لأي يوم.', `
      <div class="two">
        <label>التاريخ<input id="tDate" type="date" value="${dayKey(S.plannerDate)}"></label>
        <label>الوقت<input id="tTime" type="time" value="09:00"></label>
      </div>
      <label>العنوان<input id="tTitle" type="text" placeholder="مثال: إنهاء المهمة"></label>
      <label>التصنيف<select id="tCategory">
        <option>عمل</option><option>تعلم</option><option>استراحة</option>
        <option>صحة</option><option>شخصي</option><option>روتين</option>
      </select></label>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveTask()">إضافة</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveTask(){
    const title = $('tTitle').value.trim();
    if(!title) return toast('اكتب العنوان.');
    persistUser({ planner: [...S.user.planner, {
      id: uid(), date: $('tDate').value, time: $('tTime').value,
      title, category: $('tCategory').value, done:false
    }]});
    closeDialog(); renderPlanner(); renderDashboard();
    toast('تمت الإضافة.');
  }
  function renderFocus(){
    const m = Math.floor(S.focus.seconds/60);
    const s = S.focus.seconds%60;
    $('focusTimer').textContent  = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    $('focusToggle').textContent = S.focus.running ? 'إيقاف' : 'بدء';
  }
  function toggleFocus(){
    if(S.focus.running){
      clearInterval(S.focus.interval);
      S.focus.running = false;
    } else {
      S.focus.running = true;
      S.focus.interval = setInterval(() => {
        S.focus.seconds--;
        if(S.focus.seconds <= 0){ resetFocus(); toast('انتهت الجلسة ✦'); }
        renderFocus();
      }, 1000);
    }
    renderFocus();
  }
  function resetFocus(){
    clearInterval(S.focus.interval);
    S.focus.running = false;
    S.focus.seconds = 1500;
    renderFocus();
  }

  // ── Notes ──
  const noteCatLabel = c => ({ idea:'فكرة', work:'عمل', finance:'مال', health:'صحة', personal:'شخصية' }[c] || c);
  function renderNotes(){
    if(!S.user) return;
    let list = S.user.notes.slice();
    if(S.noteFilter === 'pinned') list = list.filter(x => x.pinned);
    else if(S.noteFilter !== 'all') list = list.filter(x => x.category === S.noteFilter);
    if(S.noteSearch) list = list.filter(x => `${x.title} ${x.content}`.toLowerCase().includes(S.noteSearch));
    list.sort((a,b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));

    $('notesGrid').innerHTML = list.length ? list.map(n => `
      <article class="note-card ${n.pinned ? 'pinned' : ''}">
        <div class="note-top">
          <span class="note-type">${esc(noteCatLabel(n.category))}</span>
          <button class="pin" onclick="Yourself.pinNote('${n.id}')">${n.pinned ? '★' : '☆'}</button>
        </div>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.content)}</p>
        <div class="note-foot">
          <small>${shortAr(new Date(n.updatedAt))}</small>
          <div class="acts">
            <button onclick="Yourself.editNote('${n.id}')">✎</button>
            <button onclick="Yourself.removeNote('${n.id}')">×</button>
          </div>
        </div>
      </article>`).join('') : '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--ink-3);padding:40px"><b style="font-size:15px">لا توجد ملاحظات</b><p style="margin-top:6px;font-size:12.5px">اكتب أول ملاحظة للبدء.</p></div>';
  }
  function openNoteDialog(note=null){
    const n = note || { title:'', content:'', category:'idea' };
    openDialog(note ? 'تعديل ملاحظة' : 'ملاحظة جديدة', '', `
      <label>العنوان<input id="nTitle" type="text" value="${esc(n.title)}"></label>
      <label>التصنيف<select id="nCategory">
        <option value="idea"     ${n.category==='idea'?'selected':''}>فكرة</option>
        <option value="work"     ${n.category==='work'?'selected':''}>عمل</option>
        <option value="finance"  ${n.category==='finance'?'selected':''}>مال</option>
        <option value="health"   ${n.category==='health'?'selected':''}>صحة</option>
        <option value="personal" ${n.category==='personal'?'selected':''}>شخصية</option>
      </select></label>
      <label>المحتوى<textarea id="nContent">${esc(n.content)}</textarea></label>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveNote('${n.id||''}')">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveNote(id){
    const content = $('nContent').value.trim();
    if(!content) return toast('اكتب المحتوى.');
    const old = S.user.notes.find(x => x.id === id);
    const n = {
      id: id || uid(),
      title: $('nTitle').value.trim() || 'بدون عنوان',
      content, category: $('nCategory').value,
      pinned: old?.pinned || false,
      updatedAt: new Date().toISOString()
    };
    persistUser({ notes: [...S.user.notes.filter(x => x.id !== n.id), n] });
    closeDialog(); renderNotes(); renderDashboard();
    toast('تم الحفظ.');
  }
  function editNote(id){
    const n = S.user.notes.find(x => x.id === id);
    if(n) openNoteDialog(n);
  }
  function pinNote(id){
    persistUser({ notes: S.user.notes.map(x => x.id === id ? { ...x, pinned: !x.pinned } : x) });
    renderNotes();
  }
  function removeNote(id){
    persistUser({ notes: S.user.notes.filter(x => x.id !== id) });
    renderNotes(); renderDashboard();
    toast('تم الحذف.');
  }

  // ── Exercise ──
  function renderExercise(){
    if(!S.user) return;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7*86400000);
    const weekWk = S.user.workouts.filter(w => new Date(w.createdAt) >= weekAgo);
    const totalReps = weekWk.reduce((a,w) => a + (Number(w.reps)||0) * (Number(w.sets)||1), 0);
    const totalVol  = weekWk.reduce((a,w) => a + (Number(w.weight)||0) * (Number(w.reps)||0) * (Number(w.sets)||1), 0);
    const totalMin  = weekWk.reduce((a,w) => a + (Number(w.duration)||0), 0);

    $('wkWorkouts').textContent = weekWk.length;
    $('wkReps').textContent     = fmtNum(totalReps);
    $('wkVolume').textContent   = fmtNum(totalVol);
    $('wkMinutes').textContent  = fmtNum(totalMin);

    const list = S.user.workouts.filter(w => S.exFilter === 'all' || w.category === S.exFilter).slice().reverse();
    $('workoutList').innerHTML = list.length ? list.map(w => `
      <div class="workout-item cat-${w.category}">
        <div class="wo-head">
          <b>${esc(w.name)}</b>
          <span>${shortAr(new Date(w.createdAt))}</span>
        </div>
        <div class="wo-meta">
          <div><span>مجموعات</span><b>${w.sets || 0}</b></div>
          <div><span>تكرار</span><b>${w.reps || 0}</b></div>
          <div><span>وزن</span><b>${w.weight || 0}kg</b></div>
          <div><span>دقائق</span><b>${w.duration || 0}</b></div>
        </div>
        <button class="wo-del" onclick="Yourself.removeWorkout('${w.id}')">حذف</button>
      </div>`).join('') : '<div class="empty"><b>لا توجد تمارين</b><span>أضف أول جلسة.</span></div>';

    const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const counts = [0,0,0,0,0,0,0];
    weekWk.forEach(w => { const d = new Date(w.createdAt).getDay(); counts[d]++; });
    const max = Math.max(1, ...counts);
    $('weekChart').innerHTML = counts.map((c,i) => {
      const h = Math.max(6, (c/max) * 160);
      return `<div class="wc-bar" style="height:${h}px"><b>${c || ''}</b><span>${days[i].slice(0,3)}</span></div>`;
    }).join('');
  }
  function openWorkoutDialog(){
    openDialog('تمرين جديد', 'سجّل جلستك.', `
      <label>اسم التمرين<input id="exName" type="text" placeholder="مثال: بنش برس"></label>
      <div class="two">
        <label>النوع<select id="exCat">
          <option value="gym">جيم</option><option value="cardio">كارديو</option>
          <option value="home">منزلي</option><option value="flex">تمدد</option>
        </select></label>
        <label>المدة (دقيقة)<input id="exDuration" type="number" min="0" placeholder="45"></label>
        <label>مجموعات<input id="exSets" type="number" min="0" placeholder="4"></label>
        <label>تكرارات<input id="exReps" type="number" min="0" placeholder="10"></label>
      </div>
      <label>الوزن (كجم)<input id="exWeight" type="number" min="0" step="0.5" placeholder="60"></label>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveWorkout()">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveWorkout(){
    const name = $('exName').value.trim();
    if(!name) return toast('اكتب اسم التمرين.');
    const w = {
      id: uid(), name,
      category: $('exCat').value,
      sets: Number($('exSets').value) || 0,
      reps: Number($('exReps').value) || 0,
      weight: Number($('exWeight').value) || 0,
      duration: Number($('exDuration').value) || 0,
      createdAt: new Date().toISOString()
    };
    persistUser({ workouts: [...S.user.workouts, w] });
    closeDialog(); renderExercise();
    toast('تم الحفظ.');
  }
  function removeWorkout(id){
    persistUser({ workouts: S.user.workouts.filter(x => x.id !== id) });
    renderExercise();
    toast('تم الحذف.');
  }

  // ── Diet ──
  function renderDiet(){
    if(!S.user) return;
    const today = dayKey();
    const todaysMeals = S.user.meals.filter(m => m.date === today);
    const calToday = todaysMeals.reduce((a,m) => a + (Number(m.kcal)||0), 0);
    const proteinToday = todaysMeals.reduce((a,m) => a + (Number(m.protein)||0), 0);
    const water = S.user.waterLog[today] || 0;
    const waterGoal = S.user.profile.waterGoal || 8;

    $('calToday').textContent    = fmtNum(calToday);
    $('calGoal').textContent     = fmtNum(S.user.profile.calorieGoal || 2000);
    $('waterCount').textContent  = `${water}/${waterGoal}`;
    $('proteinToday').textContent= proteinToday + 'g';

    $('mealsList').innerHTML = todaysMeals.length ? todaysMeals.map(m => `
      <div class="meal-item">
        <div class="meal-info">
          <b>${esc(m.name)}</b>
          <small>${esc(m.type || 'وجبة')} · ${m.protein || 0}g بروتين</small>
          ${m.notes ? `<p style="font-size:11.5px;color:var(--ink-3);margin-top:5px;line-height:1.6">${esc(m.notes)}</p>` : ''}
          <button class="wo-del" onclick="Yourself.removeMeal('${m.id}')">حذف</button>
        </div>
        <span class="meal-kcal">${m.kcal || 0} kcal</span>
      </div>`).join('') : '<div class="empty"><b>لا وجبات اليوم</b><span>أضف وجبتك الأولى.</span></div>';

    let wg = '';
    for(let i = 0; i < waterGoal; i++){
      wg += `<div class="water-cup ${i < water ? 'on' : ''}" onclick="Yourself.setWater(${i+1})">💧</div>`;
    }
    $('waterGrid').innerHTML = wg;
  }
  function openMealDialog(){
    openDialog('وجبة جديدة', 'سجّل وجبتك.', `
      <label>الاسم<input id="mlName" type="text" placeholder="مثال: صدر دجاج وأرز"></label>
      <div class="two">
        <label>النوع<select id="mlType">
          <option>فطار</option><option>غداء</option><option>عشاء</option><option>سناك</option>
        </select></label>
        <label>السعرات<input id="mlKcal" type="number" min="0" placeholder="450"></label>
      </div>
      <label>البروتين (g)<input id="mlProtein" type="number" min="0" placeholder="30"></label>
      <label>ملاحظات<textarea id="mlNotes" placeholder="اختياري"></textarea></label>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveMeal()">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveMeal(){
    const name = $('mlName').value.trim();
    if(!name) return toast('اكتب اسم الوجبة.');
    const m = {
      id: uid(), date: dayKey(), name,
      type: $('mlType').value,
      kcal: Number($('mlKcal').value) || 0,
      protein: Number($('mlProtein').value) || 0,
      notes: $('mlNotes').value.trim(),
      createdAt: new Date().toISOString()
    };
    persistUser({ meals: [...S.user.meals, m] });
    closeDialog(); renderDiet(); renderDashboard();
    toast('تم الحفظ.');
  }
  function removeMeal(id){
    persistUser({ meals: S.user.meals.filter(x => x.id !== id) });
    renderDiet();
    toast('تم الحذف.');
  }
  function addWater(){
    const today = dayKey();
    const goal = S.user.profile.waterGoal || 8;
    const cur = S.user.waterLog[today] || 0;
    if(cur >= goal) return toast('وصلت هدفك اليومي 💧');
    const log = { ...S.user.waterLog, [today]: cur + 1 };
    persistUser({ waterLog: log });
    renderDiet();
  }
  function setWater(n){
    const today = dayKey();
    const log = { ...S.user.waterLog, [today]: n };
    persistUser({ waterLog: log });
    renderDiet();
  }
  function resetWater(){
    const today = dayKey();
    const log = { ...S.user.waterLog, [today]: 0 };
    persistUser({ waterLog: log });
    renderDiet();
    toast('تم تصفير الماء.');
  }

  // ── Health ──
  const plans = {
    balanced: [['الصباح','ماء + بداية هادئة + ترتيب الأولويات'],['العمل','فواصل قصيرة للحركة'],['بعد العمل','وجبة متنوعة + نشاط خفيف'],['المساء','تهدئة ونوم منتظم']],
    training: [['الأسبوع','3 جلسات نشاط مناسب'],['يوميًا','مشي أو حركة خفيفة'],['الاستشفاء','إحماء وتهدئة'],['المساء','نوم منتظم']],
    focus:    [['البداية','مهمة رئيسية واحدة'],['التركيز','25 دقيقة + 5 فاصل'],['منتصف اليوم','ابتعاد عن الشاشة'],['الإغلاق','مراجعة ما تم']],
    diet:     [['الفطار','بروتين + كارب معقد'],['الغداء','نصف الطبق خضار'],['العشاء','خفيف قبل النوم'],['الماء','8 أكواب يوميًا']]
  };
  function renderHealth(){
    if(!S.user) return;
    const p = S.user.profile;
    $('healthAge').textContent    = p.age || '—';
    $('healthWeight').textContent = p.weight || '—';
    $('healthHeight').textContent = p.height || '—';
    const done = S.user.habits.filter(x => x.done).length;
    const pct = S.user.habits.length ? Math.round(done / S.user.habits.length * 100) : 0;
    $('habitPct').textContent = pct + '%';
    $('habits').innerHTML = S.user.habits.map(h => `
      <div class="habit ${h.done ? 'done' : ''}">
        <button onclick="Yourself.toggleHabit('${h.id}')">${h.done ? '✓' : '○'}</button>
        <div><b>${esc(h.title)}</b><span>${esc(h.meta)}</span></div>
        <small>${h.done ? 'تم' : 'اليوم'}</small>
      </div>`).join('');
    $('healthPlan').innerHTML = (plans[S.user.healthPlan] || plans.balanced)
      .map(x => `<div class="plan-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
  }
  function toggleHabit(id){
    persistUser({ habits: S.user.habits.map(x => x.id === id ? { ...x, done: !x.done } : x) });
    renderHealth();
  }
  function changePlan(){
    const order = ['balanced','training','focus','diet'];
    const next = order[(order.indexOf(S.user.healthPlan) + 1) % order.length];
    persistUser({ healthPlan: next });
    renderHealth();
    toast('تم تغيير الخطة.');
  }
  function openHealthDialog(){
    const p = S.user.profile;
    openDialog('البيانات الصحية', 'بيانات للمتابعة الشخصية.', `
      <div class="two">
        <label>العمر<input id="hAge" type="number" value="${p.age || ''}"></label>
        <label>الوزن<input id="hWeight" type="number" step="0.1" value="${p.weight || ''}"></label>
        <label>الطول<input id="hHeight" type="number" step="0.1" value="${p.height || ''}"></label>
        <label>النشاط<select id="hActivity">
          <option value="light"    ${p.activity==='light'?'selected':''}>خفيف</option>
          <option value="moderate" ${p.activity==='moderate'?'selected':''}>متوسط</option>
          <option value="high"     ${p.activity==='high'?'selected':''}>مرتفع</option>
        </select></label>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick="Yourself.saveHealth()">حفظ</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }
  function saveHealth(){
    persistUser({ profile: { ...S.user.profile,
      age: $('hAge').value, weight: $('hWeight').value,
      height: $('hHeight').value, activity: $('hActivity').value
    }});
    closeDialog(); renderHealth();
    toast('تم الحفظ.');
  }

  // ── Settings ──
  function renderSettings(){
    if(!S.user) return;
    const p = S.user.profile;
    $('setName').value  = S.user.name;
    $('setEmail').value = S.user.email;
    $('setJob').value   = p.job || '';
    $('setGoal').value  = p.goal || 'تنظيم الوقت';
    $('setStart').value = p.workStart || '';
    $('setEnd').value   = p.workEnd || '';
    $('setCalGoal').value   = p.calorieGoal || 2000;
    $('setWaterGoal').value = p.waterGoal || 8;
  }
  function saveSettings(e){
    e.preventDefault();
    persistUser({
      name: $('setName').value.trim() || S.user.name,
      profile: { ...S.user.profile,
        job: $('setJob').value.trim(),
        goal: $('setGoal').value,
        workStart: $('setStart').value,
        workEnd: $('setEnd').value,
        calorieGoal: Number($('setCalGoal').value) || 2000,
        waterGoal: Number($('setWaterGoal').value) || 8
      }
    });
    renderAll();
    toast('تم الحفظ.');
  }
  function deleteAccount(){
    if(!S.user) return;
    saveUsers(loadUsers().filter(x => x.id !== S.user.id));
    clearSession();
    S.user = null;
    showLogin();
    toast('تم حذف الحساب.');
  }
  function openDeleteConfirm(){
    openDialog('حذف الحساب', 'سيتم حذف بياناتك من هذا المتصفح نهائيًا.', `
      <div class="dialog-actions">
        <button class="btn btn-danger" onclick="Yourself.deleteAccount()">حذف نهائي</button>
        <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }

  // ── Global search ──
  function globalSearch(q){
    q = q.trim().toLowerCase();
    if(!q) return;
    const results = [];
    S.user.planner.forEach(t => { if(t.title.toLowerCase().includes(q)) results.push({ type:'مهمة', text:t.title, page:'planner' }); });
    S.user.notes.forEach(n => { if((n.title + ' ' + n.content).toLowerCase().includes(q)) results.push({ type:'ملاحظة', text:n.title, page:'notes' }); });
    S.user.workouts.forEach(w => { if(w.name.toLowerCase().includes(q)) results.push({ type:'تمرين', text:w.name, page:'exercise' }); });
    if(!results.length){ openDialog('لا نتائج', `لم نعثر على شيء يطابق "${esc(q)}"`, ''); return; }
    openDialog('نتائج البحث', `${results.length} نتيجة`, `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${results.slice(0,20).map(r => `
          <button onclick="Yourself.go('${r.page}');Yourself.closeDialog()" style="text-align:right;padding:12px;background:var(--surface-2);border-radius:12px;border:1px solid var(--line);cursor:pointer;color:var(--ink)">
            <small style="color:var(--ink-3);font-size:10.5px">${r.type}</small>
            <div style="font-weight:600;font-size:13px;margin-top:3px">${esc(r.text)}</div>
          </button>`).join('')}
      </div>`);
  }

  // ═══════════════════════════════════════════════════════
  // BINDINGS
  // ═══════════════════════════════════════════════════════
  function bindAuth(){
    // password toggles
    $$('[data-pass]').forEach(b => b.addEventListener('click', () => {
      const el = $(b.dataset.pass);
      el.type = el.type === 'password' ? 'text' : 'password';
      b.textContent = el.type === 'password' ? 'إظهار' : 'إخفاء';
    }));

    // login
    $('loginForm').addEventListener('submit', login);
    $('forgotBtn').addEventListener('click', () =>
      openDialog('استعادة كلمة المرور', 'تواصل مع مطوّر النظام لاستعادة الوصول.', ''));
    $('goSignupBtn').addEventListener('click', showAccount);

    // account
    $('accountForm').addEventListener('submit', accountSubmit);
    $('accPass').addEventListener('input', strengthAccount);
    $('backFromAccount').addEventListener('click', showLogin);

    // register wizard
    $('registerForm').addEventListener('submit', registerSubmit);
    $('wNext').addEventListener('click', wizardNext);
    $('wPrev').addEventListener('click', wizardPrev);
    $('backFromRegister').addEventListener('click', showAccount);
    $('registerForm').addEventListener('keydown', e => {
      if(e.key === 'Enter' && !e.target.matches('textarea')){
        e.preventDefault();
        if(S.wizard < 3) wizardNext();
        else registerSubmit(e);
      }
    });

    // pending
    $('backToLoginFromPending').addEventListener('click', showLogin);

    // developer
    $('devLogoutBtn').addEventListener('click', () => {
      clearDevSession();
      showLogin();
    });
    $('devNotifBtn').addEventListener('click', () => {
      S.devFilter = 'pending';
      $$('.dfilter').forEach(x => x.classList.toggle('active', x.dataset.status === 'pending'));
      renderDevList();
      // scroll to list
      $('devList').scrollIntoView({behavior:'smooth', block:'start'});
    });
    $$('.dfilter').forEach(b => b.addEventListener('click', () => {
      S.devFilter = b.dataset.status;
      $$('.dfilter').forEach(x => x.classList.toggle('active', x === b));
      renderDevList();
    }));

    // secret: 5 clicks on brand from login -> open dev login
    const brandSecret = $('brandSecret');
    if(brandSecret){
      brandSecret.addEventListener('click', () => {
        S.secret.count++;
        clearTimeout(S.secret.timer);
        S.secret.timer = setTimeout(() => S.secret.count = 0, 1600);
        if(S.secret.count >= 5){
          S.secret.count = 0;
          openDialog('دخول المطوّر', 'هذا الدخول محمي بكلمة مرور.', `
            <label>البريد<input id="devEmail" type="email"></label>
            <label>كلمة المرور<input id="devPassword" type="password"></label>
            <div class="dialog-actions">
              <button class="btn btn-primary" onclick="Yourself.devLogin()">دخول</button>
              <button class="btn btn-ghost" onclick="Yourself.closeDialog()">إلغاء</button>
            </div>`);
        }
      });
    }
  }
  function devLogin(){
    const e = emailOf($('devEmail').value);
    const p = $('devPassword').value;
    if(!DEVS.some(x => x.email === e && x.pass === p)) return toast('بيانات غير صحيحة.');
    setDevSession(e);
    closeDialog();
    showDev();
  }

  function bindApp(){
    $$('.sb-item, .bn-item').forEach(b => {
      if(b.dataset.page) b.addEventListener('click', () => go(b.dataset.page));
    });
    $$('[data-page]').forEach(b => {
      if(!b.classList.contains('sb-item') && !b.classList.contains('bn-item')){
        b.addEventListener('click', () => go(b.dataset.page));
      }
    });
    $('menuBtn').addEventListener('click', toggleSidebar);
    document.addEventListener('click', e => {
      if(window.innerWidth <= 900){
        const sb = $('sidebar');
        if(sb.classList.contains('open') && !sb.contains(e.target) && !$('menuBtn').contains(e.target)){
          sb.classList.remove('open');
        }
      }
    });
    $('logoutBtn').addEventListener('click', logout);
    $('profileBtn').addEventListener('click', () => go('settings'));
    $('themeBtn').addEventListener('click', cycleTheme);
    $('globalSearch').addEventListener('keydown', e => { if(e.key === 'Enter') globalSearch(e.target.value); });
    document.addEventListener('keydown', e => {
      if((e.ctrlKey || e.metaKey) && e.key === 'k'){ e.preventDefault(); $('globalSearch').focus(); }
    });
    $('manualStart').addEventListener('click', manualStart);
    $('manualStop').addEventListener('click', manualStop);
    $('editWorkBtn').addEventListener('click', openWorkDialog);
    $('addMoneyBtn').addEventListener('click', openMoneyDialog);
    $$('.filter[data-money]').forEach(b => b.addEventListener('click', () => {
      S.moneyFilter = b.dataset.money;
      $$('.filter[data-money]').forEach(x => x.classList.toggle('active', x === b));
      renderWork();
    }));
    $('addTaskBtn').addEventListener('click', openTaskDialog);
    $('prevDayBtn').addEventListener('click', () => { S.plannerDate.setDate(S.plannerDate.getDate() - 1); renderPlanner(); });
    $('nextDayBtn').addEventListener('click', () => { S.plannerDate.setDate(S.plannerDate.getDate() + 1); renderPlanner(); });
    $('todayBtn').addEventListener('click', () => { S.plannerDate = new Date(); renderPlanner(); });
    $('focusToggle').addEventListener('click', toggleFocus);
    $('focusReset').addEventListener('click', resetFocus);
    $('newNoteBtn').addEventListener('click', () => openNoteDialog());
    $('noteSearch').addEventListener('input', e => { S.noteSearch = e.target.value.trim().toLowerCase(); renderNotes(); });
    $$('.filter[data-note]').forEach(b => b.addEventListener('click', () => {
      S.noteFilter = b.dataset.note;
      $$('.filter[data-note]').forEach(x => x.classList.toggle('active', x === b));
      renderNotes();
    }));
    $('addWorkoutBtn').addEventListener('click', openWorkoutDialog);
    $$('.filter[data-ex]').forEach(b => b.addEventListener('click', () => {
      S.exFilter = b.dataset.ex;
      $$('.filter[data-ex]').forEach(x => x.classList.toggle('active', x === b));
      renderExercise();
    }));
    $('addMealBtn').addEventListener('click', openMealDialog);
    $('addWaterBtn').addEventListener('click', addWater);
    $('resetWaterBtn').addEventListener('click', resetWater);
    $('editHealthBtn').addEventListener('click', openHealthDialog);
    $('changePlanBtn').addEventListener('click', changePlan);
    $('settingsForm').addEventListener('submit', saveSettings);
    $('deleteLocalBtn').addEventListener('click', openDeleteConfirm);
    $$('.theme-tile').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  }
  function cycleTheme(){
    const order = ['teal','mint','dark','ocean'];
    const cur = getPref().theme || 'teal';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setTheme(next);
    toast('الثيم: ' + next);
  }

  // ═══════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════
  function boot(){
    setTheme(getPref().theme || 'teal');
    bindAuth();
    bindApp();
    startDevTick();

    // Check dev session first
    const ds = getDevSession();
    if(ds?.email){
      return showDev();
    }

    // Check user session
    const s = getSession();
    if(s?.email){
      const u = loadUsers().find(x => emailOf(x.email) === emailOf(s.email));
      if(u && u.status === 'approved'){
        return enterApp(u);
      }
      // session exists but user not approved → clear
      clearSession();
    }

    showLogin();
  }

  // ═══════════════════════════════════════════════════════
  // EXPOSE
  // ═══════════════════════════════════════════════════════
  window.Yourself = {
    go, closeDialog, devLogin,
    saveMoney, removeMoney, saveWork,
    saveTask,
    saveNote, editNote, pinNote, removeNote,
    saveWorkout, removeWorkout,
    saveMeal, removeMeal, addWater, setWater, resetWater,
    toggleHabit, saveHealth, changePlan,
    saveSettings, deleteAccount, openDeleteConfirm,
    approveUser, rejectUser, inspectUser, deleteUser
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
