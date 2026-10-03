/* ══════════════════════════════════════════════════
   Yourself 2.0 — Application Logic
══════════════════════════════════════════════════ */

// ══════ Storage Keys ══════
const K = {
  users:'yz_users_v2', session:'yz_sess_v2', onboard:'yz_ob_',
  finance:'yz_fin_', notes:'yz_note_', schedule:'yz_sched_',
  health:'yz_health_', profile:'yz_prof_', workouts:'yz_work_',
  meals:'yz_meal_', worklog:'yz_wl_'
};

// ══════ Default Users (Hidden) ══════
const DEV_USERS = [
  {id:'dev_hoang',name:'Hoang',email:'hoang@gmail.com',password:'Hoang123',role:'admin'},
  {id:'dev_haider',name:'Haider',email:'haider@gmail.com',password:'asdfghjkl123',role:'admin'}
];

// ══════ State ══════
let me = null;
let wizStep = 0;
let wizData = {};
let workTimer = null;
let noteColors = ['#14B8A6','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981','#EC4899'];
let selectedNoteColor = noteColors[0];

const WIZ_STEPS = [
  {id:'personal',label:'شخصي',title:'البيانات الشخصية',sub:'لنتعرف عليك أولاً',icon:'👤'},
  {id:'job',label:'وظيفي',title:'الوظيفة والدخل',sub:'أدخل بيانات وظيفتك وراتبك',icon:'💼'},
  {id:'work',label:'دوام',title:'ساعات العمل',sub:'حدد مواعيد دوامك اليومية',icon:'⏰'},
  {id:'health',label:'صحي',title:'البيانات الصحية',sub:'وزنك، طولك، وهدفك',icon:'💪'},
  {id:'nutrition',label:'غذائي',title:'النظام الغذائي',sub:'سعراتك وهدفك الغذائي',icon:'🥗'},
  {id:'review',label:'مراجعة',title:'مراجعة نهائية',sub:'تأكد من بياناتك',icon:'✅'}
];

// ══════ Helpers ══════
const uid = () => 'x' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const sum = a => a.reduce((x,y)=>x+num(y),0);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = () => iso(new Date());
const mk = d => iso(d).slice(0,7);
const daysAr = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const daysShort = ['أحد','إثن','ثلا','أرب','خمي','جمع','سبت'];
const money = n => num(n).toLocaleString('en-US',{maximumFractionDigits:2});
const hoursFmt = n => num(n).toLocaleString('en-US',{maximumFractionDigits:2});

