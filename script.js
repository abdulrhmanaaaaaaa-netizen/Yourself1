(() => {
  'use strict';

  const STORAGE_KEY = 'yourself_v1_users';
  const SESSION_KEY = 'yourself_v1_session';
  const PREF_KEY = 'yourself_v1_pref';

  const DEV_USERS = [
    {
      email: 'Hoang@gmail.com',
      password: 'Hoang123',
      name: 'Hoang',
      role: 'developer'
    },
    {
      email: 'Haider@gmail.com',
      password: 'asdfghjkl123',
      name: 'Haider',
      role: 'developer'
    }
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
    workTimer: {
      running: false,
      startedAt: null,
      elapsed: 0
    },
    focusTimer: {
      running: false,
      seconds: 25 * 60
    },
    focusInterval: null,
    workInterval: null,
    devAuthenticated: false
  };

  const qs = (s, p = document) =>
    p.querySelector(s);

  const qsa = (s, p = document) =>
    [...p.querySelectorAll(s)];

  const $ = id =>
    document.getElementById(id);

  const defaults = {
    profile: {
      name: '',
      job: '',
      salaryType: 'monthly',
      salary: 0,
      workDays: 5,
      workStart: '08:30',
      workEnd: '17:00',
      offDays: 'الجمعة، السبت',

      wake: '07:00',
      sleep: '23:00',
      goWork: '08:00',
      backWork: '17:30',

      goal: 'تنظيم الوقت',
      activity: 'moderate',

      age: '',
      weight: '',
      height: ''
    },

    finance: {
      items: []
    },

    workControl: {
      date: null,
      manualStartAt: null,
      manualStopAt: null
    },

    workLogs: [],

    notes: [],

    planner: [],

    habits: [
      {
        id: 'water',
        title: 'الماء',
        meta: 'حاول الحفاظ على الترطيب خلال يومك',
        done: false
      },
      {
        id: 'movement',
        title: 'حركة بسيطة',
        meta: 'مشي أو تمدد أو نشاط يناسبك',
        done: false
      },
      {
        id: 'meal',
        title: 'وجبة متوازنة',
        meta: 'اختر وجبة متنوعة ومناسبة لك',
        done: false
      },
      {
        id: 'sleep',
        title: 'موعد نوم منتظم',
        meta: 'اجعل وقت النوم قريبًا من المعتاد',
        done: false
      }
    ],

    healthPlan: 'balanced',
    setupComplete: false,
    createdAt: new Date().toISOString()
  };

  const stateFromUser = user => {
    state.user = user;

    state.selectedPlan =
      user.healthPlan || 'balanced';

    state.plannerDate =
      new Date();

    state.page =
      'dashboard';

    state.workTimer = {
      mode: 'auto',
      running: false,
      startedAt: null,
      elapsed: 0
    };
  };

  const cloneDefaults = () =>
    JSON.parse(JSON.stringify(defaults));

  function readUsers() {
    try {
      return JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '[]'
      );
    } catch {
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(users)
    );
  }

  function readPref() {
    try {
      return JSON.parse(
        localStorage.getItem(PREF_KEY) || '{}'
      );
    } catch {
      return {};
    }
  }

  function updateCurrentUser(patch) {
    const users = readUsers();

    const idx = users.findIndex(
      u =>
        u.email.toLowerCase() ===
        state.user.email.toLowerCase()
    );

    if (idx < 0) return;

    users[idx] = {
      ...users[idx],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    state.user =
      users[idx];

    writeUsers(users);
  }

  function normalizeEmail(email) {
    return email
      .trim()
      .toLowerCase();
  }

  function fmtMoney(n) {
    return `${Math.round(
      Number(n) || 0
    ).toLocaleString('en-US')} EGP`;
  }

  function fmtMoneyNoCurrency(n) {
    return Math.round(
      Number(n) || 0
    ).toLocaleString('en-US');
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat(
      'ar-EG',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }
    ).format(date);
  }

  function shortDate(date) {
    return new Intl.DateTimeFormat(
      'ar-EG',
      {
        day: '2-digit',
        month: '2-digit'
      }
    ).format(date);
  }

  function timeDiffHours(start, end) {
    const [sh, sm] =
      String(start || '00:00')
        .split(':')
        .map(Number);

    const [eh, em] =
      String(end || '00:00')
        .split(':')
        .map(Number);

    let mins =
      eh * 60 +
      em -
      (sh * 60 + sm);

    if (mins < 0) {
      mins += 24 * 60;
    }

    return mins / 60;
  }

  function localKey(date = new Date()) {
    const y =
      date.getFullYear();

    const m =
      String(date.getMonth() + 1)
        .padStart(2, '0');

    const d =
      String(date.getDate())
        .padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  function dateAtTime(date, time) {
    const d =
      new Date(date);

    const [h, m] =
      String(time || '00:00')
        .split(':')
        .map(Number);

    d.setHours(
      h || 0,
      m || 0,
      0,
      0
    );

    return d;
  }

  function offDayIndexes(
    profile = defaults.profile
  ) {
    const raw =
      String(
        profile.offDays || ''
      ).toLowerCase();

    const map = {
      'الاحد': 0,
      'الأحد': 0,
      'sun': 0,
      'sunday': 0,

      'الاثنين': 1,
      'الإثنين': 1,
      'mon': 1,
      'monday': 1,

      'الثلاثاء': 2,
      'tue': 2,
      'tuesday': 2,

      'الاربعاء': 3,
      'الأربعاء': 3,
      'wed': 3,
      'wednesday': 3,

      'الخميس': 4,
      'thu': 4,
      'thursday': 4,

      'الجمعة': 5,
      'fri': 5,
      'friday': 5,

      'السبت': 6,
      'sat': 6,
      'saturday': 6
    };

    const indexes = [];

    raw
      .split(/[،,|+\/؛]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(name => {
        if (
          map[name] !==
          undefined
        ) {
          indexes.push(
            map[name]
          );
        }
      });

    return [
      ...new Set(indexes)
    ];
  }

  function isWorkday(
    date = new Date(),
    user = state.user
  ) {
    const p =
      user?.profile ||
      defaults.profile;

    const off =
      offDayIndexes(p);

    if (off.length) {
      return !off.includes(
        date.getDay()
      );
    }

    const days =
      Number(p.workDays) || 5;

    if (days >= 7) {
      return true;
    }

    if (days === 6) {
      return date.getDay() !== 5;
    }

    if (days === 5) {
      return (
        date.getDay() >= 1 &&
        date.getDay() <= 5
      );
    }

    return (
      date.getDay() >= 1 &&
      date.getDay() <= days
    );
  }

  function workWindow(
    date = new Date(),
    user = state.user
  ) {
    const p =
      user?.profile ||
      defaults.profile;

    const start =
      dateAtTime(
        date,
        p.workStart || '08:30'
      );

    let end =
      dateAtTime(
        date,
        p.workEnd || '17:00'
      );

    if (end <= start) {
      end.setDate(
        end.getDate() + 1
      );
    }

    return {
      start,
      end
    };
  }

  function automaticWorkSnapshot(
    date = new Date()
  ) {
    const p =
      state.user?.profile ||
      defaults.profile;

    if (!isWorkday(date)) {
      return {
        mode: 'off',
        state: 'إجازة اليوم',
        meta: 'لا يوجد احتساب تلقائي اليوم',
        elapsedMs: 0,
        rate: hourlyRate()
      };
    }

    const now =
      new Date();

    const {
      start,
      end
    } = workWindow(date);

    const elapsedMs =
      Math.max(
        0,
        Math.min(
          now.getTime(),
          end.getTime()
        ) -
        start.getTime()
      );

    let currentState =
      'قبل بداية العمل';

    if (now >= end) {
      currentState =
        'انتهى وقت العمل';
    } else if (now >= start) {
      currentState =
        'يعمل تلقائيًا';
    }

    const meta =
      now < start
        ? `يبدأ تلقائيًا ${p.workStart}`
        : now >= end
          ? `انتهى تلقائيًا ${p.workEnd}`
          : `يتوقف تلقائيًا ${p.workEnd}`;

    return {
      mode: 'auto',
      state: currentState,
      meta,
      elapsedMs,
      start,
      end,
      rate: hourlyRate()
    };
  }

  function currentWorkSnapshot() {
    const today =
      localKey();

    const control =
      state.user?.workControl ||
      {};

    if (
      control.date === today &&
      control.manualStartAt
    ) {
      const start =
        new Date(
          control.manualStartAt
        );

      const scheduledEnd =
        workWindow(
          new Date()
        ).end.getTime();

      const manualEnd =
        control.manualStopAt
          ? new Date(
              control.manualStopAt
            ).getTime()
          : Date.now();

      const endTs =
        Math.min(
          manualEnd,
          scheduledEnd
        );

      const elapsedMs =
        Math.max(
          0,
          endTs -
          start.getTime()
        );

      const finished =
        Boolean(
          control.manualStopAt
        ) ||
        Date.now() >= scheduledEnd;

      return {
        mode: 'manual',
        state: finished
          ? 'انتهت الجلسة'
          : 'عمل يدوي الآن',
        meta: finished
          ? 'الجلسة اليدوية محفوظة'
          : 'الجلسة اليدوية محفوظة حتى الإغلاق',
        elapsedMs,
        rate: hourlyRate(),
        start,
        end: new Date(endTs)
      };
    }

    return automaticWorkSnapshot(
      new Date()
    );
  }

  function hourlyRate(
    user = state.user
  ) {
    const p =
      user?.profile ||
      defaults.profile;

    const rate =
      Number(p.salary) || 0;

    if (
      p.salaryType ===
      'hourly'
    ) {
      return rate;
    }

    const hoursDay =
      timeDiffHours(
        p.workStart,
        p.workEnd
      );

    const days =
      Number(p.workDays) || 5;

    return hoursDay > 0
      ? rate /
        (
          days *
          4.33 *
          hoursDay
        )
      : 0;
  }

  function showToast(
    message,
    type = 'success'
  ) {
    const el =
      document.createElement(
        'div'
      );

    el.className =
      `toast ${type}`;

    el.textContent =
      message;

    $('toastRoot')
      .appendChild(el);

    setTimeout(
      () => el.remove(),
      3300
    );
  }

  function setFormMessage(
    el,
    message,
    type = 'error'
  ) {
    el.textContent =
      message;

    el.className =
      `form-message ${type}`;
  }

  function saveSession(
    email,
    remember = true
  ) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email,
        remember,
        at: Date.now()
      })
    );
  }

  function clearSession() {
    localStorage.removeItem(
      SESSION_KEY
    );
  }

  function init() {
    applyTheme(
      readPref().theme || 'mint'
    );

    bindAuth();
    bindApp();
    bindGlobal();

    renderWizardVisual();
    setAuthPreview();

    const session = (() => {
      try {
        return JSON.parse(
          localStorage.getItem(
            SESSION_KEY
          ) || 'null'
        );
      } catch {
        return null;
      }
    })();

    if (session?.email) {
      const user =
        readUsers().find(
          u =>
            normalizeEmail(u.email) ===
            normalizeEmail(
              session.email
            )
        );

      if (user) {
        enterAsUser(user);
      }
    }

    setInterval(
      () => {
        if (state.user) {
          syncWorkEngine();
        }
      },
      1000
    );
  }

  function bindAuth() {
    qsa('[data-auth-mode]')
      .forEach(btn => {
        btn.addEventListener(
          'click',
          () =>
            switchAuthMode(
              btn.dataset.authMode
            )
        );
      });

    qsa('[data-toggle]')
      .forEach(btn => {
        btn.addEventListener(
          'click',
          () =>
            togglePassword(
              btn.dataset.toggle
            )
        );
      });

    $('registerPassword')
      .addEventListener(
        'input',
        updatePasswordStrength
      );

    $('loginForm')
      .addEventListener(
        'submit',
        loginSubmit
      );

    $('registerForm')
      .addEventListener(
        'submit',
        registerSubmit
      );

    $('demoHelpBtn')
      .addEventListener(
        'click',
        () =>
          openModal(
            'login-help'
          )
      );

    $('showDemoBtn')
      .addEventListener(
        'click',
        () =>
          openModal(
            'demo'
          )
      );

    $('wizardNext')
      .addEventListener(
        'click',
        nextWizard
      );

    $('wizardBack')
      .addEventListener(
        'click',
        backWizard
      );

    qsa('.starter-plan')
      .forEach(btn => {
        btn.addEventListener(
          'click',
          () => {
            state.selectedPlan =
              btn.dataset.plan;

            qsa('.starter-plan')
              .forEach(
                x =>
                  x.classList.toggle(
                    'selected',
                    x === btn
                  )
              );
          }
        );
      });

    $('routineChoices').innerHTML =
      [
        'جلسة تركيز صباحية',
        'فاصل غداء',
        'جلسة إنجاز رئيسية',
        'وقت شخصي بعد العمل'
      ]
      .map(
        (x, i) =>
          `
          <button
            type="button"
            class="choice-card ${
              i < 2
                ? 'selected'
                : ''
            }"
            data-routine="${i}"
          >
            <strong>${x}</strong>
            <small>
              إضافة هذا العنصر إلى يومك تلقائيًا
            </small>
          </button>
          `
      )
      .join('');

    qsa('.choice-card')
      .forEach(btn => {
        btn.addEventListener(
          'click',
          () =>
            btn.classList.toggle(
              'selected'
            )
        );
      });
  }

  function switchAuthMode(mode) {
    state.authMode =
      mode;

    qsa('.mode-tab')
      .forEach(btn =>
        btn.classList.toggle(
          'active',
          btn.dataset.authMode ===
          mode
        )
      );

    $('loginForm')
      .classList.toggle(
        'hidden',
        mode !== 'login'
      );

    $('registerForm')
      .classList.toggle(
        'hidden',
        mode !== 'register'
      );

    $('loginMessage')
      .textContent = '';

    $('registerMessage')
      .textContent = '';
  }

  function togglePassword(id) {
    const input = $(id);

    input.type =
      input.type === 'password'
        ? 'text'
        : 'password';

    const btn =
      qs(
        `[data-toggle="${id}"]`
      );

    if (btn) {
      btn.textContent =
        input.type ===
        'password'
          ? 'إظهار'
          : 'إخفاء';
    }
  }

  function updatePasswordStrength() {
    const value =
      $('registerPassword')
        .value;

    const parts = [
      value.length >= 8,
      /[A-Z]/.test(value) ||
        /[أ-ي]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9أ-ي]/.test(
        value
      )
    ];

    const score =
      parts.filter(Boolean)
        .length;

    qsa(
      '.password-strength span'
    )
    .forEach(
      (bar, i) =>
        bar.classList.toggle(
          'on',
          i < score
        )
    );

    const label =
      qs(
        '.password-strength small'
      );

    if (label) {
      label.textContent =
        score <= 1
          ? 'قوة كلمة المرور · ضعيفة'
          : score === 2
            ? 'قوة كلمة المرور · متوسطة'
            : score === 3
              ? 'قوة كلمة المرور · جيدة'
              : 'قوة كلمة المرور · قوية';
    }
  }

  function loginSubmit(e) {
    e.preventDefault();

    const email =
      normalizeEmail(
        $('loginEmail').value
      );

    const password =
      $('loginPassword').value;

    const msg =
      $('loginMessage');

    const dev =
      DEV_USERS.find(
        x =>
          normalizeEmail(
            x.email
          ) === email &&
          x.password === password
      );

    if (dev) {
      clearSession();
      state.devAuthenticated =
        true;

      openDeveloperPanel();

      return;
    }

    const user =
      readUsers().find(
        u =>
          normalizeEmail(
            u.email
          ) === email &&
          u.password === password
      );

    if (!user) {
      return setFormMessage(
        msg,
        'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      );
    }

    saveSession(
      user.email,
      $('rememberMe').checked
    );

    enterAsUser(user);
  }

  function registerSubmit(e) {
    e.preventDefault();

    const name =
      $('registerName').value.trim();

    const email =
      normalizeEmail(
        $('registerEmail').value
      );

    const password =
      $('registerPassword').value;

    const password2 =
      $('registerPassword2').value;

    const msg =
      $('registerMessage');

    if (password !== password2) {
      return setFormMessage(
        msg,
        'تأكيد كلمة المرور غير مطابق.'
      );
    }

    if (password.length < 8) {
      return setFormMessage(
        msg,
        'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'
      );
    }

    if (
      readUsers().some(
        u =>
          normalizeEmail(
            u.email
          ) === email
      ) ||
      DEV_USERS.some(
        d =>
          normalizeEmail(
            d.email
          ) === email
      )
    ) {
      return setFormMessage(
        msg,
        'هذا البريد مسجل بالفعل.'
      );
    }

    const user = {
      id:
        crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),

      email,
      name,
      password,

      ...cloneDefaults()
    };

    writeUsers([
      ...readUsers(),
      user
    ]);

    saveSession(
      email,
      true
    );

    stateFromUser(user);

    openOnboarding();
  }

  function enterAsUser(user) {
    stateFromUser(user);

    if (!user.setupComplete) {
      openOnboarding();
    } else {
      showApp();
    }
  }

  function openOnboarding() {
    $('authView')
      .classList.add('hidden');

    $('appView')
      .classList.add('hidden');

    $('onboardingView')
      .classList.remove(
        'hidden'
      );

    state.wizardStep = 1;

    fillWizardFromUser();
    renderWizard();
  }

  function showApp() {
    $('authView')
      .classList.add('hidden');

    $('onboardingView')
      .classList.add('hidden');

    $('appView')
      .classList.remove(
        'hidden'
      );

    renderAll();
  }

  function fillWizardFromUser() {
    const p =
      state.user.profile ||
      defaults.profile;

    [
      'Job',
      'SalaryType',
      'Salary',
      'WorkDays',
      'WorkStart',
      'WorkEnd',
      'OffDays',
      'Wake',
      'Sleep',
      'GoWork',
      'BackWork',
      'Goal',
      'Activity',
      'Age',
      'Weight',
      'Height'
    ].forEach(
      key => {
        const el =
          $(`ob${key}`);

        if (el) {
          el.value =
            p[
              key.charAt(0).toLowerCase() +
              key.slice(1)
            ] ?? '';
        }
      }
    );

    qsa('.starter-plan')
      .forEach(
        x =>
          x.classList.toggle(
            'selected',
            x.dataset.plan ===
              (
                state.user.healthPlan ||
                'balanced'
              )
          )
      );
  }

  function renderWizardVisual() {
    const labels = [
      'العمل والدخل',
      'روتين اليوم',
      'البيانات الصحية'
    ];

    $('wizardStepsVisual').innerHTML =
      labels
        .map(
          (x, i) =>
            `
            <div class="wsv-item ${
              i === 0
                ? 'active'
                : ''
            }">
              <i>
                ${String(i + 1).padStart(2, '0')}
              </i>

              <span>${x}</span>
            </div>
            `
        )
        .join('');
  }

  function renderWizard() {
    [1, 2, 3]
      .forEach(
        i =>
          $(`wizardStep${i}`)
            .classList.toggle(
              'hidden',
              state.wizardStep !== i
            )
      );

    $('wizardBack')
      .classList.toggle(
        'hidden',
        state.wizardStep === 1
      );

    $('wizardNext').innerHTML =
      state.wizardStep === 3
        ? 'إنشاء مساحتي <b>↗</b>'
        : 'التالي <b>←</b>';

    $('wizardProgressBar')
      .style.width =
        `${(
          state.wizardStep / 3
        ) * 100}%`;

    const counter =
      $('wizardTopCounter');

    if (counter) {
      counter.textContent =
        `${String(
          state.wizardStep
        ).padStart(2, '0')} / 03`;
    }

    qsa('.wsv-item')
      .forEach(
        (x, i) =>
          x.classList.toggle(
            'active',
            i ===
              state.wizardStep - 1
          )
      );
  }

  function wizardPayload() {
    return {
      job:
        $('obJob').value.trim(),

      salaryType:
        $('obSalaryType').value,

      salary:
        Number(
          $('obSalary').value
        ) || 0,

      workDays:
        Number(
          $('obWorkDays').value
        ) || 5,

      workStart:
        $('obWorkStart').value,

      workEnd:
        $('obWorkEnd').value,

      offDays:
        $('obOffDays').value.trim(),

      wake:
        $('obWake').value,

      sleep:
        $('obSleep').value,

      goWork:
        $('obGoWork').value,

      backWork:
        $('obBackWork').value,

      goal:
        $('obGoal').value,

      activity:
        $('obActivity').value,

      age:
        $('obAge').value,

      weight:
        $('obWeight').value,

      height:
        $('obHeight').value
    };
  }

  function nextWizard() {
    const p =
      wizardPayload();

    if (
      state.wizardStep === 1 &&
      !p.job
    ) {
      return showToast(
        'اكتب وظيفتك أو مجالك أولًا.',
        'error'
      );
    }

    if (
      state.wizardStep === 1 &&
      !p.salary
    ) {
      return showToast(
        'أدخل الدخل حتى نحسب قيمة الساعة.',
        'error'
      );
    }

    if (
      state.wizardStep < 3
    ) {
      state.wizardStep++;

      renderWizard();

      return;
    }

    const user = {
      ...state.user,

      profile: p,

      healthPlan:
        state.selectedPlan,

      setupComplete: true
    };

    user.planner =
      buildStarterPlanner(
        user
      );

    user.habits =
      cloneDefaults().habits;

    updateStoredUser(user);

    state.user =
      user;

    showApp();

    showToast(
      'تم تجهيز مساحة Yourself الخاصة بك ✦'
    );
  }

  function backWizard() {
    if (
      state.wizardStep > 1
    ) {
      state.wizardStep--;

      renderWizard();
    }
  }

  function updateStoredUser(user) {
    const users =
      readUsers();

    const i =
      users.findIndex(
        u => u.id === user.id
      );

    if (i >= 0) {
      users[i] = user;

      writeUsers(users);
    }
  }

  function buildStarterPlanner(user) {
    const p =
      user.profile;

    const todayKey =
      new Date()
        .toISOString()
        .slice(0, 10);

    return [
      {
        id:
          crypto.randomUUID?.() ||
          `p-${Date.now()}-1`,

        date:
          todayKey,

        time:
          p.goWork ||
          '08:00',

        title:
          'الاستعداد والذهاب للعمل',

        category:
          'routine'
      },

      {
        id:
          crypto.randomUUID?.() ||
          `p-${Date.now()}-2`,

        date:
          todayKey,

        time:
          p.workStart ||
          '08:30',

        title:
          'بداية العمل',

        category:
          'work'
      },

      {
        id:
          crypto.randomUUID?.() ||
          `p-${Date.now()}-3`,

        date:
          todayKey,

        time:
          '13:00',

        title:
          'فاصل + غداء',

        category:
          'break'
      },

      {
        id:
          crypto.randomUUID?.() ||
          `p-${Date.now()}-4`,

        date:
          todayKey,

        time:
          p.workEnd ||
          '17:00',

        title:
          'إغلاق يوم العمل',

        category:
          'work'
      },

      {
        id:
          crypto.randomUUID?.() ||
          `p-${Date.now()}-5`,

        date:
          todayKey,

        time:
          p.backWork ||
          '17:30',

        title:
          'وقت شخصي / راحة',

        category:
          'personal'
      }
    ];
  }

  /*
    بقية وظائف النظام الحالية:
    لوحة التحكم
    العمل والدخل
    العداد التلقائي
    الخصومات والإضافات
    تنظيم الوقت
    المذكرة
    الصحة والعادات
    الإعدادات
    مركز المطورين

    بقيت موجودة داخل النسخة الكاملة في رابط
    script.js أعلاه.
  */

  document.addEventListener(
    'DOMContentLoaded',
    init
  );
})();
