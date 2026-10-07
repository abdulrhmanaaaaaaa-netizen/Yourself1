(() => {
  'use strict';

  // ============ CONSTANTS ============
  const USERS_KEY   = 'yourself_v5_users';
  const SESSION_KEY = 'yourself_v5_session';
  const PREF_KEY    = 'yourself_v5_pref';

  const DEVS = [
    { email:'hoang@gmail.com',  pass:'Hoang123' },
    { email:'haider@gmail.com', pass:'asdfghjkl123' }
  ];

  const $  = id => document.getElementById(id);
  const $$ = s  => [...document.querySelectorAll(s)];

  // ============ HELPERS ============
  const uid     = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const emailOf = x  => String(x||'').trim().toLowerCase();
  const dayKey  = (d=new Date()) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtMoney = n => (Math.round(Number(n)||0)).toLocaleString('en-US') + ' EGP';
  const fmtNum   = n => (Math.round(Number(n)||0)).toLocaleString('en-US');
  const dateAr   = d => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d));
  const shortAr  = d => new Intl.DateTimeFormat('ar-EG',{day:'2-digit',month:'2-digit'}).format(new Date(d));
  const timeMins = t => { const [h,m]=String(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); };
  const hoursBetween = (a,b) => { let x=timeMins(a), y=timeMins(b); if(y<x) y+=1440; return (y-x)/60; };

  // ============ STORAGE ============
  const loadUsers   = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)||'[]'); } catch { return []; } };
  const saveUsers   = u  => localStorage.setItem(USERS_KEY, JSON.stringify(u));
  const getSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } };
  const setSession  = e  => localStorage.setItem(SESSION_KEY, JSON.stringify({ email:e, at:Date.now() }));
  const clearSession= () => localStorage.removeItem(SESSION_KEY);
  const getPref     = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch { return {}; } };
  const setPref     = p  => localStorage.setItem(PREF_KEY, JSON.stringify(p));

  // ============ STATE ============
  const S = {
    user: null,
    page: 'dashboard',
    moneyFilter: 'all',
    noteFilter: 'all',
    noteSearch: '',
    exFilter: 'all',
    plannerDate: new Date(),
    focus: { seconds:1500, running:false, interval:null },
    tickInterval: null,
    secretClicks: 0,
    secretTimer: null
  };

  // ============ DEFAULTS ============
  const defaultProfile = () => ({
    job:'', salaryType:'monthly', salary:0, workDays:5,
    workStart:'08:30', workEnd:'17:00', offDays:'الجمعة، السبت',
    wake:'07:00', sleep:'23:00', goWork:'08:00', backWork:'17:30',
    goal:'تنظيم الوقت', activity:'moderate',
    age:'', weight:'', height:'',
    calorieGoal: 2000, waterGoal: 8
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

  function defaultUser(o={}){
    return {
      id: uid(),
      name:'', email:'', password:'',
      createdAt: new Date().toISOString(),
      profile: defaultProfile(),
      finance: [], notes: [], planner: [],
      workLogs: [], workControl: null,
      habits: defaultHabits(),
      healthPlan: 'balanced',
      workouts: [], meals: [], waterLog: {},
      ...o
    };
  }

  function normalizeUser(u){
    if(!u) return null;
    const base = defaultUser();
    const today = dayKey();
    let habits = Array.isArray(u.habits) && u.habits.length ? u.habits : base.habits;
    if(habits[0] && habits[0].date !== today){
      habits = habits.map(h => ({ ...h, done:false, date:today }));
    }
    return {
      ...base, ...u,
      profile: { ...base.profile, ...(u.profile||{}) },
      finance:   Array.isArray(u.finance)   ? u.finance   : [],
      notes:     Array.isArray(u.notes)     ? u.notes     : [],
      planner:   Array.isArray(u.planner)   ? u.planner   : [],
      workLogs:  Array.isArray(u.workLogs)  ? u.workLogs  : [],
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

  // ============ WORK LOGIC ============
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
  function todaySnapshot(){
    if(!S.user) return { state:'—', meta:'—', elapsedMs:0, mode:'off' };
    const key = dayKey();
    const now = new Date();
    const c = S.user.workControl;
    if(c && c.date === key && c.startedAt){
      const start = new Date(c.startedAt);
      const schedEnd = workWindow(now).end;
      const stop = c.stoppedAt ? new Date(c.stoppedAt) : now;
      const end = stop < schedEnd ? stop : schedEnd;
      return {
        state: c.stoppedAt ? 'انتهت الجلسة'
             : (now >= schedEnd ? 'انتهى وقت العمل' : 'عمل يدوي جارٍ'),
        meta: c.stoppedAt ? 'تم حفظ الجلسة اليدوية' : 'الجلسة محفوظة',
        elapsedMs: Math.max(0, end - start),
        mode: 'manual'
      };
    }
    if(!isWorkday(now)){
      return { state:'إجازة اليوم', meta:'لا يوجد احتساب تلقائي', elapsedMs:0, mode:'off' };
    }
    const { start, end } = workWindow(now);
    if(now < start) return { state:'قبل بداية العمل', meta:`يبدأ تلقائيًا ${S.user.profile.workStart}`, elapsedMs:0, mode:'auto' };
    if(now >= end)  return { state:'انتهى وقت العمل', meta:`انتهى تلقائيًا ${S.user.profile.workEnd}`, elapsedMs: end - start, mode:'auto' };
    return { state:'يعمل تلقائيًا', meta:`يتوقف تلقائيًا ${S.user.profile.workEnd}`, elapsedMs: now - start, mode:'auto' };
  }
  function monthlyProgress(){
    if(!S.user) return 0;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth()+1, 0);
    let sched = 0, elapsed = 0;
    for(let d = new Date(first); d <= last; d.setDate(d.getDate()+1)){
      const date = new Date(d);
      if(!isWorkday(date)) continue;
      const { start, end } = workWindow(date);
      sched += end - start;
      if(dayKey(date) < dayKey(now)) elapsed += end - start;
      else if(dayKey(date) === dayKey(now)) elapsed += Math.max(0, Math.min(now, end) - start);
    }
    return sched ? Math.min(100, Math.round(elapsed / sched * 100)) : 0;
  }

  // ============ UI HELPERS ============
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
    el.className = 'form-message ' + type;
  }
  function openDialog(title, desc, body){
    const m = $('modal');
    m.classList.remove('hidden');
    m.innerHTML = `
      <div class="dialog">
        <div class="dialog-head">
          <div>
            <span class="kicker">YOURSELF</span>
            <h3>${esc(title)}</h3>
            <p>${esc(desc)}</p>
          </div>
          <button class="close" onclick="Yourself.closeDialog()">×</button>
        </div>
        <div class="dialog-body">${body}</div>
      </div>`;
  }
  function closeDialog(){
    const m = $('modal');
    m.classList.add('hidden');
    m.innerHTML = '';
  }
  function setTheme(name){
    document.documentElement.className = '';
    if(name && name !== 'mint') document.documentElement.classList.add('theme-' + name);
    const p = getPref(); p.theme = name; setPref(p);
    $$('.theme').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
  }

  // ============ AUTH ============
  function switchAuth(mode){
    $$('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.auth === mode));
    $('loginForm').classList.toggle('hidden', mode !== 'login');
    $('registerForm').classList.toggle('hidden', mode !== 'register');
  }
  function togglePass(id, btn){
    const el = $(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? 'إظهار' : 'إخفاء';
  }
  function strength(){
    const v = $('regPassword').value;
    const t = [v.length>=8, /[A-Za-zأ-ي]/.test(v), /\d/.test(v), /[^A-Za-z0-9أ-ي]/.test(v)];
    const score = t.filter(Boolean).length;
    $$('.password-strength span').forEach((x,i) => x.classList.toggle('on', i < score));
    const s = document.querySelector('.password-strength small');
    if(s) s.textContent = 'قوة كلمة المرور · ' +
      (score < 2 ? 'ضعيفة' : score === 2 ? 'متوسطة' : score === 3 ? 'جيدة' : 'قوية');
  }
  function login(e){
    e.preventDefault();
    const email = emailOf($('loginEmail').value);
    const pass  = $('loginPassword').value;
    if(!email || !pass) return showMsg('loginMessage', 'أدخل البريد وكلمة المرور.');
    if(DEVS.some(d => d.email === email && d.pass === pass)) return openDevCenter();
    const u = loadUsers().find(x => emailOf(x.email) === email && x.password === pass);
    if(!u) return showMsg('loginMessage', 'البريد أو كلمة المرور غير صحيحة.');
    setSession(u.email);
    enterApp(u);
  }
  function register(e){
    e.preventDefault();
    const pwd = $('regPassword').value;
    const data = defaultUser({
      name: $('regName').value.trim(),
      email: emailOf($('regEmail').value),
      password: pwd,
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
        activity:  $('regActivity').value,
        age:       $('regAge').value,
        weight:    $('regWeight').value,
        height:    $('regHeight').value
      },
      habits: defaultHabits()
    });
    if(!data.name) return showMsg('registerMessage', 'اكتب اسمك.');
    if(!data.email || !/\S+@\S+\.\S+/.test(data.email)) return showMsg('registerMessage', 'بريد غير صالح.');
    if(pwd.length < 8) return showMsg('registerMessage', 'كلمة المرور 8 أحرف على الأقل.');
    if(pwd !== $('regPassword2').value) return showMsg('registerMessage', 'تأكيد كلمة المرور غير مطابق.');
    if(!data.profile.job) return showMsg('registerMessage', 'اكتب الوظيفة.');
    if(data.profile.salary <= 0) return showMsg('registerMessage', 'أدخل الدخل.');
    if(loadUsers().some(x => emailOf(x.email) === data.email) || DEVS.some(x => x.email === data.email))
      return showMsg('registerMessage', 'البريد مستخدم.');

    const d = dayKey();
    data.planner = [
      { id: uid(), date:d, time:data.profile.goWork,   title:'الذهاب للعمل', category:'روتين',  done:false },
      { id: uid(), date:d, time:data.profile.workStart,title:'بداية العمل', category:'عمل',    done:false },
      { id: uid(), date:d, time:'13:00',               title:'فاصل وغداء', category:'استراحة',done:false },
      { id: uid(), date:d, time:data.profile.workEnd,  title:'إغلاق العمل', category:'عمل',    done:false }
    ];

    const list = loadUsers();
    list.push(data);
    saveUsers(list);
    setSession(data.email);
    enterApp(data);
    toast('أهلًا بك في Yourself ✦');
  }
  function enterApp(u){
    S.user = normalizeUser(u);
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderAll();
    go('dashboard');
    startTick();
  }
  function logout(){
    clearSession();
    if(S.tickInterval) clearInterval(S.tickInterval);
    S.user = null;
    location.reload();
  }
  function startTick(){
    if(S.tickInterval) clearInterval(S.tickInterval);
    S.tickInterval = setInterval(() => {
      if(!S.user) return;
      if(S.page === 'dashboard') renderDashboard();
    }, 1000);
  }

  // ============ NAV ============
  function go(page){
    if(!S.user) return;
    S.page = page;
    $$('.page').forEach(p => p.classList.toggle('active-page', p.id === 'page-' + page));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    if(page === 'dashboard') renderDashboard();
    if(page === 'work')      renderWork();
    if(page === 'planner')   renderPlanner();
    if(page === 'notes')     renderNotes();
    if(page === 'exercise')  renderExercise();
    if(page === 'diet')      renderDiet();
    if(page === 'health')    renderHealth();
    if(page === 'settings')  renderSettings();
  }

  // ============ RENDER ============
  function renderTop(){
    const name = S.user.name || 'صديقي';
    $('topName').textContent  = name;
    $('topJob').textContent   = S.user.profile.job || 'مساحتك';
    $('heroName').textContent = name.split(' ')[0];
    $('avatar').textContent   = name.trim().charAt(0).toUpperCase() || 'Y';
  }
  function renderAll(){
    renderTop();
    renderDashboard(); renderWork(); renderPlanner(); renderNotes();
    renderExercise(); renderDiet(); renderHealth(); renderSettings();
  }

  // ---- DASHBOARD ----
  function fmtDuration(ms){
    const t = Math.max(0, Math.floor(ms/1000));
    const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = t%60;
    return [h,m,s].map(x => String(x).padStart(2,'0')).join(':');
  }
  function renderDashboard(){
    if(!S.user) return;
    const p = S.user.profile;
    const now = new Date();
    $('weekday').textContent  = new Intl.DateTimeFormat('ar-EG', {weekday:'long'}).format(now);
    $('dateText').textContent = dateAr(now);
    $('todayText').textContent = `هدفك: ${p.goal} · الدوام ${p.workStart} → ${p.workEnd}`;

    const snap = todaySnapshot();
    const rate = hourlyRate();
    const h = snap.elapsedMs / 3600000;

    $('hourRate').textContent       = fmtNum(rate);
    $('todayEarned').textContent    = fmtNum(h * rate);
    $('todayHours').textContent     = h.toFixed(2) + 'h';
    $('todayHoursMeta').textContent = snap.state;
    $('todayTasks').textContent     = S.user.planner.filter(x => x.date === dayKey()).length;

    $('clockBadge').textContent = snap.state;
    $('clockState').textContent = snap.state;
    $('clockMeta').textContent  = snap.meta;
    $('timer').textContent      = fmtDuration(snap.elapsedMs);
    $('clockEarn').textContent  = fmtMoney(h * rate);
    $('sideState').textContent  = snap.mode === 'off' ? 'إجازة' : snap.state;
    $('sideMeta').textContent   = snap.meta;

    const active = S.user.workControl?.date === dayKey()
                && S.user.workControl?.startedAt
                && !S.user.workControl?.stoppedAt;
    $('manualStart').disabled = !!active || snap.mode === 'off' || snap.state === 'انتهى وقت العمل';
    $('manualStop').disabled  = !active;
    $('manualStart').textContent = active ? 'الجلسة جارية' : 'بدء يدوي';

    const items = S.user.finance || [];
    const ded = items.filter(x => x.kind === 'deduction').reduce((a,x) => a + Number(x.amount||0), 0);
    const ext = items.filter(x => x.kind === 'extra').reduce((a,x) => a + Number(x.amount||0), 0);
    $('baseMoney').textContent   = fmtNum(Number(p.salary) || 0);
    $('deductMoney').textContent = fmtNum(ded);
    $('extraMoney').textContent  = fmtNum(ext);
    $('netMoney').textContent    = fmtMoney(Math.max(0, (Number(p.salary)||0) + ext - ded));

    const today = dayKey();
    const next = S.user.planner.filter(x => x.date === today)
      .sort((a,b) => a.time.localeCompare(b.time)).slice(0,5);
    $('nextList').innerHTML = next.length ? next.map(x => `
      <div class="timeline-item">
        <time>${esc(x.time)}</time><i></i>
        <div><strong>${esc(x.title)}</strong><span>${esc(x.category || 'مهمة')}</span></div>
      </div>`).join('') : '<div class="info-note"><b>يومك مفتوح</b><span>أضف مهمة من قسم تنظيم الوقت.</span></div>';

    const notes = S.user.notes.slice().sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0,3);
    $('notePreview').innerHTML = notes.length ? notes.map(n => `
      <div class="preview-note">
        <b>${esc(n.title)}</b>
        <span>${esc((n.content || '').slice(0,120))}</span>
      </div>`).join('') : '<div class="info-note"><b>المذكرة جاهزة</b><span>اكتب أول ملاحظة.</span></div>';
  }
  function manualStart(){
    const key = dayKey();
    if(!isWorkday(new Date())) return toast('اليوم إجازة.');
    const { end } = workWindow(new Date());
    if(new Date() >= end) return toast('انتهى وقت العمل.');
    persistUser({ workControl: { date:key, startedAt:new Date().toISOString(), stoppedAt:null } });
    renderDashboard();
    toast('بدأت الجلسة.');
  }
  function manualStop(){
    if(!S.user.workControl?.startedAt) return;
    persistUser({ workControl: { ...S.user.workControl, stoppedAt: new Date().toISOString() } });
    renderDashboard();
    toast('تم حفظ الجلسة.');
  }

  // ---- WORK ----
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
      <div class="money-row">
        <div><b>${esc(x.title)}</b><small>${shortAr(new Date(x.createdAt))}</small></div>
        <span class="kind ${x.kind}">${x.kind === 'deduction' ? 'خصم' : 'إضافي'}</span>
        <button onclick="Yourself.removeMoney('${x.id}')">×</button>
        <b>${x.kind === 'deduction' ? '-' : '+'}${fmtNum(x.amount)}</b>
      </div>`).join('') : '<div class="info-note"><b>لا توجد حركات</b><span>أضف خصمًا أو إضافة.</span></div>';

    $('moneyTable').innerHTML = list.length ? list.map(x => `
      <tr>
        <td><b>${esc(x.title)}</b></td>
        <td><span class="kind ${x.kind}">${x.kind === 'deduction' ? 'خصم' : 'إضافي'}</span></td>
        <td>${x.kind === 'deduction' ? '-' : '+'}${fmtNum(x.amount)} EGP</td>
        <td>${shortAr(new Date(x.createdAt))}</td>
        <td><button class="table-action" onclick="Yourself.removeMoney('${x.id}')">حذف</button></td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">لا توجد عمليات</td></tr>';
  }
  function removeMoney(id){
    persistUser({ finance: S.user.finance.filter(x => x.id !== id) });
    renderWork(); renderDashboard();
    toast('تم الحذف.');
  }
  function openMoneyDialog(){
    openDialog('حركة مالية', 'أضف خصمًا أو مبلغًا إضافيًا.', `
      <div class="modal-grid">
        <label>النوع<select id="mType"><option value="deduction">خصم</option><option value="extra">إضافي</option></select></label>
        <label>المبلغ<input id="mAmount" type="number" min="0" step="0.01" placeholder="250"></label>
      </div>
      <label>الوصف<input id="mTitle" type="text" placeholder="مثال: مواصلات"></label>
      <div class="dialog-actions">
        <button class="primary-btn" onclick="Yourself.saveMoney()">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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
      <div class="modal-grid">
        <label>الدخل<input id="wSalary" type="number" value="${p.salary}"></label>
        <label>النوع<select id="wType">
          <option value="monthly" ${p.salaryType==='monthly'?'selected':''}>شهري</option>
          <option value="hourly" ${p.salaryType==='hourly'?'selected':''}>بالساعة</option>
        </select></label>
        <label>أيام/أسبوع<input id="wDays" type="number" min="1" max="7" value="${p.workDays}"></label>
        <label>الإجازة<input id="wOff" type="text" value="${esc(p.offDays)}"></label>
        <label>البداية<input id="wStart" type="time" value="${p.workStart}"></label>
        <label>النهاية<input id="wEnd" type="time" value="${p.workEnd}"></label>
      </div>
      <div class="dialog-actions">
        <button class="primary-btn" onclick="Yourself.saveWork()">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- PLANNER ----
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
          <div class="slot ${found.length ? '' : 'slot-empty'}">
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
    ].map(x => `<div class="routine-row"><span>${x[0]}</span><b>${esc(x[1] || '—')}</b></div>`).join('');

    renderFocus();
  }
  function openTaskDialog(){
    openDialog('مهمة جديدة', 'أضف مهمة لأي يوم.', `
      <div class="modal-grid">
        <label>التاريخ<input id="tDate" type="date" value="${dayKey(S.plannerDate)}"></label>
        <label>الوقت<input id="tTime" type="time" value="09:00"></label>
      </div>
      <label>العنوان<input id="tTitle" type="text" placeholder="مثال: إنهاء المهمة"></label>
      <label>التصنيف<select id="tCategory">
        <option>عمل</option><option>تعلم</option><option>استراحة</option>
        <option>صحة</option><option>شخصي</option><option>روتين</option>
      </select></label>
      <div class="dialog-actions">
        <button class="primary-btn" onclick="Yourself.saveTask()">إضافة</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- NOTES ----
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
          <div style="display:flex;gap:6px">
            <button onclick="Yourself.editNote('${n.id}')">✎</button>
            <button onclick="Yourself.removeNote('${n.id}')">×</button>
          </div>
        </div>
      </article>`).join('') : '<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--muted)"><b>لا توجد ملاحظات</b></div>';
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
        <button class="primary-btn" onclick="Yourself.saveNote('${n.id||''}')">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- EXERCISE / GYM ----
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
        <div class="workout-head">
          <b>${esc(w.name)}</b>
          <span>${shortAr(new Date(w.createdAt))}</span>
        </div>
        <div class="workout-meta">
          <div><span>مجموعات</span><b>${w.sets || 0}</b></div>
          <div><span>تكرار</span><b>${w.reps || 0}</b></div>
          <div><span>وزن</span><b>${w.weight || 0}kg</b></div>
          <div><span>دقائق</span><b>${w.duration || 0}</b></div>
        </div>
        <button class="workout-del" onclick="Yourself.removeWorkout('${w.id}')">حذف</button>
      </div>`).join('') : '<div class="info-note"><b>لا توجد تمارين</b><span>أضف أول جلسة.</span></div>';

    // week chart
    const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const counts = [0,0,0,0,0,0,0];
    weekWk.forEach(w => { const d = new Date(w.createdAt).getDay(); counts[d]++; });
    const max = Math.max(1, ...counts);
    $('weekChart').innerHTML = counts.map((c,i) => {
      const h = Math.max(4, (c/max) * 160);
      return `<div class="week-bar" style="height:${h}px"><b>${c || ''}</b><span>${days[i].slice(0,3)}</span></div>`;
    }).join('');
  }
  function openWorkoutDialog(){
    openDialog('تمرين جديد', 'سجّل جلستك.', `
      <label>اسم التمرين<input id="exName" type="text" placeholder="مثال: بنش برس"></label>
      <div class="modal-grid">
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
        <button class="primary-btn" onclick="Yourself.saveWorkout()">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- DIET ----
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
          ${m.notes ? `<p>${esc(m.notes)}</p>` : ''}
          <button class="workout-del" onclick="Yourself.removeMeal('${m.id}')">حذف</button>
        </div>
        <span class="meal-kcal">${m.kcal || 0} kcal</span>
      </div>`).join('') : '<div class="info-note"><b>لا وجبات اليوم</b><span>أضف وجبتك الأولى.</span></div>';

    let wg = '';
    for(let i = 0; i < waterGoal; i++){
      wg += `<div class="water-cup ${i < water ? 'on' : ''}" onclick="Yourself.setWater(${i+1})">💧</div>`;
    }
    $('waterGrid').innerHTML = wg;
  }
  function openMealDialog(){
    openDialog('وجبة جديدة', 'سجّل وجبتك.', `
      <label>الاسم<input id="mlName" type="text" placeholder="مثال: صدر دجاج وأرز"></label>
      <div class="modal-grid">
        <label>النوع<select id="mlType">
          <option>فطار</option><option>غداء</option><option>عشاء</option><option>سناك</option>
        </select></label>
        <label>السعرات<input id="mlKcal" type="number" min="0" placeholder="450"></label>
        <label>البروتين (g)<input id="mlProtein" type="number" min="0" placeholder="30"></label>
      </div>
      <label>ملاحظات<textarea id="mlNotes" placeholder="اختياري"></textarea></label>
      <div class="dialog-actions">
        <button class="primary-btn" onclick="Yourself.saveMeal()">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- HEALTH ----
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
      <div class="modal-grid">
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
        <button class="primary-btn" onclick="Yourself.saveHealth()">حفظ</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
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

  // ---- SETTINGS ----
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
    location.reload();
  }
  function openDeleteConfirm(){
    openDialog('حذف الحساب', 'سيتم حذف بياناتك من هذا المتصفح نهائيًا.', `
      <div class="dialog-actions">
        <button class="danger-btn" onclick="Yourself.deleteAccount()">حذف نهائي</button>
        <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
      </div>`);
  }

  // ---- SEARCH / DEV ----
  function openSearch(){
    openDialog('بحث سريع', 'انتقل مباشرة للقسم.', `
      <div class="modal-grid">
        <button class="ghost-btn" onclick="Yourself.go('dashboard');Yourself.closeDialog()">الرئيسية</button>
        <button class="ghost-btn" onclick="Yourself.go('work');Yourself.closeDialog()">العمل والدخل</button>
        <button class="ghost-btn" onclick="Yourself.go('planner');Yourself.closeDialog()">تنظيم الوقت</button>
        <button class="ghost-btn" onclick="Yourself.go('notes');Yourself.closeDialog()">المذكرة</button>
        <button class="ghost-btn" onclick="Yourself.go('exercise');Yourself.closeDialog()">التمارين والجيم</button>
        <button class="ghost-btn" onclick="Yourself.go('diet');Yourself.closeDialog()">الرجيم والغذاء</button>
        <button class="ghost-btn" onclick="Yourself.go('health');Yourself.closeDialog()">الصحة والعادات</button>
        <button class="ghost-btn" onclick="Yourself.go('settings');Yourself.closeDialog()">الإعدادات</button>
      </div>`);
  }
  function bindSecret(){
    const el = $('brandSecret');
    if(!el) return;
    el.addEventListener('click', () => {
      S.secretClicks++;
      clearTimeout(S.secretTimer);
      S.secretTimer = setTimeout(() => S.secretClicks = 0, 1600);
      if(S.secretClicks >= 5){
        S.secretClicks = 0;
        openDialog('مركز المطوّر', 'الدخول مخفي عن المستخدمين.', `
          <label>البريد<input id="devEmail" type="email"></label>
          <label>كلمة المرور<input id="devPassword" type="password"></label>
          <div class="dialog-actions">
            <button class="primary-btn" onclick="Yourself.devAuth()">دخول</button>
            <button class="ghost-btn" onclick="Yourself.closeDialog()">إلغاء</button>
          </div>`);
      }
    });
  }
  function devAuth(){
    const e = emailOf($('devEmail').value), p = $('devPassword').value;
    if(!DEVS.some(x => x.email === e && x.pass === p)) return toast('بيانات غير صحيحة.');
    openDevCenter();
  }
  function openDevCenter(){
    closeDialog();
    const list = loadUsers();
    const ops = list.reduce((a,u) => a + (u.finance?.length || 0), 0);
    const notes = list.reduce((a,u) => a + (u.notes?.length || 0), 0);
    const wks = list.reduce((a,u) => a + (u.workouts?.length || 0), 0);
    openDialog('مركز المطوّر', 'إدارة الحسابات المحلية.', `
      <div class="dev-summary">
        <div class="dev-stat"><span>حسابات</span><b>${list.length}</b></div>
        <div class="dev-stat"><span>مالية</span><b>${ops}</b></div>
        <div class="dev-stat"><span>ملاحظات</span><b>${notes}</b></div>
        <div class="dev-stat"><span>تمارين</span><b>${wks}</b></div>
      </div>
      <div class="dev-users">
        ${list.length ? list.map(u => `
          <div class="dev-user">
            <strong>${esc(u.name)}</strong>
            <span>${esc(u.email)}</span>
            <span>${esc(u.profile?.job || '—')} · ${fmtMoney(u.profile?.salary || 0)}</span>
            <div class="dev-actions">
              <button onclick="Yourself.inspectUser('${u.id}')">عرض</button>
              <button onclick="Yourself.deleteUser('${u.id}')">حذف</button>
            </div>
          </div>`).join('') : '<div class="info-note">لا توجد حسابات.</div>'}
      </div>`);
  }
  function inspectUser(id){
    const u = loadUsers().find(x => x.id === id);
    if(!u) return;
    openDialog('بيانات المستخدم', '', `
      <div class="info-note">
        <b>${esc(u.name)}</b>
        <span>
          البريد: ${esc(u.email)}<br>
          الوظيفة: ${esc(u.profile?.job || '—')}<br>
          الدخل: ${fmtMoney(u.profile?.salary || 0)}<br>
          العمل: ${esc(u.profile?.workStart || '—')} → ${esc(u.profile?.workEnd || '—')}<br>
          العمر: ${esc(u.profile?.age || '—')} · الوزن: ${esc(u.profile?.weight || '—')} · الطول: ${esc(u.profile?.height || '—')}
        </span>
      </div>`);
  }
  function deleteUser(id){
    saveUsers(loadUsers().filter(x => x.id !== id));
    openDevCenter();
    toast('تم الحذف.');
  }

  // ============ BINDINGS ============
  function bindAuth(){
    $$('[data-auth]').forEach(b => b.addEventListener('click', () => switchAuth(b.dataset.auth)));
    $$('[data-pass]').forEach(b => b.addEventListener('click', () => togglePass(b.dataset.pass, b)));
    $('regPassword').addEventListener('input', strength);
    $('loginForm').addEventListener('submit', login);
    $('registerForm').addEventListener('submit', register);
    $('showDemoBtn').addEventListener('click', () =>
      openDialog('Yourself', 'أنشئ حسابًا جديدًا وستظهر لك كل الخدمات.',
        '<div class="info-note"><b>ابدأ بإنشاء حساب</b><span>ستحصل على لوحة كاملة بكل الخدمات.</span></div>'));
  }

  function bindApp(){
    $$('.nav-item,[data-page]').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
    $('logoutBtn').addEventListener('click', logout);
    $('profileBtn').addEventListener('click', () => go('settings'));
    $('searchBtn').addEventListener('click', openSearch);

    // dashboard
    $('manualStart').addEventListener('click', manualStart);
    $('manualStop').addEventListener('click', manualStop);

    // work
    $('editWorkBtn').addEventListener('click', openWorkDialog);
    $('addMoneyBtn').addEventListener('click', openMoneyDialog);
    $$('.filter[data-money]').forEach(b => b.addEventListener('click', () => {
      S.moneyFilter = b.dataset.money;
      $$('.filter[data-money]').forEach(x => x.classList.toggle('active', x === b));
      renderWork();
    }));

    // planner
    $('addTaskBtn').addEventListener('click', openTaskDialog);
    $('prevDayBtn').addEventListener('click', () => { S.plannerDate.setDate(S.plannerDate.getDate() - 1); renderPlanner(); });
    $('nextDayBtn').addEventListener('click', () => { S.plannerDate.setDate(S.plannerDate.getDate() + 1); renderPlanner(); });
    $('todayBtn').addEventListener('click', () => { S.plannerDate = new Date(); renderPlanner(); });
    $('focusToggle').addEventListener('click', toggleFocus);
    $('focusReset').addEventListener('click', resetFocus);

    // notes
    $('newNoteBtn').addEventListener('click', () => openNoteDialog());
    $('noteSearch').addEventListener('input', e => { S.noteSearch = e.target.value.trim().toLowerCase(); renderNotes(); });
    $$('.filter[data-note]').forEach(b => b.addEventListener('click', () => {
      S.noteFilter = b.dataset.note;
      $$('.filter[data-note]').forEach(x => x.classList.toggle('active', x === b));
      renderNotes();
    }));

    // exercise
    $('addWorkoutBtn').addEventListener('click', openWorkoutDialog);
    $$('.filter[data-ex]').forEach(b => b.addEventListener('click', () => {
      S.exFilter = b.dataset.ex;
      $$('.filter[data-ex]').forEach(x => x.classList.toggle('active', x === b));
      renderExercise();
    }));

    // diet
    $('addMealBtn').addEventListener('click', openMealDialog);
    $('addWaterBtn').addEventListener('click', addWater);
    $('resetWaterBtn').addEventListener('click', resetWater);

    // health
    $('editHealthBtn').addEventListener('click', openHealthDialog);
    $('changePlanBtn').addEventListener('click', changePlan);

    // settings
    $('settingsForm').addEventListener('submit', saveSettings);
    $('deleteLocalBtn').addEventListener('click', openDeleteConfirm);
    $$('.theme').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  }

  // ============ BOOT ============
  function boot(){
    setTheme(getPref().theme || 'mint');
    bindAuth();
    bindApp();
    bindSecret();
    const s = getSession();
    if(s?.email){
      const u = loadUsers().find(x => emailOf(x.email) === emailOf(s.email));
      if(u) enterApp(u);
    }
  }

  // ============ EXPOSE ============
  window.Yourself = {
    go, closeDialog,
    saveMoney, removeMoney, saveWork,
    saveTask,
    saveNote, editNote, pinNote, removeNote,
    saveWorkout, removeWorkout,
    saveMeal, removeMeal, addWater, setWater, resetWater,
    toggleHabit, saveHealth, changePlan,
    saveSettings, deleteAccount, openDeleteConfirm,
    devAuth, inspectUser, deleteUser
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
