(() => {
  'use strict';

  const STORAGE_KEY = 'yourself_v1_users';
  const SESSION_KEY = 'yourself_v1_session';
  const PREF_KEY = 'yourself_v1_pref';
  const DEV_USERS = [
    { email: 'Hoang@gmail.com', password: 'Hoang123', name: 'Hoang', role: 'developer' },
    { email: 'Haider@gmail.com', password: 'asdfghjkl123', name: 'Haider', role: 'developer' }
  ];

  const state = {
    user: null,
    page: 'dashboard',
    authMode: 'login',
    wizardStep: 1,
    selectedPlan: 'balanced',
    plannerDate: new Date(),
    moneyFilter: 'all',
    noteFilter: 'all',
    noteSearch: '',
    workTimer: { running: false, startedAt: null, elapsed: 0 },
    focusTimer: { running: false, seconds: 25 * 60 },
    focusInterval: null,
    workInterval: null,
    devAuthenticated: false
  };

  const qs = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => [...p.querySelectorAll(s)];
  const $ = id => document.getElementById(id);

  const defaults = {
    profile: {
      name: '', job: '', salaryType: 'monthly', salary: 0, workDays: 5,
      workStart: '08:30', workEnd: '17:00', offDays: 'الجمعة، السبت',
      wake: '07:00', sleep: '23:00', goWork: '08:00', backWork: '17:30',
      goal: 'تنظيم الوقت', activity: 'moderate', age: '', weight: '', height: ''
    },
    finance: { items: [] },
    notes: [],
    planner: [],
    habits: [
      { id: 'water', title: 'الماء', meta: 'حاول الحفاظ على الترطيب خلال يومك', done: false },
      { id: 'movement', title: 'حركة بسيطة', meta: 'مشي أو تمدد أو نشاط يناسبك', done: false },
      { id: 'meal', title: 'وجبة متوازنة', meta: 'اختر وجبة متنوعة ومناسبة لك', done: false },
      { id: 'sleep', title: 'موعد نوم منتظم', meta: 'اجعل وقت النوم قريبًا من المعتاد', done: false }
    ],
    healthPlan: 'balanced',
    setupComplete: false,
    createdAt: new Date().toISOString()
  };

  const stateFromUser = user => {
    state.user = user;
    state.selectedPlan = user.healthPlan || 'balanced';
    state.plannerDate = new Date();
    state.page = 'dashboard';
    state.workTimer = { running: false, startedAt: null, elapsed: 0 };
  };

  const cloneDefaults = () => JSON.parse(JSON.stringify(defaults));

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  function writeUsers(users) { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }
  function readPref() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } }
  function updateCurrentUser(patch) {
    const users = readUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === state.user.email.toLowerCase());
    if (idx < 0) return;
    users[idx] = { ...users[idx], ...patch, updatedAt: new Date().toISOString() };
    state.user = users[idx];
    writeUsers(users);
  }
  function normalizeEmail(email) { return email.trim().toLowerCase(); }
  function fmtMoney(n) { return `${Math.round(Number(n) || 0).toLocaleString('en-US')} EGP`; }
  function fmtMoneyNoCurrency(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function formatDate(date) { return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }).format(date); }
  function shortDate(date) { return new Intl.DateTimeFormat('ar-EG', { day: '2-digit', month: '2-digit' }).format(date); }
  function timeDiffHours(start, end) {
    const [sh, sm] = String(start || '00:00').split(':').map(Number);
    const [eh, em] = String(end || '00:00').split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return mins / 60;
  }
  function hourlyRate(user = state.user) {
    const p = user?.profile || defaults.profile;
    const rate = Number(p.salary) || 0;
    if (p.salaryType === 'hourly') return rate;
    const hoursDay = timeDiffHours(p.workStart, p.workEnd);
    const days = Number(p.workDays) || 5;
    return hoursDay > 0 ? rate / (days * 4.33 * hoursDay) : 0;
  }
  function dailyRate(user = state.user) {
    const p = user?.profile || defaults.profile;
    return hourlyRate(user) * timeDiffHours(p.workStart, p.workEnd);
  }
  function monthWorkingProgress() {
    const now = new Date();
    const day = now.getDate();
    const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.round((day / total) * 100);
  }
  function showToast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('toastRoot').appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }
  function setFormMessage(el, message, type='error') { el.textContent = message; el.className = `form-message ${type}`; }
  function saveSession(email, remember = true) { localStorage.setItem(SESSION_KEY, JSON.stringify({ email, remember, at: Date.now() })); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function getOrCreateUser(email, name = '') {
    const users = readUsers();
    let user = users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
    if (!user) {
      user = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), email, name, ...cloneDefaults() };
      users.push(user); writeUsers(users);
    }
    return user;
  }

  function init() {
    applyTheme(readPref().theme || 'mint');
    bindAuth();
    bindApp();
    bindGlobal();
    renderWizardVisual();
    setAuthPreview();
    const session = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } })();
    if (session?.email) {
      const user = readUsers().find(u => normalizeEmail(u.email) === normalizeEmail(session.email));
      if (user) enterAsUser(user);
    }
  }

  function bindAuth() {
    qsa('[data-auth-mode]').forEach(btn => btn.addEventListener('click', () => switchAuthMode(btn.dataset.authMode)));
    qsa('[data-toggle]').forEach(btn => btn.addEventListener('click', () => togglePassword(btn.dataset.toggle)));
    $('loginForm').addEventListener('submit', loginSubmit);
    $('registerForm').addEventListener('submit', registerSubmit);
    $('demoHelpBtn').addEventListener('click', () => openModal('login-help'));
    $('showDemoBtn').addEventListener('click', () => openModal('demo'));
    $('wizardNext').addEventListener('click', nextWizard);
    $('wizardBack').addEventListener('click', backWizard);
    qsa('.starter-plan').forEach(btn => btn.addEventListener('click', () => {
      state.selectedPlan = btn.dataset.plan;
      qsa('.starter-plan').forEach(x => x.classList.toggle('selected', x === btn));
    }));
    $('routineChoices').innerHTML = ['جلسة تركيز صباحية','فاصل غداء','جلسة إنجاز رئيسية','وقت شخصي بعد العمل'].map((x,i) => `<button type="button" class="choice-card ${i < 2 ? 'selected' : ''}" data-routine="${i}"><strong>${x}</strong><small>إضافة هذا العنصر إلى يومك تلقائيًا</small></button>`).join('');
    qsa('.choice-card').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('selected')));
  }

  function switchAuthMode(mode) {
    state.authMode = mode;
    qsa('.mode-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authMode === mode));
    $('loginForm').classList.toggle('hidden', mode !== 'login');
    $('registerForm').classList.toggle('hidden', mode !== 'register');
    $('loginMessage').textContent = '';
    $('registerMessage').textContent = '';
  }
  function togglePassword(id) { const input = $(id); input.type = input.type === 'password' ? 'text' : 'password'; const btn = qs(`[data-toggle="${id}"]`); if (btn) btn.textContent = input.type === 'password' ? 'عرض' : 'إخفاء'; }

  function loginSubmit(e) {
    e.preventDefault();
    const email = normalizeEmail($('loginEmail').value);
    const password = $('loginPassword').value;
    const msg = $('loginMessage');
    const dev = DEV_USERS.find(x => normalizeEmail(x.email) === email && x.password === password);
    if (dev) {
      clearSession();
      state.devAuthenticated = true;
      openDeveloperPanel();
      return;
    }
    const user = readUsers().find(u => normalizeEmail(u.email) === email && u.password === password);
    if (!user) return setFormMessage(msg, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    saveSession(user.email, $('rememberMe').checked);
    enterAsUser(user);
  }

  function registerSubmit(e) {
    e.preventDefault();
    const name = $('registerName').value.trim();
    const email = normalizeEmail($('registerEmail').value);
    const password = $('registerPassword').value;
    const password2 = $('registerPassword2').value;
    const msg = $('registerMessage');
    if (password !== password2) return setFormMessage(msg, 'تأكيد كلمة المرور غير مطابق.');
    if (password.length < 8) return setFormMessage(msg, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    if (readUsers().some(u => normalizeEmail(u.email) === email) || DEV_USERS.some(d => normalizeEmail(d.email) === email)) return setFormMessage(msg, 'هذا البريد مسجل بالفعل.');
    const user = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), email, name, password, ...cloneDefaults() };
    writeUsers([...readUsers(), user]);
    saveSession(email, true);
    stateFromUser(user);
    openOnboarding();
  }

  function enterAsUser(user) {
    stateFromUser(user);
    if (!user.setupComplete) openOnboarding();
    else showApp();
  }
  function openOnboarding() {
    $('authView').classList.add('hidden'); $('appView').classList.add('hidden'); $('onboardingView').classList.remove('hidden'); state.wizardStep = 1; fillWizardFromUser(); renderWizard();
  }
  function showApp() {
    $('authView').classList.add('hidden'); $('onboardingView').classList.add('hidden'); $('appView').classList.remove('hidden'); renderAll();
  }
  function fillWizardFromUser() {
    const p = state.user.profile || defaults.profile;
    ['Job','SalaryType','Salary','WorkDays','WorkStart','WorkEnd','OffDays','Wake','Sleep','GoWork','BackWork','Goal','Activity','Age','Weight','Height'].forEach(key => { const el = $(`ob${key}`); if (el) el.value = p[key.charAt(0).toLowerCase()+key.slice(1)] ?? ''; });
    qsa('.starter-plan').forEach(x => x.classList.toggle('selected', x.dataset.plan === (state.user.healthPlan || 'balanced')));
  }

  function renderWizardVisual() {
    const labels = ['العمل والدخل','روتين اليوم','البيانات الصحية'];
    $('wizardStepsVisual').innerHTML = labels.map((x,i) => `<div class="wsv-item ${i===0?'active':''}"><i>${String(i+1).padStart(2,'0')}</i><span>${x}</span></div>`).join('');
  }
  function renderWizard() {
    [1,2,3].forEach(i => $(`wizardStep${i}`).classList.toggle('hidden', state.wizardStep !== i));
    $('wizardBack').classList.toggle('hidden', state.wizardStep === 1);
    $('wizardNext').innerHTML = state.wizardStep === 3 ? 'إنشاء مساحتي <b>↗</b>' : 'التالي <b>←</b>';
    $('wizardProgressBar').style.width = `${(state.wizardStep/3)*100}%`;
    qsa('.wsv-item').forEach((x,i) => x.classList.toggle('active', i===state.wizardStep-1));
  }
  function wizardPayload() {
    const p = {
      job: $('obJob').value.trim(), salaryType: $('obSalaryType').value, salary: Number($('obSalary').value)||0,
      workDays: Number($('obWorkDays').value)||5, workStart: $('obWorkStart').value, workEnd: $('obWorkEnd').value, offDays: $('obOffDays').value.trim(),
      wake: $('obWake').value, sleep: $('obSleep').value, goWork: $('obGoWork').value, backWork: $('obBackWork').value,
      goal: $('obGoal').value, activity: $('obActivity').value, age: $('obAge').value, weight: $('obWeight').value, height: $('obHeight').value
    };
    return p;
  }
  function nextWizard() {
    const p = wizardPayload();
    if (state.wizardStep === 1 && !p.job) return showToast('اكتب وظيفتك أو مجالك أولًا.', 'error');
    if (state.wizardStep === 1 && !p.salary) return showToast('أدخل الدخل حتى نحسب قيمة الساعة.', 'error');
    if (state.wizardStep < 3) { state.wizardStep++; renderWizard(); return; }
    const user = { ...state.user, profile: p, healthPlan: state.selectedPlan, setupComplete: true };
    user.planner = buildStarterPlanner(user);
    user.habits = cloneDefaults().habits;
    updateStoredUser(user);
    state.user = user;
    showApp();
    showToast('تم تجهيز مساحة Yourself الخاصة بك ✦');
  }
  function backWizard() { if (state.wizardStep > 1) { state.wizardStep--; renderWizard(); } }
  function updateStoredUser(user) { const users = readUsers(); const i = users.findIndex(u => u.id === user.id); if(i>=0){users[i]=user;writeUsers(users);} }
  function buildStarterPlanner(user) {
    const p = user.profile;
    const todayKey = new Date().toISOString().slice(0,10);
    return [
      {id:crypto.randomUUID?.()||`p-${Date.now()}-1`, date:todayKey, time:p.goWork||'08:00', title:'الاستعداد والذهاب للعمل', category:'routine'},
      {id:crypto.randomUUID?.()||`p-${Date.now()}-2`, date:todayKey, time:p.workStart||'08:30', title:'بداية العمل', category:'work'},
      {id:crypto.randomUUID?.()||`p-${Date.now()}-3`, date:todayKey, time:'13:00', title:'فاصل + غداء', category:'break'},
      {id:crypto.randomUUID?.()||`p-${Date.now()}-4`, date:todayKey, time:p.workEnd||'17:00', title:'إغلاق يوم العمل', category:'work'},
      {id:crypto.randomUUID?.()||`p-${Date.now()}-5`, date:todayKey, time:p.backWork||'17:30', title:'وقت شخصي / راحة', category:'personal'}
    ];
  }

  function bindGlobal() {
    $('mobileNavToggle').addEventListener('click', () => qs('.sidebar').classList.toggle('open'));
    $('logoutBtn').addEventListener('click', () => logout());
    $('profileTopBtn').addEventListener('click', () => goPage('settings'));
    $('globalSearchBtn').addEventListener('click', () => openModal('search'));
    $('notifyBtn').addEventListener('click', () => showToast('لا توجد إشعارات جديدة الآن.'));
    document.addEventListener('click', e => {
      const pageBtn = e.target.closest('[data-page]');
      if (pageBtn && pageBtn.dataset.page) goPage(pageBtn.dataset.page);
    });
    $('developerTrigger').addEventListener('click', () => openModal('dev-login'));
  }

  function bindApp() {
    $('workStartBtn').addEventListener('click', startWork);
    $('workStopBtn').addEventListener('click', stopWork);
    $('addMoneyBtn').addEventListener('click', () => openModal('money'));
    $('addPlanBtn').addEventListener('click', () => openModal('plan'));
    $('newNoteBtn').addEventListener('click', () => openModal('note'));
    $('noteSearch').addEventListener('input', e => { state.noteSearch = e.target.value.toLowerCase(); renderNotes(); });
    qsa('[data-note-filter]').forEach(btn => btn.addEventListener('click', () => { state.noteFilter = btn.dataset.noteFilter; qsa('[data-note-filter]').forEach(x=>x.classList.toggle('active',x===btn)); renderNotes(); }));
    qsa('[data-money-filter]').forEach(btn => btn.addEventListener('click', () => { state.moneyFilter = btn.dataset.moneyFilter; qsa('[data-money-filter]').forEach(x=>x.classList.toggle('active',x===btn)); renderMoney(); }));
    $('prevDayBtn').addEventListener('click', () => shiftPlannerDay(-1)); $('nextDayBtn').addEventListener('click', () => shiftPlannerDay(1)); $('todayPlanBtn').addEventListener('click', () => {state.plannerDate=new Date();renderPlanner()});
    $('focusStartBtn').addEventListener('click', toggleFocus); $('focusResetBtn').addEventListener('click', resetFocus);
    $('shufflePlanBtn').addEventListener('click', () => { const plans=['balanced','training','focus']; const n=plans[(plans.indexOf(state.user.healthPlan)+1)%plans.length]; state.user.healthPlan=n; updateCurrentUser({healthPlan:n}); renderHealth(); showToast('تم تغيير الخطة.'); });
    $('editWorkBtn').addEventListener('click', () => openModal('work-edit')); $('editHealthBtn').addEventListener('click', () => openModal('health-edit'));
    $('settingsForm').addEventListener('submit', e => { e.preventDefault(); const p={...state.user.profile,name:undefined}; updateCurrentUser({name:$('setName').value.trim() || state.user.name, profile:{...state.user.profile, job:$('setJob').value.trim(), goal:$('setGoal').value, workStart:$('setWorkStart').value, workEnd:$('setWorkEnd').value}}); renderAll(); showToast('تم حفظ التغييرات.'); });
    $('resetLocalBtn').addEventListener('click', () => { openModal('confirm-reset'); });
  }

  function goPage(page) {
    if (!$('appView').classList.contains('hidden') === false) return;
    state.page = page;
    qsa('.page').forEach(x => x.classList.toggle('active-page', x.id === `page-${page}`));
    qsa('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.page === page));
    qsa('.mobile-nav button').forEach(x => x.classList.toggle('active', x.dataset.page === page));
    qs('.sidebar')?.classList.remove('open');
    if (page === 'dashboard') renderDashboard();
    if (page === 'work') renderWork();
    if (page === 'planner') renderPlanner();
    if (page === 'notes') renderNotes();
    if (page === 'health') renderHealth();
    if (page === 'settings') renderSettings();
  }
  function renderAll(){renderTopbar();renderDashboard();renderWork();renderPlanner();renderNotes();renderHealth();renderSettings();goPage('dashboard');}
  function renderTopbar(){const name=state.user.name||state.user.profile?.name||'صاحب المساحة';$('topName').textContent=name;$('heroName').textContent=name.split(' ')[0];$('topJob').textContent=state.user.profile?.job||'مساحتك الشخصية';$('topAvatar').textContent=name.trim().slice(0,1).toUpperCase()||'Y';const h=new Date().getHours();$('sideGreeting').textContent=h<12?'صباح الخير':h<18?'مساء الخير':'مساء هادئ';}

  function renderDashboard(){
    const p=state.user.profile||defaults.profile; const rate=hourlyRate(); const dayHours=timeDiffHours(p.workStart,p.workEnd); const items=state.user.finance?.items||[]; const deductions=items.filter(x=>x.kind==='deduction').reduce((s,x)=>s+Number(x.amount),0); const extra=items.filter(x=>x.kind==='extra').reduce((s,x)=>s+Number(x.amount),0); const income=Number(p.salary)||0; const net=Math.max(0,income+extra-deductions);
    $('todayDate').textContent=formatDate(new Date());$('todayWeekday').textContent=new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(new Date());$('todayLine').textContent=`ساعات العمل: ${p.workStart||'—'} → ${p.workEnd||'—'} · هدفك: ${p.goal||'تنظيم يومك'}`;
    $('dashHourly').textContent=fmtMoneyNoCurrency(rate);$('dashDaily').textContent=fmtMoneyNoCurrency(dailyRate());$('dashWorkHours').textContent=`${dayHours.toFixed(1)}h`;$('dashTasks').textContent=(state.user.planner||[]).filter(x=>x.date===new Date().toISOString().slice(0,10)).length; $('dashNet').textContent=fmtMoney(net);$('dashIncome').textContent=fmtMoneyNoCurrency(income);$('dashDeductions').textContent=fmtMoneyNoCurrency(deductions);$('dashExtra').textContent=fmtMoneyNoCurrency(extra);$('dashNetPercent').textContent=`${income?Math.max(0,Math.min(100,Math.round(net/income*100))):100}%`;$('dashNotes').innerHTML=recentNotes();renderNextUp();updateWorkClockUI();
  }
  function recentNotes(){ const notes=(state.user.notes||[]).slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3); if(!notes.length) return `<div class="empty-state"><strong>لا توجد ملاحظات بعد</strong>أنشئ أول ملاحظة من مركز المذكرة.</div>`; return notes.map(n=>`<div class="note-preview"><strong>${esc(n.title)}</strong><span>${esc(n.content)}</span></div>`).join(''); }
  function renderNextUp(){const key=new Date().toISOString().slice(0,10); const items=(state.user.planner||[]).filter(x=>x.date===key).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,4);$('nextUpList').innerHTML=items.length?items.map(x=>`<div class="timeline-item"><time>${x.time}</time><i class="timeline-dot"></i><div><strong>${esc(x.title)}</strong><span>${x.category==='work'?'عمل':x.category==='break'?'استراحة':x.category==='routine'?'روتين':'وقت شخصي'}</span></div></div>`).join(''):`<div class="empty-state"><strong>اليوم مفتوح</strong>أضف مهمة وسيظهر جدولك هنا.</div>`;}

  function renderWork(){
    const p=state.user.profile; const rate=hourlyRate(); const items=state.user.finance?.items||[]; const progress=monthWorkingProgress(); $('workHourlyBig').textContent=fmtMoneyNoCurrency(rate);$('workIncomeBase').textContent=fmtMoney(p.salary);$('workHoursDay').textContent=timeDiffHours(p.workStart,p.workEnd).toFixed(1);$('workDaysWeek').textContent=p.workDays||0;$('workScheduleText').textContent=`${p.workStart} → ${p.workEnd}`;$('monthProgressBar').style.width=`${progress}%`;$('monthProgressText').textContent=`${progress}%`;renderMoney(); }
  function renderMoney(){const items=(state.user.finance?.items||[]).filter(x=>state.moneyFilter==='all'||x.kind===state.moneyFilter);$('moneyItems').innerHTML=items.slice().reverse().slice(0,5).map(x=>`<div class="money-item"><div><strong>${esc(x.title)} <span class="kind ${x.kind}">${x.kind==='deduction'?'خصم':'إضافي'}</span></strong><small>${x.dateLabel||shortDate(new Date(x.createdAt))}</small></div><b>${x.kind==='deduction'?'-':'+'}${fmtMoneyNoCurrency(x.amount)}</b><button onclick="Yourself.removeMoney('${x.id}')">×</button></div>`).join('')||`<div class="empty-state"><strong>لا توجد عمليات</strong>ابدأ بإضافة خصم أو دخل إضافي.</div>`;$('moneyTable').innerHTML=items.slice().reverse().map(x=>`<tr><td><b>${esc(x.title)}</b></td><td><span class="money-type-badge ${x.kind}">${x.kind==='deduction'?'خصم':'إضافي'}</span></td><td>${x.kind==='deduction'?'-':'+'}${fmtMoneyNoCurrency(x.amount)} EGP</td><td>${esc(x.dateLabel||shortDate(new Date(x.createdAt)))}</td><td><button class="table-action" onclick="Yourself.removeMoney('${x.id}')">حذف</button></td></tr>`).join('')||`<tr><td colspan="5"><div class="empty-state">لا توجد بيانات</div></td></tr>`;}
  function removeMoney(id){ state.user.finance.items=(state.user.finance.items||[]).filter(x=>x.id!==id); updateCurrentUser({finance:state.user.finance});renderWork();renderDashboard();showToast('تم حذف العملية.'); }

  function startWork(){ if(state.workTimer.running)return; state.workTimer.running=true;state.workTimer.startedAt=Date.now();$('workStartBtn').disabled=true;$('workStopBtn').disabled=false;state.workInterval=setInterval(updateWorkClockUI,1000);updateWorkClockUI(); }
  function stopWork(){ if(!state.workTimer.running)return; const elapsed=Date.now()-state.workTimer.startedAt; state.workTimer.elapsed+=elapsed; state.workTimer.running=false; clearInterval(state.workInterval); state.workInterval=null; const hours=elapsed/3600000; const earned=hours*hourlyRate(); state.user.finance=state.user.finance||{items:[]}; if(earned>0) state.user.finance.items.push({id:crypto.randomUUID?.()||String(Date.now()),kind:'extra',title:'جلسة عمل مسجلة',amount:earned,createdAt:new Date().toISOString(),dateLabel:'اليوم'}); updateCurrentUser({finance:state.user.finance});$('workStartBtn').disabled=false;$('workStopBtn').disabled=true;state.workTimer.elapsed=0;state.workTimer.startedAt=null;updateWorkClockUI();renderWork();renderDashboard();showToast(`تم تسجيل الجلسة · +${fmtMoney(earned)}`); }
  function updateWorkClockUI(){let ms=state.workTimer.elapsed+(state.workTimer.running?(Date.now()-state.workTimer.startedAt):0);const total=Math.floor(ms/1000);const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;$('workTimer').textContent=[h,m,s].map(x=>String(x).padStart(2,'0')).join(':');$('liveEarned').textContent=fmtMoney((total/3600)*hourlyRate());$('workClockState').textContent=state.workTimer.running?'جاري العمل':'جاهز';$('sideStatus').textContent=state.workTimer.running?'تعمل الآن ✦':'منظم ✦';$('sideStatusMeta').textContent=state.workTimer.running?'الوقت يتحول إلى قيمة مباشرة':'ابدأ بأهم مهمة لديك';}

  function shiftPlannerDay(delta){state.plannerDate=new Date(state.plannerDate);state.plannerDate.setDate(state.plannerDate.getDate()+delta);renderPlanner();}
  function renderPlanner(){const d=state.plannerDate; $('plannerDayLabel').textContent=new Intl.DateTimeFormat('ar-EG',{weekday:'long'}).format(d);$('plannerDateLabel').textContent=formatDate(d);const key=d.toISOString().slice(0,10);const plans=(state.user.planner||[]).filter(x=>x.date===key);const start=6,end=23;let html=''; for(let hour=start;hour<=end;hour++){const time=`${String(hour).padStart(2,'0')}:00`;const found=plans.filter(p=>Number(p.time.split(':')[0])===hour); html+=`<div class="hour-row"><div class="hour-time">${time}</div><div class="hour-slot ${found.length?'':'empty'}">${found.map(p=>`<div class="plan-chip"><span>${esc(p.title)}</span><b>${p.time}</b></div>`).join('')}</div></div>`;} $('scheduleGrid').innerHTML=html; const p=state.user.profile; $('routineSummary').innerHTML=`<div class="routine-row"><span>الاستيقاظ</span><b>${p.wake}</b></div><div class="routine-row"><span>الذهاب</span><b>${p.goWork}</b></div><div class="routine-row"><span>العمل</span><b>${p.workStart} → ${p.workEnd}</b></div><div class="routine-row"><span>الرجوع</span><b>${p.backWork}</b></div><div class="routine-row"><span>النوم</span><b>${p.sleep}</b></div>`; }
  function savePlan(form){ const data={id:crypto.randomUUID?.()||String(Date.now()),date:$('planDate').value,time:$('planTime').value,title:$('planTitle').value.trim(),category:$('planCategory').value};if(!data.title)return showToast('اكتب عنوان المهمة.','error');const planner=[...(state.user.planner||[]).filter(x=>x.id!==data.id),data];updateCurrentUser({planner});renderPlanner();renderDashboard();closeModal();showToast('تمت إضافة المهمة.'); }

  function renderNotes(){let notes=state.user.notes||[];notes=notes.filter(n=>state.noteFilter==='all'||(state.noteFilter==='pinned'&&n.pinned)||n.category===state.noteFilter);if(state.noteSearch)notes=notes.filter(n=>`${n.title} ${n.content}`.toLowerCase().includes(state.noteSearch));notes.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.updatedAt)-new Date(a.updatedAt));$('notesGrid').innerHTML=notes.map(n=>`<article class="note-card ${n.pinned?'pinned':''}"><div class="note-meta"><span class="note-type">${n.category==='work'?'عمل':n.category==='personal'?'شخصية':'فكرة'}</span><button class="pin-btn" title="تثبيت" onclick="Yourself.togglePin('${n.id}')">${n.pinned?'★':'☆'}</button></div><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="note-footer"><small>${esc(n.updatedLabel||shortDate(new Date(n.updatedAt)))}</small><div class="note-footer-actions"><button class="edit-note" onclick="Yourself.editNote('${n.id}')">✎</button><button class="delete-note" onclick="Yourself.deleteNote('${n.id}')">×</button></div></div></article>`).join('')||`<div class="panel empty-state" style="grid-column:1/-1"><strong>المذكرة جاهزة لك</strong>اكتب أول فكرة، ملاحظة عمل أو شيء تريد أن تتذكره.</div>`; }
  function saveNote(form){const id=$('noteId').value||crypto.randomUUID?.()||String(Date.now());const current=state.user.notes.find(x=>x.id===id);const note={id,title:$('noteTitle').value.trim()||'ملاحظة بدون عنوان',content:$('noteContent').value.trim(),category:$('noteCategory').value,pinned:current?.pinned||false,updatedAt:new Date().toISOString(),updatedLabel:'الآن'}; if(!note.content)return showToast('اكتب محتوى الملاحظة أولًا.','error');state.user.notes=[...(state.user.notes||[]).filter(x=>x.id!==id),note];updateCurrentUser({notes:state.user.notes});renderNotes();renderDashboard();closeModal();showToast(current?'تم تحديث الملاحظة.':'تم حفظ الملاحظة.'); }
  function editNote(id){const n=(state.user.notes||[]).find(x=>x.id===id);if(n)openModal('note',n);}
  function togglePin(id){state.user.notes=state.user.notes.map(n=>n.id===id?{...n,pinned:!n.pinned,updatedAt:new Date().toISOString()}:n);updateCurrentUser({notes:state.user.notes});renderNotes();renderDashboard();}
  function deleteNote(id){state.user.notes=state.user.notes.filter(n=>n.id!==id);updateCurrentUser({notes:state.user.notes});renderNotes();renderDashboard();showToast('تم حذف الملاحظة.');}

  function renderHealth(){const p=state.user.profile||{};$('healthAge').textContent=p.age||'—';$('healthWeight').textContent=p.weight||'—';$('healthHeight').textContent=p.height||'—';const habits=state.user.habits||[];const done=habits.filter(x=>x.done).length;const pct=habits.length?Math.round(done/habits.length*100):0;$('habitProgress').textContent=`${pct}%`;$('habitList').innerHTML=habits.map(h=>`<div class="habit-item ${h.done?'done':''}"><button onclick="Yourself.toggleHabit('${h.id}')">${h.done?'✓':'○'}</button><span>${esc(h.title)}</span><small>${esc(h.meta)}</small></div>`).join('');const plans={balanced:[['الصباح','ماء + وجبة صباحية متوازنة + 5 دقائق ترتيب لليوم'],['خلال العمل','فواصل قصيرة للحركة وتغيير وضعية الجسم عند الحاجة'],['بعد العمل','وجبة رئيسية متنوعة + حركة خفيفة أو نشاط مناسب'],['المساء','تهدئة الشاشة والاستعداد للنوم في وقت ثابت نسبيًا']],training:[['الصباح','استيقاظ وروتين خفيف بدون ضغط'],['3 أيام أسبوعيًا','جلسة تدريب عامة تناسب مستواك، مع إحماء وتهدئة'],['يوميًا','مشي أو حركة خفيفة حسب طاقتك'],['المساء','تمدد بسيط وراحة ونوم منتظم']],focus:[['البداية','حدد أهم مهمة واحدة قبل فتح المشتتات'],['جلسات التركيز','25 دقيقة تركيز + 5 دقائق فاصل، وكررها حسب قدرتك'],['فاصل اليوم','وقت غداء وابتعاد قصير عن الشاشة'],['الإغلاق','اكتب ما تم وما سينتقل للغد']]}[state.user.healthPlan||'balanced'];$('wellnessPlan').innerHTML=plans.map(x=>`<div class="plan-block"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');renderHealthWeek();}
  function toggleHabit(id){state.user.habits=state.user.habits.map(h=>h.id===id?{...h,done:!h.done}:h);updateCurrentUser({habits:state.user.habits});renderHealth();}
  function renderHealthWeek(){const today=new Date();const cells=[];for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const progress=i===0?60:Math.min(100,20+(i*9));cells.push(`<div class="day-cell ${i===0?'active':''}" style="--progress:${progress}%"><span>${new Intl.DateTimeFormat('ar-EG',{weekday:'short'}).format(d)}</span><b>${progress}%</b><small>${shortDate(d)}</small><i></i></div>`)}$('healthWeek').innerHTML=cells.join('');}
  function renderSettings(){const p=state.user.profile;$('setName').value=state.user.name||'';$('setEmail').value=state.user.email||'';$('setJob').value=p.job||'';$('setGoal').value=p.goal||'تنظيم الوقت';$('setWorkStart').value=p.workStart||'';$('setWorkEnd').value=p.workEnd||'';}

  function startFocus(){ if(state.focusTimer.running)return; state.focusTimer.running=true;state.focusInterval=setInterval(()=>{state.focusTimer.seconds--; if(state.focusTimer.seconds<=0){resetFocus();showToast('انتهت جلسة التركيز ✦');}},1000);renderFocus();}
  function toggleFocus(){state.focusTimer.running?pauseFocus():startFocus();}
  function pauseFocus(){state.focusTimer.running=false;clearInterval(state.focusInterval);state.focusInterval=null;renderFocus();}
  function resetFocus(){state.focusTimer.running=false;clearInterval(state.focusInterval);state.focusInterval=null;state.focusTimer.seconds=25*60;renderFocus();}
  function renderFocus(){const m=Math.floor(state.focusTimer.seconds/60),s=state.focusTimer.seconds%60;$('focusTimer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;$('focusStartBtn').textContent=state.focusTimer.running?'إيقاف':'بدء';}

  function applyTheme(theme){document.documentElement.classList.remove('theme-midnight','theme-sand');if(theme==='midnight')document.documentElement.classList.add('theme-midnight');if(theme==='sand')document.documentElement.classList.add('theme-sand');qsa('.theme-swatch').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));}
  qsa('.theme-swatch').forEach(b=>b.addEventListener('click',()=>{const pref=readPref();pref.theme=b.dataset.theme;localStorage.setItem(PREF_KEY,JSON.stringify(pref));applyTheme(b.dataset.theme)}));

  function logout(){clearSession();state.user=null;state.devAuthenticated=false;location.reload();}

  function setAuthPreview(){let rate=0;if(readUsers()[0])rate=hourlyRate(readUsers()[0]);$('authPreviewHour').textContent=fmtMoney(rate);}

  function openModal(type,data){
    let html='';
    if(type==='login-help') html=modal('مساعدة الدخول','هذا الإصدار يحفظ الحسابات داخل المتصفح. لإعادة الوصول استخدم الحساب الذي أنشأته على نفس الجهاز.','<div class="empty-state"><strong>هل غيّرت جهازك؟</strong>ستحتاج في النسخة المنشورة إلى خدمة مصادقة وقاعدة بيانات حتى تبقى حساباتك متاحة من أي جهاز.</div>');
    if(type==='demo') html=modal('وضع العرض','استكشف شكل Yourself بسرعة.','<div class="demo-box"><div class="health-note"><b>العرض</b><span>يمكنك إنشاء حساب تجريبي من شاشة التسجيل أو إغلاق هذه النافذة والبدء مباشرة.</span></div><div class="modal-actions"><button class="secondary-btn" onclick="Yourself.closeModal()">إغلاق</button></div></div>');
    if(type==='money') html=modal('إضافة حركة مالية','سجّل خصمًا أو مبلغًا إضافيًا وسيظهر في ملخص الدخل.',`<div class="modal-grid"><label>النوع<select id="moneyKind"><option value="deduction">خصم</option><option value="extra">إضافي</option></select></label><label>المبلغ<input id="moneyAmount" type="number" min="0" step="0.01" placeholder="250"></label></div><label style="margin-top:12px">الوصف<input id="moneyTitle" type="text" placeholder="مثال: مواصلات"></label><div class="modal-actions"><button class="primary-btn" onclick="Yourself.saveMoneyFromModal()">حفظ</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);
    if(type==='plan'){const key=state.plannerDate.toISOString().slice(0,10);html=modal('مهمة جديدة','أضف مهمة وستظهر في جدول اليوم المحدد.',`<div class="modal-grid"><label>التاريخ<input id="planDate" type="date" value="${key}"></label><label>الوقت<input id="planTime" type="time" value="09:00"></label></div><label style="margin-top:12px">العنوان<input id="planTitle" type="text" placeholder="مثال: إنهاء صفحة الهبوط"></label><label style="margin-top:12px">التصنيف<select id="planCategory"><option value="work">عمل</option><option value="personal">شخصي</option><option value="break">استراحة</option><option value="routine">روتين</option></select></label><div class="modal-actions"><button class="primary-btn" onclick="Yourself.savePlan()">إضافة المهمة</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);}
    if(type==='note'){const n=data||{};html=modal(n.id?'تعديل الملاحظة':'ملاحظة جديدة','اكتبها كما تحب؛ يمكنك تثبيتها أو تصنيفها لاحقًا.',`<input id="noteId" type="hidden" value="${n.id||''}"><label>العنوان<input id="noteTitle" type="text" value="${escAttr(n.title||'')}" placeholder="عنوان الملاحظة"></label><label style="margin-top:12px">التصنيف<select id="noteCategory"><option value="idea" ${(n.category||'idea')==='idea'?'selected':''}>فكرة</option><option value="work" ${n.category==='work'?'selected':''}>عمل</option><option value="personal" ${n.category==='personal'?'selected':''}>شخصية</option></select></label><label class="note-editor" style="margin-top:12px">المحتوى<textarea id="noteContent" placeholder="اكتب هنا...">${esc(n.content||'')}</textarea></label><div class="modal-actions"><button class="primary-btn" onclick="Yourself.saveNote()">حفظ الملاحظة</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);}
    if(type==='work-edit') html=modal('تعديل بيانات العمل','حدّث الأرقام وسيعاد حساب قيمة الساعة مباشرة.',`<div class="modal-grid"><label>الراتب/الدخل<input id="editSalary" type="number" min="0" value="${Number(state.user.profile.salary)||0}"></label><label>نوع الدخل<select id="editSalaryType"><option value="monthly" ${state.user.profile.salaryType==='monthly'?'selected':''}>شهري</option><option value="hourly" ${state.user.profile.salaryType==='hourly'?'selected':''}>بالساعة</option></select></label><label>أيام العمل بالأسبوع<input id="editWorkDays" type="number" min="1" max="7" value="${state.user.profile.workDays||5}"></label><label>أيام الإجازة<input id="editOffDays" type="text" value="${escAttr(state.user.profile.offDays||'')}"></label><label>البداية<input id="editStart" type="time" value="${state.user.profile.workStart||''}"></label><label>النهاية<input id="editEnd" type="time" value="${state.user.profile.workEnd||''}"></label></div><div class="modal-actions"><button class="primary-btn" onclick="Yourself.saveWorkEdit()">حفظ</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);
    if(type==='health-edit') html=modal('تعديل البيانات الصحية','حدّث الأرقام التي تريد متابعتها.',`<div class="modal-grid"><label>العمر<input id="editAge" type="number" value="${escAttr(state.user.profile.age||'')}"></label><label>الوزن (كجم)<input id="editWeight" type="number" value="${escAttr(state.user.profile.weight||'')}"></label><label>الطول (سم)<input id="editHeight" type="number" value="${escAttr(state.user.profile.height||'')}"></label><label>النشاط<select id="editActivity"><option value="light" ${state.user.profile.activity==='light'?'selected':''}>خفيف</option><option value="moderate" ${state.user.profile.activity==='moderate'?'selected':''}>متوسط</option><option value="high" ${state.user.profile.activity==='high'?'selected':''}>مرتفع</option></select></label></div><div class="modal-actions"><button class="primary-btn" onclick="Yourself.saveHealthEdit()">حفظ</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);
    if(type==='confirm-reset') html=modal('مسح البيانات المحلية','هذا الإجراء يحذف الحساب وبياناته من هذا المتصفح.',`<div class="health-note"><b>تنبيه</b><span>لن يمكن استعادة البيانات بعد الحذف من نفس المتصفح.</span></div><div class="modal-actions"><button class="danger-btn" onclick="Yourself.resetAccount()">نعم، امسح الحساب</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);
    if(type==='search') html=modal('بحث سريع','اختصر الطريق إلى أقسام مساحتك.',`<div class="search-jump">${['dashboard:الرئيسية','work:العمل والدخل','planner:تنظيم الوقت','notes:المذكرة','health:الصحة والنشاط','settings:الإعدادات'].map(x=>{const [id,label]=x.split(':');return `<button class="choice-card" onclick="Yourself.goPage('${id}');Yourself.closeModal();"><strong>${label}</strong><small>فتح القسم</small></button>`}).join('')}</div>`);
    if(type==='dev-login') html=modal('مركز المطوّر','هذه النافذة مخفية عن المستخدمين العاديين.',`<label>البريد الإلكتروني<input id="devEmail" type="email" placeholder="developer@example.com"></label><label style="margin-top:12px">كلمة المرور<input id="devPass" type="password" placeholder="••••••••"></label><div class="modal-actions"><button class="primary-btn" onclick="Yourself.devLogin()">الدخول للمركز</button><button class="secondary-btn" onclick="Yourself.closeModal()">إلغاء</button></div>`);
    $('modalRoot').innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal-card">${html}</div></div>`;qs('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  }
  function modal(title,desc,body){return `<div class="modal-head"><div><span class="kicker">YOURSELF</span><h3>${title}</h3><p>${desc}</p></div><button class="modal-close" onclick="Yourself.closeModal()">×</button></div><div class="modal-body">${body}</div>`;}
  function closeModal(){$('modalRoot').innerHTML='';}
  function saveMoneyFromModal(){const kind=$('moneyKind').value,amount=Number($('moneyAmount').value)||0,title=$('moneyTitle').value.trim()||'حركة مالية';if(amount<=0)return showToast('أدخل مبلغًا صحيحًا.','error');state.user.finance=state.user.finance||{items:[]};state.user.finance.items.push({id:crypto.randomUUID?.()||String(Date.now()),kind,amount,title,createdAt:new Date().toISOString(),dateLabel:'اليوم'});updateCurrentUser({finance:state.user.finance});closeModal();renderMoney();renderDashboard();showToast(kind==='deduction'?'تم تسجيل الخصم.':'تم تسجيل الإضافة.');}
  function saveWorkEdit(){updateCurrentUser({profile:{...state.user.profile,salary:Number($('editSalary').value)||0,salaryType:$('editSalaryType').value,workDays:Number($('editWorkDays').value)||5,offDays:$('editOffDays').value.trim(),workStart:$('editStart').value,workEnd:$('editEnd').value}});closeModal();renderAll();showToast('تم تحديث بيانات العمل.');}
  function saveHealthEdit(){updateCurrentUser({profile:{...state.user.profile,age:$('editAge').value,weight:$('editWeight').value,height:$('editHeight').value,activity:$('editActivity').value}});closeModal();renderHealth();showToast('تم تحديث بياناتك.');}
  function resetAccount(){const users=readUsers().filter(u=>u.id!==state.user.id);writeUsers(users);clearSession();closeModal();location.reload();}

  function devLogin(){const email=normalizeEmail($('devEmail').value),pass=$('devPass').value;const ok=DEV_USERS.some(d=>normalizeEmail(d.email)===email&&d.password===pass);if(!ok)return showToast('بيانات مركز المطوّر غير صحيحة.','error');state.devAuthenticated=true;closeModal();openDeveloperPanel();}
  function openDeveloperPanel(){if(!state.devAuthenticated)return;const users=readUsers();const ops=users.reduce((s,u)=>s+(u.finance?.items?.length||0),0),notes=users.reduce((s,u)=>s+(u.notes?.length||0),0);$('modalRoot').innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal-card dev-panel"><div class="modal-head"><div><span class="kicker">DEVELOPER CENTER</span><h3>مركز المطوّر</h3><p>إدارة الحسابات والبيانات الموجودة في هذا الإصدار المحلي.</p></div><button class="modal-close" onclick="Yourself.closeModal()">×</button></div><div class="dev-summary"><div class="dev-stat"><span>الحسابات</span><b>${users.length}</b></div><div class="dev-stat"><span>العمليات</span><b>${ops}</b></div><div class="dev-stat"><span>الملاحظات</span><b>${notes}</b></div><div class="dev-stat"><span>الحالة</span><b>ON</b></div></div><div class="dev-list">${users.length?users.map(u=>devUserRow(u)).join(''):`<div class="empty-state"><strong>لا توجد حسابات</strong>أنشئ حسابًا من صفحة التسجيل أولًا.</div>`}</div></div></div>`;qs('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});}
  function devUserRow(u){const p=u.profile||{};return `<div class="dev-user"><strong>${esc(u.name||'—')}</strong><span>${esc(u.email)}</span><span>${esc(p.job||'بدون وظيفة')}</span><span>${fmtMoney(p.salary||0)}</span><div class="dev-actions"><button onclick="Yourself.inspectUser('${u.id}')">عرض</button><button onclick="Yourself.deleteUser('${u.id}')">×</button></div></div>`;}
  function inspectUser(id){const u=readUsers().find(x=>x.id===id);if(!u)return;const p=u.profile||{};const detail=document.createElement('div');detail.className='dev-user-detail';detail.innerHTML=`<div class="detail-grid"><div><span>الاسم</span><b>${esc(u.name)}</b></div><div><span>البريد</span><b>${esc(u.email)}</b></div><div><span>الوظيفة</span><b>${esc(p.job||'—')}</b></div><div><span>الدخل</span><b>${fmtMoney(p.salary||0)}</b></div><div><span>العمل</span><b>${esc(p.workStart||'—')} → ${esc(p.workEnd||'—')}</b></div><div><span>الصحة</span><b>${esc(p.weight||'—')} kg · ${esc(p.height||'—')} cm · ${esc(p.age||'—')} y</b></div></div>`;const node=[...document.querySelectorAll('.dev-user')].find(x=>x.querySelector('strong')?.textContent===u.name); if(node){document.querySelectorAll('.dev-user-detail').forEach(x=>x.remove());node.after(detail);}}
  function deleteUser(id){if(!state.devAuthenticated)return;const users=readUsers().filter(x=>x.id!==id);writeUsers(users);openDeveloperPanel();showToast('تم حذف الحساب.');}

  function esc(value=''){return String(value).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
  function escAttr(value=''){return esc(value).replace(/`/g,'&#96;');}

  window.Yourself={removeMoney,saveMoneyFromModal,savePlan,saveNote,closeModal,editNote,togglePin,deleteNote,toggleHabit,goPage,saveWorkEdit,saveHealthEdit,resetAccount,devLogin,inspectUser,deleteUser};
  document.addEventListener('DOMContentLoaded', init);
})();