function dateFmt(s){
  if(!s) return '—';
  const d = new Date(s);
  const m = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

function toast(msg,type='ok'){
  const c = document.getElementById('toastBox');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${type==='ok'?'✓':type==='err'?'✕':'ℹ'}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(20px)';t.style.transition='.3s';setTimeout(()=>t.remove(),300)},2800);
}

function modal({title,body,footer='إغلاق',onSubmit,hideSubmit,wide}){
  const box = document.getElementById('modalBox');
  box.innerHTML = `<div class="modal-bg" onclick="closeModal()"></div>
    <div class="modal-card ${wide?'wide':''}" onclick="event.stopPropagation()">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn-icon" onclick="closeModal()">✕</button></div>
      <form id="modForm"><div class="modal-body">${body}</div>
      <div class="modal-foot"><button type="button" class="btn ghost" onclick="closeModal()">إلغاء</button>${hideSubmit?'':`<button type="submit" class="btn primary">${esc(footer)}</button>`}</div></form>
    </div>`;
  box.classList.add('on');
  const f = document.getElementById('modForm');
  f.onsubmit = e => { e.preventDefault(); if(onSubmit && onSubmit(new FormData(f))===false) return; closeModal(); };
}
function closeModal(){ document.getElementById('modalBox').classList.remove('on'); document.getElementById('modalBox').innerHTML=''; }

// ══════ Users ══════
function getUsers(){
  try{
    let u = JSON.parse(localStorage.getItem(K.users));
    if(!u || !Array.isArray(u) || !u.length){ u = [...DEV_USERS]; localStorage.setItem(K.users,JSON.stringify(u)); }
    DEV_USERS.forEach(d=>{ if(!u.find(x=>x.email.toLowerCase()===d.email.toLowerCase())) u.push(d); });
    localStorage.setItem(K.users,JSON.stringify(u));
    return u;
  }catch(e){ localStorage.setItem(K.users,JSON.stringify(DEV_USERS)); return [...DEV_USERS]; }
}
function saveUsers(u){ localStorage.setItem(K.users,JSON.stringify(u)); }

// ══════ Auth ══════
function switchTab(t){
  const tl=document.getElementById('tabLogin'), tr=document.getElementById('tabRegister');
  const lf=document.getElementById('loginForm'), rf=document.getElementById('registerForm');
  if(t==='login'){ tl.classList.add('active'); tr.classList.remove('active'); lf.classList.remove('hidden'); rf.classList.add('hidden'); }
  else{ tr.classList.add('active'); tl.classList.remove('active'); rf.classList.remove('hidden'); lf.classList.add('hidden'); }
}

function handleLogin(e){
  e.preventDefault();
  const em = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw = document.getElementById('loginPassword').value;
  const u = getUsers().find(x=>x.email.toLowerCase()===em && x.password===pw);
  if(!u){ toast('بيانات الدخول غير صحيحة','err'); return; }
  loginAs(u);
}
function handleRegister(e){
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const em = document.getElementById('regEmail').value.trim().toLowerCase();
  const pw = document.getElementById('regPassword').value;
  const cf = document.getElementById('regConfirm').value;
  if(pw!==cf){ toast('كلمتا المرور غير متطابقتين','err'); return; }
  if(pw.length<6){ toast('كلمة المرور قصيرة جداً','err'); return; }
  const users = getUsers();
  if(users.find(u=>u.email.toLowerCase()===em)){ toast('البريد مستخدم بالفعل','err'); return; }
  const nu = {id:uid(),name,email:em,password:pw,role:'user'};
  users.push(nu); saveUsers(users);
  toast('تم إنشاء الحساب بنجاح 🎉');
  setTimeout(()=>loginAs(nu),700);
}
function loginAs(u){
  me = u;
  localStorage.setItem(K.session,JSON.stringify(u));
  document.getElementById('authScreen').classList.add('hidden');
  if(u.role==='admin' || localStorage.getItem(K.onboard+u.id)) showApp();
  else startWizard();
}
function handleLogout(){
  if(!confirm('تأكيد تسجيل الخروج؟')) return;
  localStorage.removeItem(K.session); me=null;
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('wizardScreen').classList.add('hidden');
  document.getElementById('loginEmail').value=''; document.getElementById('loginPassword').value='';
}

// ══════ Wizard ══════
function startWizard(){
  wizStep = 0; wizData = {};
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('wizardScreen').classList.remove('hidden');
  renderWiz();
}
function renderWiz(){
  // Progress
  const pct = (wizStep / (WIZ_STEPS.length-1)) * 100;
  document.getElementById('wizProgress').style.width = pct + '%';
  // Dots
  document.getElementById('wizDots').innerHTML = WIZ_STEPS.map((s,i)=>`
    <div class="wiz-dot ${i===wizStep?'active':''} ${i<wizStep?'done':''}">
      <span>${i<wizStep?'✓':i+1}</span><small>${s.label}</small>
    </div>`).join('');
  document.getElementById('wizStepInfo').textContent = `الخطوة ${wizStep+1} من ${WIZ_STEPS.length}`;
  document.getElementById('wizPrev').style.display = wizStep>0 ? 'block' : 'none';
  document.getElementById('wizNext').textContent = wizStep===WIZ_STEPS.length-1 ? '🚀 إنهاء الإعداد' : 'التالي ←';
  
  const step = WIZ_STEPS[wizStep];
  const body = document.getElementById('wizardBody');
  
  const templates = {
    personal:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div class="wiz-fields">
        <div class="wiz-field"><label>رقم الهاتف</label><input id="wPhone" value="${esc(wizData.phone||'')}" placeholder="+20 1xx xxx xxxx"></div>
        <div class="wiz-field"><label>الدولة</label><input id="wCountry" value="${esc(wizData.country||'')}" placeholder="مصر"></div>
        <div class="wiz-field"><label>المدينة</label><input id="wCity" value="${esc(wizData.city||'')}" placeholder="القاهرة"></div>
        <div class="wiz-field"><label>تاريخ الميلاد</label><input type="date" id="wBirth" value="${wizData.birth||''}"></div>
        <div class="wiz-field"><label>النوع</label><select id="wGender">
          <option value="male" ${wizData.gender==='male'||!wizData.gender?'selected':''}>ذكر</option>
          <option value="female" ${wizData.gender==='female'?'selected':''}>أنثى</option>
        </select></div>
      </div>`,
    job:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div class="wiz-fields">
        <div class="wiz-field"><label>المسمى الوظيفي</label><input id="wJob" value="${esc(wizData.job||'')}" placeholder="مثال: مهندس برمجيات"></div>
        <div class="wiz-field"><label>جهة العمل</label><input id="wEmp" value="${esc(wizData.employer||'')}" placeholder="اسم الشركة"></div>
        <div class="wiz-field"><label>نظام الأجر</label><select id="wSalType">
          <option value="hourly" ${wizData.salType==='hourly'||!wizData.salType?'selected':''}>بالساعة</option>
          <option value="monthly" ${wizData.salType==='monthly'?'selected':''}>شهري</option>
        </select></div>
        <div class="wiz-field"><label>أجر الساعة (جنيه)</label><input type="number" id="wRate" value="${wizData.rate||''}" placeholder="50" min="0" step="0.5"></div>
        <div class="wiz-field"><label>الراتب الشهري (جنيه)</label><input type="number" id="wSalary" value="${wizData.salary||''}" placeholder="8750" min="0" step="50"></div>
        <div class="wiz-field"><label>العملة</label><select id="wCurrency">
          <option value="EGP" ${wizData.currency==='EGP'||!wizData.currency?'selected':''}>جنيه مصري (EGP)</option>
          <option value="SAR" ${wizData.currency==='SAR'?'selected':''}>ريال سعودي (SAR)</option>
          <option value="AED" ${wizData.currency==='AED'?'selected':''}>درهم إماراتي (AED)</option>
          <option value="USD" ${wizData.currency==='USD'?'selected':''}>دولار (USD)</option>
          <option value="EUR" ${wizData.currency==='EUR'?'selected':''}>يورو (EUR)</option>
        </select></div>
      </div>`,
    work:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div class="wiz-fields">
        <div class="wiz-field"><label>ساعة الحضور</label><input type="time" id="wCheckIn" value="${wizData.checkIn||'09:00'}"></div>
        <div class="wiz-field"><label>ساعة الانصراف</label><input type="time" id="wCheckOut" value="${wizData.checkOut||'17:00'}"></div>
        <div class="wiz-field"><label>أيام العمل في الشهر</label><input type="number" id="wWorkDays" value="${wizData.workDays||26}" min="1" max="31"></div>
        <div class="wiz-field"><label>عدد الإجازات سنوياً</label><input type="number" id="wVacations" value="${wizData.vacations||21}" min="0" max="365"></div>
        <div class="wiz-field"><label>معامل الإضافي</label><input type="number" id="wOTMul" value="${wizData.otMul||1.5}" min="1" max="3" step="0.1"></div>
      </div>`,
    health:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div class="wiz-fields">
        <div class="wiz-field"><label>الوزن الحالي (كجم)</label><input type="number" id="wWeight" value="${wizData.weight||''}" placeholder="70" step="0.1" min="0"></div>
        <div class="wiz-field"><label>الطول (سم)</label><input type="number" id="wHeight" value="${wizData.height||''}" placeholder="170" min="0"></div>
        <div class="wiz-field"><label>الوزن المستهدف (كجم)</label><input type="number" id="wTarget" value="${wizData.target||''}" placeholder="65" step="0.1" min="0"></div>
        <div class="wiz-field"><label>مستوى النشاط</label><select id="wActivity">
          <option value="1.2" ${wizData.activity==='1.2'?'selected':''}>قليل الحركة (مكتبي)</option>
          <option value="1.375" ${wizData.activity==='1.375'?'selected':''}>نشاط خفيف (رياضة 1-3 أيام)</option>
          <option value="1.55" ${wizData.activity==='1.55'||!wizData.activity?'selected':''}>نشاط متوسط (3-5 أيام)</option>
          <option value="1.725" ${wizData.activity==='1.725'?'selected':''}>نشاط عالي (6-7 أيام)</option>
          <option value="1.9" ${wizData.activity==='1.9'?'selected':''}>رياضي محترف</option>
        </select></div>
      </div>`,
    nutrition:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div class="wiz-fields">
        <div class="wiz-field"><label>الهدف الغذائي</label><select id="wGoal">
          <option value="lose" ${wizData.goal==='lose'||!wizData.goal?'selected':''}>خسارة وزن</option>
          <option value="maintain" ${wizData.goal==='maintain'?'selected':''}>الحفاظ على الوزن</option>
          <option value="gain" ${wizData.goal==='gain'?'selected':''}>بناء عضلات / زيادة وزن</option>
        </select></div>
        <div class="wiz-field"><label>عدد الوجبات اليومية</label><select id="wMeals">
          <option value="3" ${wizData.meals==='3'||!wizData.meals?'selected':''}>3 وجبات</option>
          <option value="4" ${wizData.meals==='4'?'selected':''}>4 وجبات</option>
          <option value="5" ${wizData.meals==='5'?'selected':''}>5 وجبات صغيرة</option>
        </select></div>
        <div class="wiz-field"><label>هل تتبع نظاماً غذائياً حالياً؟</label><select id="wDiet">
          <option value="no" ${wizData.diet==='no'||!wizData.diet?'selected':''}>لا، سأبدأ من الصفر</option>
          <option value="yes" ${wizData.diet==='yes'?'selected':''}>نعم، لدي نظام</option>
        </select></div>
      </div>
      <div class="wiz-field" style="margin-top:16px"><label>ملاحظات إضافية</label><textarea id="wNotes" placeholder="أي حساسية، تفضيلات، أو تفاصيل تريد تذكرها...">${esc(wizData.notes||'')}</textarea></div>`,
    review:`
      <div class="wiz-title">${step.icon} ${step.title}</div>
      <div class="wiz-sub">${step.sub}</div>
      <div style="background:rgba(255,255,255,.03);border-radius:14px;padding:20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          ${[
            ['الاسم',me.name],
            ['البريد',me.email],
            ['الهاتف',wizData.phone||'—'],
            ['البلد',wizData.country||'—'],
            ['الوظيفة',wizData.job||'—'],
            ['جهة العمل',wizData.employer||'—'],
            ['أجر الساعة',wizData.rate ? wizData.rate+' '+ (wizData.currency||'EGP') : '—'],
            ['الراتب الشهري',wizData.salary ? money(wizData.salary)+' '+ (wizData.currency||'EGP') : '—'],
            ['الحضور',wizData.checkIn||'09:00'],
            ['الانصراف',wizData.checkOut||'17:00'],
            ['الوزن',wizData.weight?wizData.weight+' كجم':'—'],
            ['الطول',wizData.height?wizData.height+' سم':'—'],
            ['الهدف الغذائي',{lose:'خسارة وزن',maintain:'الحفاظ على الوزن',gain:'بناء عضلات'}[wizData.goal]||'—'],
          ].map(([k,v])=>`<div style="padding:10px;background:rgba(20,184,166,.06);border-radius:10px"><div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13.5px;font-weight:800;color:#fff">${esc(v)}</div></div>`).join('')}
        </div>
      </div>`
  };
  body.innerHTML = templates[step.id];
}

function collectWiz(){
  const step = WIZ_STEPS[wizStep].id;
  const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const n = id => num(g(id));
  if(step==='personal'){ Object.assign(wizData,{phone:g('wPhone'),country:g('wCountry'),city:g('wCity'),birth:g('wBirth'),gender:g('wGender')}); }
  else if(step==='job'){ Object.assign(wizData,{job:g('wJob'),employer:g('wEmp'),salType:g('wSalType'),rate:n('wRate'),salary:n('wSalary'),currency:g('wCurrency')||'EGP'}); }
  else if(step==='work'){ Object.assign(wizData,{checkIn:g('wCheckIn'),checkOut:g('wCheckOut'),workDays:n('wWorkDays'),vacations:n('wVacations'),otMul:n('wOTMul')}); }
  else if(step==='health'){ Object.assign(wizData,{weight:n('wWeight'),height:n('wHeight'),target:n('wTarget'),activity:g('wActivity')}); }
  else if(step==='nutrition'){ Object.assign(wizData,{goal:g('wGoal'),meals:n('wMeals'),diet:g('wDiet'),notes:g('wNotes')}); }
}

function wizNext(){
  collectWiz();
  if(wizStep < WIZ_STEPS.length-1){ wizStep++; renderWiz(); }
  else finishWizard();
}
function wizPrev(){ collectWiz(); if(wizStep>0){ wizStep--; renderWiz(); } }

function finishWizard(){
  const id = me.id;
  // Profile
  localStorage.setItem(K.profile+id, JSON.stringify({
    phone:wizData.phone||'', country:wizData.country||'', city:wizData.city||'',
    birth:wizData.birth||'', gender:wizData.gender||'male',
    job:wizData.job||'', employer:wizData.employer||''
  }));
  // Finance
  const hourlyRate = wizData.salType==='monthly' && wizData.salary>0 
    ? wizData.salary / ((wizData.workDays||26) * 8) 
    : (wizData.rate || 0);
  localStorage.setItem(K.finance+id, JSON.stringify({
    salType:wizData.salType||'hourly',
    rate:hourlyRate,
    salary:wizData.salary||0,
    currency:wizData.currency||'EGP',
    checkIn:wizData.checkIn||'09:00',
    checkOut:wizData.checkOut||'17:00',
    workDays:wizData.workDays||26,
    vacations:wizData.vacations||21,
    otMul:wizData.otMul||1.5,
    deductions:0, bonuses:0
  }));
  // Health
  const bmr = (()=>{
    const w=wizData.weight, h=wizData.height, a=(()=>{ if(!wizData.birth) return 25; const b=new Date(wizData.birth); const n=new Date(); let x=n.getFullYear()-b.getFullYear(); if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate())) x--; return x; })();
    if(!w||!h) return 0;
    const base = 10*w + 6.25*h - 5*a;
    return Math.round(wizData.gender==='female' ? base-161 : base+5);
  })();
  const tdee = Math.round(bmr * num(wizData.activity||1.55));
  const targetCal = wizData.goal==='lose' ? tdee-500 : wizData.goal==='gain' ? tdee+300 : tdee;
  localStorage.setItem(K.health+id, JSON.stringify({
    weight:wizData.weight||0, height:wizData.height||0, target:wizData.target||0,
    activity:wizData.activity||'1.55', bmr, tdee, targetCal,
    goal:wizData.goal||'maintain', mealsPerDay:wizData.meals||3
  }));
  // Mark onboarded
  localStorage.setItem(K.onboard+id,'1');
  toast('🎉 تم إعداد حسابك بنجاح!');
  setTimeout(showApp, 600);
}

// ══════ App ══════
function showApp(){
  document.getElementById('wizardScreen').classList.add('hidden');
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  initApp();
}

function initApp(){
  const initials = me.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = me.name;
  document.getElementById('userStatus').textContent = me.role==='admin' ? 'مدير مطلق' : 'نشط';
  
  renderNav();
  go('dashboard');
}

function renderNav(){
  const nav = document.getElementById('sidebarNav');
  const items = [
    {id:'dashboard', label:'الرئيسية', icon:'📊'},
    {id:'work', label:'الدوام والتتبع', icon:'⏰'},
    {id:'finance', label:'الحسابات المالية', icon:'💰'},
    {id:'notes', label:'المذكرة', icon:'📝'},
    {id:'schedule', label:'تنظيم الوقت', icon:'📅'},
    {id:'health', label:'الصحة واللياقة', icon:'💪'},
    {id:'nutrition', label:'النظام الغذائي', icon:'🥗'},
    {id:'workouts', label:'التمارين الرياضية', icon:'🏋️'},
    {id:'profile', label:'الملف الشخصي', icon:'👤'},
  ];
  let html = items.map(i=>`<button class="nav-btn" data-page="${i.id}" onclick="go('${i.id}')"><span class="nav-ico">${i.icon}</span><span>${i.label}</span></button>`).join('');
  if(me.role==='admin'){
    html += `<div class="nav-sep">إدارة النظام</div>
      <button class="nav-btn admin" data-page="admin" onclick="go('admin')"><span class="nav-ico">🛡️</span><span>لوحة المطورين</span></button>`;
  }
  nav.innerHTML = html;
}

function go(page){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  if(window.innerWidth<=900){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('mobOverlay').classList.remove('on'); }
  const renderers = {
    dashboard: pageDash, work: pageWork, finance: pageFinance,
    notes: pageNotes, schedule: pageSchedule, health: pageHealth,
    nutrition: pageNutrition, workouts: pageWorkouts,
    profile: pageProfile, admin: pageAdmin
  };
  document.getElementById('mainContent').innerHTML = renderers[page] ? renderers[page]() : '';
  if(page==='work') startClock();
  else stopClock();
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mobOverlay').classList.toggle('on');
}

// ══════ Storage Helpers ══════
const get = k => JSON.parse(localStorage.getItem(k+me.id) || 'null');
const set = (k,v) => localStorage.setItem(k+me.id, JSON.stringify(v));

// ══════ Calculations ══════
function getFinance(){ return get(K.finance) || {rate:0,salary:0,currency:'EGP',checkIn:'09:00',checkOut:'17:00',workDays:26,vacations:21,otMul:1.5,deductions:0,bonuses:0}; }
function getHealth(){ return get(K.health) || {weight:0,height:0,target:0,activity:'1.55',bmr:0,tdee:0,targetCal:0,goal:'maintain',mealsPerDay:3}; }
function getProfile(){ return get(K.profile) || {phone:'',country:'',city:'',birth:'',gender:'male',job:'',employer:''}; }

function rateOf(u){
  const f = getFinance.call(null) || {};
  return num(f.rate);
}
function calcHourlyRate(){
  const f = getFinance();
  if(f.salType==='monthly' && f.salary>0){
    return f.salary / (f.workDays * 8);
  }
  return num(f.rate);
}
function logEarning(log){
  const f = getFinance();
  const r = calcHourlyRate();
  return (num(log.hours) + num(log.overtime) * num(f.otMul)) * r;
}
function currentMonthStats(){
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth()+1).padStart(2,'0');
  const monthPrefix = `${y}-${m}`;
  const logs = (get(K.worklog)||[]).filter(l=>(l.date||'').startsWith(monthPrefix));
  const work = logs.filter(l=>l.status!=='vacation' && l.status!=='absent');
  const hours = sum(work.map(l=>num(l.hours)));
  const ot = sum(work.map(l=>num(l.overtime)));
  const earnings = sum(work.map(l=>logEarning(l)));
  const f = getFinance();
  const net = earnings + num(f.bonuses) - num(f.deductions);
  return {logs, work, hours, ot, earnings, net, bonuses:num(f.bonuses), deductions:num(f.deductions)};
}
function calcBMI(){
  const h = getHealth();
  if(!h.weight || !h.height) return null;
  const bmi = num(h.weight) / ((num(h.height)/100)**2);
  let label='', cls='', pos=0;
  if(bmi<18.5){ label='نحافة'; cls='blue'; pos=Math.max(3,(bmi/18.5)*22); }
  else if(bmi<25){ label='وزن طبيعي'; cls='green'; pos=25+((bmi-18.5)/6.5)*22; }
  else if(bmi<30){ label='زيادة وزن'; cls='amber'; pos=50+((bmi-25)/5)*22; }
  else{ label='سمنة'; cls='red'; pos=Math.min(97,75+((bmi-30)/10)*22); }
  return {bmi, label, cls, pos};
}
function calcAge(){
  const p = getProfile();
  if(!p.birth) return null;
  const b = new Date(p.birth), n = new Date();
  let a = n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth() || (n.getMonth()===b.getMonth() && n.getDate()<b.getDate())) a--;
  return a;
}
function macroSplit(kcal){
  // 40% carb / 30% protein / 30% fat
  return {
    protein: Math.round((kcal*0.30)/4),
    carb: Math.round((kcal*0.40)/4),
    fat: Math.round((kcal*0.30)/9)
  };
}

// ══════ PAGE: Dashboard ══════
function pageDash(){
  const st = currentMonthStats();
  const bmi = calcBMI();
  const notes = get(K.notes) || [];
  const sched = get(K.schedule) || [];
  const h = getHealth();
  const f = getFinance();
  const todayLogs = (get(K.worklog)||[]).filter(l=>l.date===today());
  const todayHours = sum(todayLogs.map(l=>num(l.hours)+num(l.overtime)));
  const vacUsed = (get(K.worklog)||[]).filter(l=>l.status==='vacation' && (l.date||'').startsWith(String(new Date().getFullYear()))).length;
  const week = last7();
  const maxH = Math.max(...week.map(w=>w.h), 1);
  
  return `
  <div class="page-head">
    <div>
      <h1>مرحباً ${esc(me.name)} 👋</h1>
      <p>${daysAr[new Date().getDay()]} ${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}</p>
    </div>
    <div class="head-pill primary">💵 ${money(calcHourlyRate())} ${f.currency} / ساعة</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-top"><div class="stat-ico">⏱</div></div>
      <div class="stat-label">ساعات اليوم</div>
      <div class="stat-value">${hoursFmt(todayHours)}<small>س</small></div>
      <div class="stat-sub">${todayLogs.length ? 'مسجّلة اليوم' : 'لم تسجل بعد'}</div>
    </div>
    <div class="stat">
      <div class="stat-top"><div class="stat-ico blue">📊</div></div>
      <div class="stat-label">ساعات الشهر</div>
      <div class="stat-value">${hoursFmt(st.hours)}<small>س</small></div>
      <div class="stat-sub">${st.work.length} يوم عمل</div>
    </div>
    <div class="stat">
      <div class="stat-top"><div class="stat-ico green">💰</div></div>
      <div class="stat-label">إجمالي المستحق</div>
      <div class="stat-value">${money(st.earnings)}<small>${f.currency}</small></div>
      <div class="stat-sub">+ ${money(st.bonuses)} إضافات</div>
    </div>
    <div class="stat">
      <div class="stat-top"><div class="stat-ico red">📉</div></div>
      <div class="stat-label">الصافي بعد الخصم</div>
      <div class="stat-value">${money(st.net)}<small>${f.currency}</small></div>
      <div class="stat-sub">− ${money(st.deductions)} خصومات</div>
    </div>
  </div>

  <div class="grid-2 mb">
    <div class="card">
      <div class="card-title"><span class="ico">📈</span> ساعات آخر 7 أيام</div>
      ${week.every(w=>w.h===0)
        ? `<div class="empty"><div class="empty-ico">📅</div><p>لا توجد ساعات مسجلة</p></div>`
        : `<div class="chart-bars">${week.map(w=>`<div class="chart-bar-col"><div class="chart-bar" style="height:${Math.max(5,(w.h/maxH)*100)}%">${w.h>0?`<span>${hoursFmt(w.h)}</span>`:''}</div><div class="chart-label">${w.lbl}</div></div>`).join('')}</div>`}
    </div>
    <div class="card">
      <div class="card-title"><span class="ico">🎯</span> ملخص سريع</div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px"><span style="color:var(--muted);font-weight:700">الوظيفة</span><b>${esc(getProfile().job||'غير محددة')}</b></div>
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px"><span style="color:var(--muted);font-weight:700">العمر</span><b>${calcAge()||'—'} سنة</b></div>
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px"><span style="color:var(--muted);font-weight:700">الوزن</span><b>${h.weight||'—'} كجم</b></div>
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px"><span style="color:var(--muted);font-weight:700">BMI</span><b>${bmi?bmi.bmi.toFixed(1)+' ('+bmi.label+')':'—'}</b></div>
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-size:14px"><span style="color:var(--muted);font-weight:700">إجازات متبقية</span><b>${Math.max(0, num(f.vacations)-vacUsed)} يوم</b></div>
        <div style="display:flex;justify-content:space-between;padding:11px 0;font-size:14px"><span style="color:var(--muted);font-weight:700">سعرات مستهدفة</span><b>${h.targetCal||'—'} سعرة</b></div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title"><span class="ico">📝</span> آخر المذكرات<span class="count">${notes.length}</span></div>
      ${notes.length===0 ? `<div class="empty"><div class="empty-ico">📝</div><p>لا توجد مذكرات</p></div>` :
      `<div style="display:flex;flex-direction:column;gap:10px">${notes.slice(0,4).map(n=>`<div style="padding:12px 14px;background:var(--soft);border-radius:10px;border-right:3px solid ${n.color||'#14B8A6'}"><div style="font-size:13.5px;font-weight:700;margin-bottom:4px">${esc(n.title||'بدون عنوان')}</div><div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.body||'')}</div></div>`).join('')}</div>`}
    </div>
    <div class="card">
      <div class="card-title"><span class="ico">📅</span> مهام اليوم<span class="count">${sched.filter(s=>s.day==='today').length}</span></div>
      ${sched.filter(s=>s.day==='today').length===0 ? `<div class="empty"><div class="empty-ico">📅</div><p>لا توجد مهام اليوم</p></div>` :
      `<div style="display:flex;flex-direction:column;gap:10px">${sched.filter(s=>s.day==='today').map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--soft);border-radius:10px;border-right:3px solid var(--primary)"><span style="font-weight:700;font-size:13.5px">${esc(s.name)}</span><span style="background:var(--primary);color:#fff;font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px">${esc(s.time)}</span></div>`).join('')}</div>`}
    </div>
  </div>`;
}

function last7(){
  const out = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = iso(d);
    const logs = (get(K.worklog)||[]).filter(l=>l.date===k);
    out.push({lbl:daysShort[d.getDay()], h: sum(logs.map(l=>num(l.hours)+num(l.overtime))), key:k});
  }
  return out;
}

// ══════ PAGE: Work ══════
function pageWork(){
  const logs = (get(K.worklog)||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const st = currentMonthStats();
  const f = getFinance();
  const todayLog = logs.find(l=>l.date===today());
  
  return `
  <div class="page-head">
    <div><h1>⏰ الدوام والتتبع</h1><p>سجّل حضورك وانصرافك واحسب ساعاتك تلقائياً</p></div>
  </div>

  <div class="clock-hero">
    <div class="clock-hero-inner">
      <div>
        <h2>${todayLog && todayLog.checkIn && !todayLog.checkOut ? 'أنت في العمل الآن ⏱' : 'سجّل حضورك'}</h2>
        <div class="clock-big-time" id="liveClock">--:--:--</div>
        <div class="clock-date" id="liveDate">${daysAr[new Date().getDay()]} ${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}</div>
      </div>
      <div class="clock-actions">
        <button class="clock-btn ${todayLog && todayLog.checkIn && !todayLog.checkOut ? 'checked-in' : ''}" onclick="toggleCheck()">
          ${todayLog && todayLog.checkIn && !todayLog.checkOut ? '🔴 تسجيل الانصراف' : '🟢 تسجيل الحضور'}
        </button>
      </div>
    </div>
  </div>

  <div class="stats mb">
    <div class="stat"><div class="stat-top"><div class="stat-ico">⏱</div></div><div class="stat-label">أيام العمل</div><div class="stat-value">${st.work.length}<small>يوم</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico blue">🕒</div></div><div class="stat-label">إجمالي الساعات</div><div class="stat-value">${hoursFmt(st.hours)}<small>س</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico amber">⚡</div></div><div class="stat-label">ساعات إضافية</div><div class="stat-value">${hoursFmt(st.ot)}<small>س</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico green">💰</div></div><div class="stat-label">أرباح الشهر</div><div class="stat-value">${money(st.earnings)}<small>${f.currency}</small></div></div>
  </div>

  <div class="card mb">
    <div class="card-title"><span class="ico">➕</span> إضافة سجل يدوي</div>
    <form onsubmit="addLog(event)">
      <div class="grid-4">
        <div class="field"><label>التاريخ</label><input type="date" id="logDate" value="${today()}" required></div>
        <div class="field"><label>وقت الحضور</label><input type="time" id="logCheckIn" value="${f.checkIn}"></div>
        <div class="field"><label>وقت الانصراف</label><input type="time" id="logCheckOut" value="${f.checkOut}"></div>
        <div class="field"><label>ساعات إضافية</label><input type="number" id="logOT" value="0" min="0" step="0.25"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>الحالة</label><select id="logStatus">
          <option value="work">عمل</option><option value="vacation">إجازة</option><option value="absent">غياب</option>
        </select></div>
        <div class="field"><label>ملاحظة</label><input id="logNote" placeholder="مثال: مشروع العميل"></div>
      </div>
      <button class="btn primary" type="submit">➕ إضافة السجل</button>
    </form>
  </div>

  <div class="card">
    <div class="card-title"><span class="ico">📋</span> سجل الدوام<span class="count">${logs.length}</span></div>
    ${logs.length===0 ? `<div class="empty"><div class="empty-ico">⏱</div><p>لا توجد سجلات بعد</p></div>` :
    `<div class="table-wrap"><table class="admin-table">
      <thead><tr><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الساعات</th><th>إضافي</th><th>الأجر</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${logs.slice(0,50).map(l=>`
        <tr>
          <td><b>${dateFmt(l.date)}</b><br><span style="font-size:11.5px;color:var(--muted)">${daysAr[new Date(l.date).getDay()]||''}</span></td>
          <td>${esc(l.checkIn||'—')}</td>
          <td>${esc(l.checkOut||'—')}</td>
          <td><b>${hoursFmt(l.hours)}</b> س</td>
          <td>${num(l.overtime)>0?`<span class="tag" style="background:#FFFBEB;color:#B45309">${hoursFmt(l.overtime)}</span>`:'—'}</td>
          <td><b style="color:var(--primary-d)">${money(logEarning(l))} ${f.currency}</b></td>
          <td>${l.status==='vacation'?'<span class="tag" style="background:#EFF6FF;color:#1D4ED8">إجازة</span>':l.status==='absent'?'<span class="tag" style="background:#FEF2F2;color:#B91C1C">غياب</span>':'<span class="tag" style="background:var(--soft);color:var(--primary-d)">عمل</span>'}</td>
          <td><button class="btn-icon del" onclick="delLog('${l.id}')">🗑️</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`}
  </div>`;
}

function startClock(){
  stopClock();
  const upd = () => {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const el = document.getElementById('liveClock');
    if(el) el.textContent = t;
  };
  upd();
  workTimer = setInterval(upd, 1000);
}
function stopClock(){ if(workTimer){ clearInterval(workTimer); workTimer = null; } }

function toggleCheck(){
  const logs = get(K.worklog) || [];
  const t = today();
  let log = logs.find(l=>l.date===t);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  if(!log){
    log = {id:uid(), date:t, checkIn:nowTime, checkOut:'', hours:0, overtime:0, status:'work', note:''};
    logs.push(log);
    toast('تم تسجيل الحضور ✅');
  } else if(!log.checkOut){
    log.checkOut = nowTime;
    // حساب الساعات
    const [hi,mi] = (log.checkIn||'09:00').split(':').map(Number);
    const [ho,mo] = nowTime.split(':').map(Number);
    let diff = (ho*60+mo) - (hi*60+mi);
    if(diff<0) diff += 24*60;
    log.hours = +(diff/60).toFixed(2);
    const f = getFinance();
    const [dci,dco] = [f.checkIn||'09:00', f.checkOut||'17:00'];
    // احتساب الإضافي لو تجاوز وقت الانصراف الرسمي
    const [dch,dcm] = dco.split(':').map(Number);
    const expectedEnd = dch*60+dcm;
    const actualEnd = ho*60+mo;
    if(actualEnd > expectedEnd){
      log.overtime = +((actualEnd-expectedEnd)/60).toFixed(2);
      log.hours = +(log.hours - log.overtime).toFixed(2);
    }
    toast(`تم تسجيل الانصراف ✅ (${hoursFmt(log.hours+log.overtime)} ساعة)`);
  } else {
    // حذف أو بدء من جديد
    if(!confirm('لديك سجل مكتمل اليوم. هل تريد بدء سجل جديد؟')) return;
    logs.splice(logs.indexOf(log),1);
    log = {id:uid(), date:t, checkIn:nowTime, checkOut:'', hours:0, overtime:0, status:'work', note:''};
    logs.push(log);
    toast('بدء سجل جديد');
  }
  set(K.worklog, logs);
  go('work');
}

function addLog(e){
  e.preventDefault();
  const logs = get(K.worklog) || [];
  const ci = document.getElementById('logCheckIn').value;
  const co = document.getElementById('logCheckOut').value;
  let hours = 0, overtime = num(document.getElementById('logOT').value);
  if(ci && co){
    const [hi,mi] = ci.split(':').map(Number);
    const [ho,mo] = co.split(':').map(Number);
    let d = (ho*60+mo)-(hi*60+mi);
    if(d<0) d += 24*60;
    hours = +(d/60).toFixed(2);
    if(overtime>0) hours = Math.max(0, +(hours - overtime).toFixed(2));
  }
  logs.push({
    id:uid(), date:document.getElementById('logDate').value,
    checkIn:ci, checkOut:co, hours, overtime,
    status:document.getElementById('logStatus').value,
    note:document.getElementById('logNote').value.trim()
  });
  set(K.worklog, logs);
  toast('تمت إضافة السجل ✅');
  go('work');
}
function delLog(id){
  if(!confirm('حذف السجل؟')) return;
  set(K.worklog, (get(K.worklog)||[]).filter(l=>l.id!==id));
  go('work');
  toast('تم الحذف');
}

// ══════ PAGE: Finance ══════
function pageFinance(){
  const f = getFinance();
  const st = currentMonthStats();
  const r = calcHourlyRate();
  
  return `
  <div class="page-head"><div><h1>💰 الحسابات المالية</h1><p>إعدادات الراتب والخصومات والإضافات</p></div></div>

  <div class="grid-2 mb">
    <div class="card">
      <div class="card-title"><span class="ico">⚙️</span> إعدادات الأجر</div>
      <form onsubmit="saveFinance(event)">
        <div class="field"><label>نظام الأجر</label>
          <select id="fType"><option value="hourly" ${f.salType==='hourly'?'selected':''}>بالساعة</option><option value="monthly" ${f.salType==='monthly'?'selected':''}>شهري</option></select>
        </div>
        <div class="grid-2">
          <div class="field"><label>أجر الساعة</label><input type="number" id="fRate" value="${f.rate||''}" min="0" step="0.5"></div>
          <div class="field"><label>الراتب الشهري</label><input type="number" id="fSalary" value="${f.salary||''}" min="0" step="50"></div>
          <div class="field"><label>أيام العمل شهرياً</label><input type="number" id="fDays" value="${f.workDays||26}" min="1" max="31"></div>
          <div class="field"><label>معامل الإضافي</label><input type="number" id="fOTMul" value="${f.otMul||1.5}" min="1" max="3" step="0.1"></div>
          <div class="field"><label>العملة</label><select id="fCurrency">
            ${['EGP','SAR','AED','USD','EUR','KWD','QAR'].map(c=>`<option value="${c}" ${f.currency===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
          <div class="field"><label>الإجازات السنوية</label><input type="number" id="fVac" value="${f.vacations||21}" min="0"></div>
        </div>
        <button type="submit" class="btn primary">💾 حفظ الإعدادات</button>
      </form>
    </div>

    <div class="card" style="background:var(--grad);color:#fff;border:none">
      <div class="card-title" style="color:#fff"><span class="ico" style="background:rgba(255,255,255,.2);color:#fff">📊</span> ملخص الشهر</div>
      <div style="background:rgba(255,255,255,.15);border-radius:14px;padding:16px;margin-bottom:16px;backdrop-filter:blur(10px)">
        <div style="font-size:12.5px;opacity:.9;font-weight:700;margin-bottom:4px">أجر الساعة المحتسب</div>
        <div style="font-size:32px;font-weight:900;letter-spacing:-1px">${money(r)} ${f.currency}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        ${[
          ['ساعات العمل', hoursFmt(st.hours)+' ساعة'],
          ['قيمة الساعات', money(st.earnings)+' '+f.currency],
          ['إضافات', '+ '+money(st.bonuses)+' '+f.currency],
          ['خصومات', '− '+money(st.deductions)+' '+f.currency]
        ].map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.15);font-size:14px"><span style="opacity:.9">${k}</span><b>${v}</b></div>`).join('')}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 0;margin-top:12px;border-top:1px solid rgba(255,255,255,.25)">
          <span style="font-weight:800">الصافي المستحق</span>
          <span style="font-size:26px;font-weight:900">${money(st.net)} ${f.currency}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="card mb">
    <div class="card-title"><span class="ico">💵</span> إضافة خصم / إضافة</div>
    <form onsubmit="addTx(event)">
      <div class="grid-3">
        <div class="field"><label>النوع</label><select id="txType"><option value="deduction">خصم</option><option value="bonus">إضافة / مكافأة</option></select></div>
        <div class="field"><label>المبلغ</label><input type="number" id="txAmount" min="0" step="0.5" placeholder="0" required></div>
        <div class="field"><label>السبب</label><input id="txReason" placeholder="مثال: مكافأة أداء"></div>
      </div>
      <button type="submit" class="btn primary">➕ إضافة العملية</button>
    </form>
  </div>

  <div class="card">
    <div class="card-title"><span class="ico">💼</span> تفاصيل الشهر الحالي</div>
    <div class="grid-4">
      ${[
        ['إجمالي ساعات العمل', hoursFmt(st.hours)+' س', '⏱'],
        ['ساعات إضافية', hoursFmt(st.ot)+' س', '⚡'],
        ['إجمالي الدخل الأساسي', money(st.earnings)+' '+f.currency, '💵'],
        ['المكافآت والإضافات', money(st.bonuses)+' '+f.currency, '🎁'],
        ['الخصومات', money(st.deductions)+' '+f.currency, '📉'],
        ['الصافي النهائي', money(st.net)+' '+f.currency, '✅'],
        ['أيام العمل', st.work.length+' يوم', '📅'],
        ['الإجازات المستخدمة', st.logs.filter(l=>l.status==='vacation').length+' يوم', '🌴']
      ].map(([l,v,i])=>`<div style="padding:16px;background:var(--soft);border-radius:12px"><div style="font-size:20px;margin-bottom:8px">${i}</div><div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:4px">${l}</div><div style="font-size:16px;font-weight:900;color:var(--primary-d)">${v}</div></div>`).join('')}
    </div>
  </div>`;
}

function saveFinance(e){
  e.preventDefault();
  const f = getFinance();
  Object.assign(f, {
    salType: document.getElementById('fType').value,
    rate: num(document.getElementById('fRate').value),
    salary: num(document.getElementById('fSalary').value),
    workDays: num(document.getElementById('fDays').value),
    otMul: num(document.getElementById('fOTMul').value),
    currency: document.getElementById('fCurrency').value,
    vacations: num(document.getElementById('fVac').value)
  });
  set(K.finance, f);
  toast('تم حفظ الإعدادات 💾');
  go('finance');
}
function addTx(e){
  e.preventDefault();
  const f = getFinance();
  const type = document.getElementById('txType').value;
  const amount = num(document.getElementById('txAmount').value);
  if(!amount) return;
  const tx = {id:uid(), date:today(), amount, reason:document.getElementById('txReason').value, type};
  f.transactions = f.transactions || [];
  f.transactions.unshift(tx);
  if(type==='deduction') f.deductions = num(f.deductions) + amount;
  else f.bonuses = num(f.bonuses) + amount;
  set(K.finance, f);
  toast('تمت الإضافة ✅');
  go('finance');
}

// ══════ PAGE: Notes ══════
function pageNotes(){
  const notes = (get(K.notes)||[]).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.date||'').localeCompare(a.date||''));
  return `
  <div class="page-head">
    <div><h1>📝 المذكرة</h1><p>دوّن أفكارك ومهامك مع إمكانية البحث والتصنيف</p></div>
    <div class="head-pill">${notes.length} ملاحظة</div>
  </div>

  <div class="note-editor">
    <div class="note-editor-title">✏️ مذكرة جديدة</div>
    <input type="text" class="title-input" id="noteTitle" placeholder="عنوان المذكرة...">
    <textarea id="noteBody" placeholder="اكتب محتوى المذكرة هنا..."></textarea>
    <div class="note-editor-footer">
      <div class="color-picker">
        ${noteColors.map((c,i)=>`<div class="color-dot ${i===0?'on':''}" data-color="${c}" style="background:${c}" onclick="pickNoteColor('${c}',this)"></div>`).join('')}
      </div>
      <button class="btn primary" onclick="addNote()">➕ إضافة المذكرة</button>
    </div>
  </div>

  <div class="notes-toolbar">
    <div class="notes-search"><input id="noteSearch" placeholder="ابحث في المذكرات..." oninput="renderNotesList()"></div>
    <select id="noteSort" style="padding:12px 16px;border-radius:12px;border:1.5px solid var(--line);background:#fff;font-family:inherit;font-weight:700;font-size:13.5px" onchange="renderNotesList()">
      <option value="newest">الأحدث أولاً</option>
      <option value="oldest">الأقدم أولاً</option>
      <option value="title">حسب العنوان</option>
    </select>
  </div>

  <div class="notes-grid" id="notesList"></div>`;
}

function pickNoteColor(c, el){
  selectedNoteColor = c;
  document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('on'));
  el.classList.add('on');
}

function addNote(){
  const title = document.getElementById('noteTitle').value.trim();
  const body = document.getElementById('noteBody').value.trim();
  if(!title && !body){ toast('اكتب شيئاً على الأقل','err'); return; }
  const notes = get(K.notes) || [];
  notes.unshift({
    id:uid(), title:title||'بدون عنوان', body, color:selectedNoteColor,
    date:new Date().toISOString(), pinned:false
  });
  set(K.notes, notes);
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteBody').value = '';
  toast('تمت إضافة المذكرة ✨');
  go('notes');
}

function renderNotesList(){
  const all = (get(K.notes)||[]).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.date||'').localeCompare(a.date||''));
  const q = (document.getElementById('noteSearch')?.value || '').toLowerCase().trim();
  const sort = document.getElementById('noteSort')?.value || 'newest';
  let filtered = all.filter(n => !q || n.title.toLowerCase().includes(q) || (n.body||'').toLowerCase().includes(q));
  if(sort==='oldest') filtered = [...filtered].reverse();
  else if(sort==='title') filtered = [...filtered].sort((a,b)=>a.title.localeCompare(b.title));
  
  const el = document.getElementById('notesList');
  if(!filtered.length){
    el.innerHTML = `<div style="grid-column:1/-1" class="empty"><div class="empty-ico">📝</div><p>${q?'لا توجد نتائج':'لا توجد مذكرات بعد'}</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(n=>`
    <div class="note-item ${n.pinned?'pinned':''}" style="border-right-color:${n.color||'#14B8A6'}" onclick="openNote('${n.id}')">
      <h4>${esc(n.title)}</h4>
      ${n.body?`<p>${esc(n.body.slice(0,180))}${n.body.length>180?'...':''}</p>`:''}
      <div class="note-meta">
        <span>${dateFmt(n.date)}</span>
        <div class="note-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="pinNote('${n.id}')" title="${n.pinned?'إلغاء التثبيت':'تثبيت'}">📌</button>
          <button class="btn-icon del" onclick="delNote('${n.id}')">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}

function openNote(id){
  const n = (get(K.notes)||[]).find(x=>x.id===id);
  if(!n) return;
  modal({
    title:n.title, wide:true, footer:'حفظ',
    body:`<div class="field"><label>العنوان</label><input id="edTitle" value="${esc(n.title)}"></div>
          <div class="field"><label>المحتوى</label><textarea id="edBody" style="min-height:220px">${esc(n.body||'')}</textarea></div>`,
    onSubmit:fd=>{
      const notes = get(K.notes) || [];
      const idx = notes.findIndex(x=>x.id===id);
      if(idx>=0){
        notes[idx].title = fd.get('edTitle') || document.getElementById('edTitle').value;
        notes[idx].body = document.getElementById('edBody').value;
        // إعادة الحفظ
        const t = document.getElementById('edTitle').value.trim() || 'بدون عنوان';
        const b = document.getElementById('edBody').value;
        notes[idx].title = t; notes[idx].body = b;
        set(K.notes, notes);
        toast('تم الحفظ 💾');
        renderNotesList();
      }
    }
  });
}

function pinNote(id){
  const notes = get(K.notes) || [];
  const n = notes.find(x=>x.id===id);
  if(n){ n.pinned = !n.pinned; set(K.notes, notes); renderNotesList(); toast(n.pinned?'تم التثبيت 📌':'تم إلغاء التثبيت'); }
}
function delNote(id){
  if(!confirm('حذف المذكرة؟')) return;
  set(K.notes, (get(K.notes)||[]).filter(n=>n.id!==id));
  renderNotesList(); toast('تم الحذف');
}

// ══════ PAGE: Schedule ══════
function pageSchedule(){
  const items = get(K.schedule) || [];
  const days = ['saturday','sunday','monday','tuesday','wednesday','thursday','friday'];
  const labels = {saturday:'السبت',sunday:'الأحد',monday:'الإثنين',tuesday:'الثلاثاء',wednesday:'الأربعاء',thursday:'الخميس',friday:'الجمعة'};
  return `
  <div class="page-head"><div><h1>📅 تنظيم الوقت</h1><p>نظّم مهامك على مدار الأسبوع</p></div></div>

  <div class="card mb">
    <div class="card-title"><span class="ico">➕</span> إضافة مهمة</div>
    <form onsubmit="addSched(event)">
      <div class="grid-4">
        <div class="field"><label>اسم المهمة</label><input id="sName" required placeholder="مثال: اجتماع الفريق"></div>
        <div class="field"><label>اليوم</label><select id="sDay">
          <option value="today">اليوم</option><option value="tomorrow">غداً</option>
          ${days.map(d=>`<option value="${d}">${labels[d]}</option>`).join('')}
        </select></div>
        <div class="field"><label>من</label><input type="time" id="sFrom" value="09:00" required></div>
        <div class="field"><label>إلى</label><input type="time" id="sTo" value="10:00"></div>
      </div>
      <button type="submit" class="btn primary">➕ إضافة للمجدول</button>
    </form>
  </div>

  <div class="schedule-grid">
    ${days.map(d=>{
      const dayItems = items.filter(i=>i.day===d).sort((a,b)=>(a.from||'').localeCompare(b.from||''));
      return `<div class="day-col">
        <h5>${labels[d]} ${dayItems.length?`<span>${dayItems.length}</span>`:''}</h5>
        ${dayItems.length===0?`<div style="text-align:center;padding:16px;color:var(--dim);font-size:12px">لا توجد مهام</div>`:
        dayItems.map(i=>`<div class="day-slot" style="border-right-color:${i.color||'#14B8A6'}"><b>${esc(i.from)} ${i.to?'→ '+esc(i.to):''}</b><span>${esc(i.name)}</span><button class="btn-icon del" style="float:left;width:22px;height:22px;font-size:12px" onclick="delSched('${i.id}')">✕</button></div>`).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function addSched(e){
  e.preventDefault();
  const items = get(K.schedule) || [];
  items.push({
    id:uid(), name:document.getElementById('sName').value.trim(),
    day:document.getElementById('sDay').value,
    from:document.getElementById('sFrom').value,
    to:document.getElementById('sTo').value,
    color:noteColors[items.length % noteColors.length]
  });
  set(K.schedule, items);
  toast('تمت إضافة المهمة 📅');
  go('schedule');
}
function delSched(id){
  set(K.schedule, (get(K.schedule)||[]).filter(i=>i.id!==id));
  go('schedule'); toast('تم الحذف');
}

// ══════ PAGE: Health ══════
function pageHealth(){
  const h = getHealth();
  const b = calcBMI();
  const age = calcAge();
  return `
  <div class="page-head"><div><h1>💪 الصحة واللياقة</h1><p>تابع وزنك ومؤشر كتلة الجسم</p></div></div>

  <div class="grid-2 mb">
    <div class="card">
      <div class="card-title"><span class="ico">📏</span> بياناتك</div>
      <form onsubmit="saveHealth(event)">
        <div class="grid-2">
          <div class="field"><label>الوزن (كجم)</label><input type="number" id="hWeight" value="${h.weight||''}" step="0.1" min="0"></div>
          <div class="field"><label>الطول (سم)</label><input type="number" id="hHeight" value="${h.height||''}" min="0"></div>
          <div class="field"><label>الوزن المستهدف</label><input type="number" id="hTarget" value="${h.target||''}" step="0.1" min="0"></div>
          <div class="field"><label>مستوى النشاط</label><select id="hActivity">
            <option value="1.2" ${h.activity==='1.2'?'selected':''}>قليل الحركة</option>
            <option value="1.375" ${h.activity==='1.375'?'selected':''}>نشاط خفيف</option>
            <option value="1.55" ${h.activity==='1.55'?'selected':''}>نشاط متوسط</option>
            <option value="1.725" ${h.activity==='1.725'?'selected':''}>نشاط عالي</option>
            <option value="1.9" ${h.activity==='1.9'?'selected':''}>رياضي محترف</option>
          </select></div>
        </div>
        <button type="submit" class="btn primary">💾 حفظ البيانات</button>
      </form>
      <div class="mt" style="padding-top:16px;border-top:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:var(--muted);font-weight:700">العمر</span><b>${age||'—'} سنة</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:var(--muted);font-weight:700">BMR (معدل الأيض)</span><b>${h.bmr||'—'} سعرة</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:var(--muted);font-weight:700">TDEE (سعرات الصيانة)</span><b>${h.tdee||'—'} سعرة</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:var(--muted);font-weight:700">السعرات المستهدفة</span><b style="color:var(--primary-d)">${h.targetCal||'—'} سعرة</b></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="ico">📊</span> مؤشر كتلة الجسم</div>
      ${b ? `
        <div class="bmi-hero">
          <div class="bmi-num">${b.bmi.toFixed(1)}</div>
          <div class="bmi-txt">${b.label}</div>
        </div>
        <div class="bmi-bar"><div class="bmi-marker" style="right:${b.pos}%"></div></div>
        <div class="bmi-legend"><span>نحافة</span><span>طبيعي</span><span>زيادة</span><span>سمنة</span></div>
      ` : `<div class="empty"><div class="empty-ico">📏</div><p>أدخل وزنك وطولك لحساب المؤشر</p></div>`}
    </div>
  </div>`;
}

function saveHealth(e){
  e.preventDefault();
  const h = getHealth();
  h.weight = num(document.getElementById('hWeight').value);
  h.height = num(document.getElementById('hHeight').value);
  h.target = num(document.getElementById('hTarget').value);
  h.activity = document.getElementById('hActivity').value;
  // إعادة حساب BMR/TDEE
  const p = getProfile();
  const a = calcAge() || 25;
  if(h.weight && h.height){
    const base = 10*h.weight + 6.25*h.height - 5*a;
    h.bmr = Math.round(p.gender==='female' ? base-161 : base+5);
    h.tdee = Math.round(h.bmr * num(h.activity));
    h.targetCal = h.goal==='lose' ? h.tdee-500 : h.goal==='gain' ? h.tdee+300 : h.tdee;
  }
  set(K.health, h);
  toast('تم حفظ البيانات 💪');
  go('health');
}

// ══════ PAGE: Nutrition ══════
function pageNutrition(){
  const h = getHealth();
  const meals = get(K.meals) || [];
  const targetCal = h.targetCal || 2000;
  const macros = macroSplit(targetCal);
  const todayMeals = meals.filter(m=>m.date===today());
  const todayCal = sum(todayMeals.map(m=>num(m.kcal)));
  const pct = Math.min(100, (todayCal/targetCal)*100);
  const mealNames = {breakfast:'فطور',lunch:'غداء',dinner:'عشاء',snack:'سناك'};
  
  return `
  <div class="page-head"><div><h1>🥗 النظام الغذائي</h1><p>تابع سعراتك ووجباتك اليومية</p></div></div>

  <div class="stats mb">
    <div class="stat"><div class="stat-top"><div class="stat-ico amber">🔥</div></div><div class="stat-label">سعرات اليوم</div><div class="stat-value">${todayCal}<small>/ ${targetCal}</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico blue">🥩</div></div><div class="stat-label">بروتين مستهدف</div><div class="stat-value">${macros.protein}<small>جم</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico green">🍞</div></div><div class="stat-label">كارب مستهدف</div><div class="stat-value">${macros.carb}<small>جم</small></div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico red">🥑</div></div><div class="stat-label">دهون مستهدفة</div><div class="stat-value">${macros.fat}<small>جم</small></div></div>
  </div>

  <div class="card mb">
    <div class="card-title"><span class="ico">🔥</span> تقدمك اليومي</div>
    <div style="height:14px;background:#E2E8F0;border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--grad);border-radius:99px;transition:width .5s"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12.5px;color:var(--muted);font-weight:700"><span>${pct.toFixed(0)}% من هدفك</span><span>${targetCal-todayCal} سعرة متبقية</span></div>
  </div>

  <div class="card mb">
    <div class="card-title"><span class="ico">➕</span> إضافة وجبة</div>
    <form onsubmit="addMeal(event)">
      <div class="grid-3">
        <div class="field"><label>نوع الوجبة</label><select id="mType">
          <option value="breakfast">فطور</option><option value="lunch">غداء</option>
          <option value="dinner">عشاء</option><option value="snack">سناك</option>
        </select></div>
        <div class="field"><label>الوصف</label><input id="mDesc" placeholder="مثال: 3 بيضات + توست" required></div>
        <div class="field"><label>السعرات</label><input type="number" id="mKcal" min="0" placeholder="350" required></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>بروتين (جم)</label><input type="number" id="mProt" min="0" placeholder="25"></div>
        <div class="field"><label>كارب (جم)</label><input type="number" id="mCarb" min="0" placeholder="40"></div>
        <div class="field"><label>دهون (جم)</label><input type="number" id="mFat" min="0" placeholder="15"></div>
      </div>
      <button type="submit" class="btn primary">➕ إضافة الوجبة</button>
    </form>
  </div>

  <div class="card">
    <div class="card-title"><span class="ico">🍽️</span> وجبات اليوم<span class="count">${todayMeals.length}</span></div>
    ${todayMeals.length===0 ? `<div class="empty"><div class="empty-ico">🍽️</div><p>لم تسجل أي وجبة اليوم</p></div>` :
    `<div style="display:grid;gap:12px">${todayMeals.map(m=>`
      <div class="meal-card">
        <div class="meal-ico">${{breakfast:'🌅',lunch:'🍽️',dinner:'🌙',snack:'🍎'}[m.type]||'🍽️'}</div>
        <div class="meal-info">
          <h4>${mealNames[m.type]||'وجبة'} — ${esc(m.desc)}</h4>
          <div class="meal-macros">
            <div class="meal-macro kcal"><b>${m.kcal}</b>سعرة</div>
            ${m.prot?`<div class="meal-macro prot"><b>${m.prot}جم</b>بروتين</div>`:''}
            ${m.carb?`<div class="meal-macro carb"><b>${m.carb}جم</b>كارب</div>`:''}
            ${m.fat?`<div class="meal-macro fat"><b>${m.fat}جم</b>دهون</div>`:''}
          </div>
        </div>
        <button class="btn-icon del" onclick="delMeal('${m.id}')">🗑️</button>
      </div>`).join('')}</div>`}
  </div>`;
}

function addMeal(e){
  e.preventDefault();
  const meals = get(K.meals) || [];
  meals.unshift({
    id:uid(), date:today(),
    type:document.getElementById('mType').value,
    desc:document.getElementById('mDesc').value.trim(),
    kcal:num(document.getElementById('mKcal').value),
    prot:num(document.getElementById('mProt').value),
    carb:num(document.getElementById('mCarb').value),
    fat:num(document.getElementById('mFat').value)
  });
  set(K.meals, meals);
  toast('تمت إضافة الوجبة 🍽️');
  go('nutrition');
}
function delMeal(id){
  set(K.meals, (get(K.meals)||[]).filter(m=>m.id!==id));
  go('nutrition'); toast('تم الحذف');
}

// ══════ PAGE: Workouts ══════
function pageWorkouts(){
  const workouts = get(K.workouts) || [];
  const daysAr2 = {saturday:'السبت',sunday:'الأحد',monday:'الإثنين',tuesday:'الثلاثاء',wednesday:'الأربعاء',thursday:'الخميس',friday:'الجمعة'};
  const grouped = {};
  workouts.forEach(w => { (grouped[w.day] = grouped[w.day] || []).push(w); });
  
  return `
  <div class="page-head"><div><h1>🏋️ التمارين الرياضية</h1><p>جدولك الرياضي الأسبوعي</p></div></div>

  <div class="card mb">
    <div class="card-title"><span class="ico">➕</span> إضافة تمرين</div>
    <form onsubmit="addWorkout(event)">
      <div class="grid-4">
        <div class="field"><label>اليوم</label><select id="wDay">
          ${Object.entries(daysAr2).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select></div>
        <div class="field"><label>اسم التمرين</label><input id="wName" placeholder="مثال: بنش برس" required></div>
        <div class="field"><label>المجموعات</label><input type="number" id="wSets" value="4" min="1"></div>
        <div class="field"><label>التكرارات</label><input id="wReps" placeholder="12" ></div>
      </div>
      <button type="submit" class="btn primary">➕ إضافة التمرين</button>
    </form>
  </div>

  <div class="grid-2">
    ${Object.keys(daysAr2).map(d=>{
      const items = grouped[d] || [];
      return `<div class="card">
        <div class="card-title"><span class="ico">💪</span> ${daysAr2[d]}<span class="count">${items.length}</span></div>
        ${items.length===0 ? `<div style="text-align:center;padding:16px;color:var(--dim);font-size:13px">يوم راحة</div>` :
        `<div style="display:flex;flex-direction:column;gap:8px">${items.map(w=>`
          <div class="workout-item">
            <span class="workout-name">${esc(w.name)}</span>
            <span class="workout-volume">${w.sets}×${esc(w.reps||'-')}</span>
            <button class="btn-icon del" onclick="delWorkout('${w.id}')">🗑️</button>
          </div>`).join('')}</div>`}
      </div>`;
    }).join('')}
  </div>`;
}
function addWorkout(e){
  e.preventDefault();
  const ws = get(K.workouts) || [];
  ws.push({id:uid(), day:document.getElementById('wDay').value, name:document.getElementById('wName').value.trim(), sets:num(document.getElementById('wSets').value), reps:document.getElementById('wReps').value});
  set(K.workouts, ws);
  toast('تمت إضافة التمرين 💪');
  go('workouts');
}
function delWorkout(id){
  set(K.workouts, (get(K.workouts)||[]).filter(w=>w.id!==id));
  go('workouts'); toast('تم الحذف');
}

// ══════ PAGE: Profile ══════
function pageProfile(){
  const p = getProfile();
  const initials = me.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
  return `
  <div class="page-head"><div><h1>👤 الملف الشخصي</h1><p>بياناتك الشخصية والوظيفية</p></div></div>

  <div class="profile-hero">
    <div class="profile-av-lg">${initials}</div>
    <div class="profile-hero-info">
      <h2>${esc(me.name)}</h2>
      <p>${esc(me.email)}</p>
      <span class="role">${me.role==='admin'?'🛡️ مدير مطلق':'👤 عضو'}</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title"><span class="ico">📋</span> البيانات الشخصية</div>
      <form onsubmit="saveProfile(event)">
        <div class="grid-2">
          <div class="field"><label>الاسم الكامل</label><input id="pName" value="${esc(me.name)}" required></div>
          <div class="field"><label>رقم الهاتف</label><input id="pPhone" value="${esc(p.phone||'')}" placeholder="+20 1xx xxx xxxx"></div>
          <div class="field"><label>الدولة</label><input id="pCountry" value="${esc(p.country||'')}"></div>
          <div class="field"><label>المدينة</label><input id="pCity" value="${esc(p.city||'')}"></div>
          <div class="field"><label>تاريخ الميلاد</label><input type="date" id="pBirth" value="${p.birth||''}"></div>
          <div class="field"><label>النوع</label><select id="pGender">
            <option value="male" ${p.gender==='male'?'selected':''}>ذكر</option>
            <option value="female" ${p.gender==='female'?'selected':''}>أنثى</option>
          </select></div>
        </div>
        <button type="submit" class="btn primary">💾 حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title"><span class="ico">💼</span> البيانات الوظيفية</div>
      <form onsubmit="saveProfile(event)">
        <div class="field"><label>المسمى الوظيفي</label><input id="pJob" value="${esc(p.job||'')}" placeholder="مثال: مهندس برمجيات"></div>
        <div class="field"><label>جهة العمل</label><input id="pEmployer" value="${esc(p.employer||'')}"></div>
        <button type="submit" class="btn primary">💾 حفظ</button>
      </form>
      <div class="mt" style="padding-top:16px;border-top:1px solid var(--line)">
        <button class="btn danger block" onclick="resetOnboarding()">🔄 إعادة إجراء الإعداد الأولي</button>
      </div>
    </div>
  </div>`;
}
function saveProfile(e){
  e.preventDefault();
  const p = getProfile();
  const nameEl = document.getElementById('pName');
  if(nameEl && nameEl.value.trim()){ me.name = nameEl.value.trim(); }
  const users = getUsers();
  const idx = users.findIndex(u=>u.id===me.id);
  if(idx>=0){ users[idx].name = me.name; saveUsers(users); }
  localStorage.setItem(K.session, JSON.stringify(me));
  if(nameEl) p.name = nameEl.value.trim();
  if(document.getElementById('pPhone')) p.phone = document.getElementById('pPhone').value.trim();
  if(document.getElementById('pCountry')) p.country = document.getElementById('pCountry').value.trim();
  if(document.getElementById('pCity')) p.city = document.getElementById('pCity').value.trim();
  if(document.getElementById('pBirth')) p.birth = document.getElementById('pBirth').value;
  if(document.getElementById('pGender')) p.gender = document.getElementById('pGender').value;
  if(document.getElementById('pJob')) p.job = document.getElementById('pJob').value.trim();
  if(document.getElementById('pEmployer')) p.employer = document.getElementById('pEmployer').value.trim();
  set(K.profile, p);
  toast('تم حفظ البيانات 💾');
  initApp(); go('profile');
}
function resetOnboarding(){
  if(!confirm('سيتم إعادة فتح خطوات الإعداد الأولي. متابعة؟')) return;
  localStorage.removeItem(K.onboard+me.id);
  startWizard();
}

// ══════ PAGE: Admin ══════
function pageAdmin(){
  if(me.role!=='admin') return `<div class="card"><div class="empty"><div class="empty-ico">🛡️</div><p>لا تملك صلاحية الوصول</p></div></div>`;
  const users = getUsers();
  const devs = users.filter(u=>u.role==='admin');
  let totalNotes = 0, totalWorkouts = 0, totalLogs = 0;
  users.forEach(u=>{
    totalNotes += (JSON.parse(localStorage.getItem(K.notes+u.id)||'[]')).length;
    totalWorkouts += (JSON.parse(localStorage.getItem(K.workouts+u.id)||'[]')).length;
    totalLogs += (JSON.parse(localStorage.getItem(K.worklog+u.id)||'[]')).length;
  });
  
  return `
  <div class="page-head">
    <div><h1>🛡️ لوحة المطورين</h1><p>صلاحيات مطلقة — إدارة جميع المستخدمين</p></div>
    <div class="head-pill" style="background:#FEF2F2;color:#B91C1C;border-color:#FECACA">🔓 صلاحيات مطلقة</div>
  </div>

  <div class="stats mb">
    <div class="stat"><div class="stat-top"><div class="stat-ico">👥</div></div><div class="stat-label">إجمالي المستخدمين</div><div class="stat-value">${users.length}</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico red">🛡️</div></div><div class="stat-label">حسابات المطورين</div><div class="stat-value">${devs.length}</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico amber">📝</div></div><div class="stat-label">إجمالي المذكرات</div><div class="stat-value">${totalNotes}</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-ico blue">⏱</div></div><div class="stat-label">سجلات الدوام</div><div class="stat-value">${totalLogs}</div></div>
  </div>

  <div class="card">
    <div class="card-title"><span class="ico">👥</span> قائمة المستخدمين</div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>الاسم</th><th>البريد</th><th>الصلاحية</th><th>مذكرات</th><th>دوام</th><th>إجراءات</th></tr></thead>
      <tbody>${users.map(u=>{
        const n = (JSON.parse(localStorage.getItem(K.notes+u.id)||'[]')).length;
        const w = (JSON.parse(localStorage.getItem(K.worklog+u.id)||'[]')).length;
        return `<tr>
          <td><b>${esc(u.name)}</b></td>
          <td style="direction:ltr;text-align:right">${esc(u.email)}</td>
          <td><span class="tag ${u.role==='admin'?'admin':'user'}">${u.role==='admin'?'🛡️ مدير':'👤 مستخدم'}</span></td>
          <td>${n}</td><td>${w}</td>
          <td>
            <button class="btn sm ghost" onclick="viewUser('${u.id}')">👁 عرض</button>
            ${u.role!=='admin'&&u.id!==me.id?`<button class="btn sm danger" onclick="removeUser('${u.id}')">🗑</button>`:''}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

function viewUser(id){
  const u = getUsers().find(x=>x.id===id);
  if(!u) return;
  const p = JSON.parse(localStorage.getItem(K.profile+id)||'{}');
  const f = JSON.parse(localStorage.getItem(K.finance+id)||'{}');
  const h = JSON.parse(localStorage.getItem(K.health+id)||'{}');
  const notes = JSON.parse(localStorage.getItem(K.notes+id)||'[]');
  const logs = JSON.parse(localStorage.getItem(K.worklog+id)||'[]');
  const meals = JSON.parse(localStorage.getItem(K.meals+id)||'[]');
  modal({
    title:`بيانات: ${u.name}`, wide:true, hideSubmit:true,
    body:`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      ${[
        ['الاسم', u.name],
        ['البريد', u.email],
        ['الصلاحية', u.role==='admin'?'مدير مطلق':'مستخدم'],
        ['الهاتف', p.phone||'—'],
        ['البلد', p.country||'—'],
        ['الوظيفة', p.job||'—'],
        ['جهة العمل', p.employer||'—'],
        ['أجر الساعة', (f.rate||0)+' '+ (f.currency||'EGP')],
        ['الراتب الشهري', (f.salary||0)+' '+ (f.currency||'EGP')],
        ['الوزن', (h.weight||0)+' كجم'],
        ['الطول', (h.height||0)+' سم'],
        ['السعرات المستهدفة', (h.targetCal||0)+' سعرة'],
        ['عدد المذكرات', notes.length],
        ['سجلات الدوام', logs.length],
        ['الوجبات المسجلة', meals.length]
      ].map(([k,v])=>`<div style="padding:12px;background:var(--soft);border-radius:10px"><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:14px;font-weight:800">${esc(String(v))}</div></div>`).join('')}
    </div>`
  });
}
function removeUser(id){
  if(!confirm('سيتم حذف المستخدم وجميع بياناته نهائياً. متابعة؟')) return;
  saveUsers(getUsers().filter(u=>u.id!==id));
  [K.profile, K.finance, K.health, K.notes, K.schedule, K.workouts, K.meals, K.worklog, K.onboard].forEach(k=>localStorage.removeItem(k+id));
  toast('تم حذف المستخدم');
  go('admin');
}

// ══════ Init ══════
(function boot(){
  getUsers();
  try{
    const sess = JSON.parse(localStorage.getItem(K.session));
    if(sess){
      const u = getUsers().find(x=>x.id===sess.id);
      if(u){ me = u; loginAs(u); }
    }
  }catch(e){}
})();

// Reveal note list after render
const origGo = window.go;
window.go = function(p){
  origGo(p);
  if(p==='notes') setTimeout(renderNotesList, 0);
};

// Global exposure
Object.assign(window, {
  switchTab, handleLogin, handleRegister, handleLogout,
  wizNext, wizPrev, go, toggleSidebar,
  toggleCheck, addLog, delLog, saveFinance, addTx,
  addNote, openNote, pinNote, delNote, pickNoteColor, renderNotesList,
  addSched, delSched, saveHealth, addMeal, delMeal, addWorkout, delWorkout,
  saveProfile, resetOnboarding, closeModal, viewUser, removeUser
});
