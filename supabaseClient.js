/*
 * Yourself - Supabase REST connector
 * Native browser APIs only: fetch, localStorage, URL, Blob and crypto.
 * No Supabase JavaScript SDK or other third-party JavaScript library.
 */

const SUPABASE_URL = 'https://jxdzihloouksaebxigrz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jYfrzGshksyPQZYkKYz7cQ_a8FpXZ_-';
const SESSION_KEY = 'yourself_supabase_session_v1';
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let session = loadSession();
let refreshInFlight = null;

function loadSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return value && typeof value.access_token === 'string' ? value : null;
  } catch {
    return null;
  }
}

function saveSession(value) {
  session = value || null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    throw new Error('تعذر حفظ جلسة الدخول على هذا الجهاز.');
  }
}

function makeError(payload, status = 0) {
  const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `HTTP_${status}`;
  const error = new Error(String(message));
  error.status = status;
  error.code = payload?.code || payload?.error_code || '';
  error.details = payload?.details || '';
  return error;
}

async function readResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { message: text }; }
  }
  if (!response.ok) throw makeError(payload, response.status);
  return payload;
}

function authHeaders(token) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function authRequest(path, options = {}) {
  const { token, body, headers: extraHeaders, ...requestOptions } = options;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...requestOptions,
    headers: {
      ...authHeaders(token),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(extraHeaders || {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return readResponse(response);
}

function normalizeSession(data, previous = null) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(data?.expires_in || 3600);
  return {
    access_token: data?.access_token || previous?.access_token || '',
    refresh_token: data?.refresh_token || previous?.refresh_token || '',
    token_type: data?.token_type || previous?.token_type || 'bearer',
    expires_in: expiresIn,
    expires_at: Number(data?.expires_at || (now + expiresIn)),
    user: data?.user || previous?.user || null
  };
}

function consumeAuthRedirect() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return;

  const incoming = normalizeSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get('token_type') || 'bearer',
    expires_in: Number(params.get('expires_in') || 3600)
  }, null);
  saveSession(incoming);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

async function refreshSession() {
  if (!session?.refresh_token) {
    saveSession(null);
    throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const data = await authRequest('token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: session.refresh_token }
      });
      const next = normalizeSession(data, session);
      if (!next.access_token || !next.refresh_token) throw new Error('تعذر تحديث جلسة الدخول.');
      saveSession(next);
      return next;
    } catch (error) {
      saveSession(null);
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function validSession(forceRefresh = false) {
  if (!session?.access_token) throw new Error('يجب تسجيل الدخول أولًا.');
  const expiresAt = Number(session.expires_at || 0);
  if (forceRefresh || (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 60)) {
    await refreshSession();
  }
  return session;
}

async function authorizedFetch(path, options = {}, retry = true) {
  const current = await validSession();
  const headers = {
    ...authHeaders(current.access_token),
    ...(options.body !== undefined && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : (options.body instanceof Blob ? options.body : JSON.stringify(options.body))
  });

  if (response.status === 401 && retry && session?.refresh_token) {
    await validSession(true);
    return authorizedFetch(path, options, false);
  }
  return readResponse(response);
}

async function rest(path, options = {}, retry = true) {
  return authorizedFetch(`/rest/v1/${path}`, options, retry);
}

function encodeObjectPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export { supabaseConfigured };

export async function getSession() {
  consumeAuthRedirect();
  if (!session?.access_token) return { data: { session: null }, error: null };
  try {
    await validSession();
    const user = await authRequest('user', { method: 'GET', token: session.access_token });
    session = { ...session, user };
    saveSession(session);
    return { data: { session }, error: null };
  } catch (error) {
    if (error?.status === 401) saveSession(null);
    throw error;
  }
}

export async function signInWithPassword(email, password) {
  const data = await authRequest('token?grant_type=password', {
    method: 'POST',
    body: { email, password }
  });
  const next = normalizeSession(data);
  if (!next.access_token) throw new Error('لم يرجع خادم المصادقة جلسة صالحة.');
  saveSession(next);
  return { data: { user: next.user, session: next }, error: null };
}

export async function signUpWithPassword(email, password, fullName, appPayload) {
  const redirect = encodeURIComponent(`${window.location.origin}${window.location.pathname}`);
  const result = await authRequest(`signup?redirect_to=${redirect}`, {
    method: 'POST',
    body: {
      email,
      password,
      data: { full_name: fullName, app_payload: appPayload }
    }
  });
  const user = result?.user || result;
  let next = null;
  if (result?.access_token) {
    next = normalizeSession(result);
    saveSession(next);
  }
  return { data: { user, session: next }, error: null };
}

export async function signOut() {
  let failure = null;
  try {
    if (session?.access_token) {
      await authorizedFetch('/auth/v1/logout', { method: 'POST' });
    }
  } catch (error) {
    failure = error;
  } finally {
    saveSession(null);
  }
  if (failure && failure.status !== 401) throw failure;
  return { error: null };
}

export async function getUserProfile(userId) {
  const query = new URLSearchParams({
    select: 'id,email,full_name,job_title,account_status,avatar_path,created_at',
    id: `eq.${userId}`,
    limit: '1'
  });
  const rows = await rest(`user_profiles?${query}`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function updateUserProfile(userId, fields) {
  const query = new URLSearchParams({
    id: `eq.${userId}`,
    select: 'id,email,full_name,job_title,account_status,avatar_path,created_at'
  });
  const rows = await rest(`user_profiles?${query}`, {
    method: 'PATCH',
    body: fields,
    headers: { Prefer: 'return=representation' }
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error('لم يتم العثور على ملف المستخدم.');
  return rows[0];
}

export async function getUserPayload(userId) {
  const query = new URLSearchParams({ select: 'payload,updated_at', user_id: `eq.${userId}`, limit: '1' });
  const rows = await rest(`user_data?${query}`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function saveUserPayload(userId, payload) {
  const query = new URLSearchParams({ on_conflict: 'user_id', select: 'user_id,updated_at' });
  const rows = await rest(`user_data?${query}`, {
    method: 'POST',
    body: { user_id: userId, payload, updated_at: new Date().toISOString() },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function isDeveloper(userId) {
  const query = new URLSearchParams({ select: 'role', user_id: `eq.${userId}`, role: 'eq.developer', limit: '1' });
  const rows = await rest(`app_user_roles?${query}`);
  return Array.isArray(rows) && rows.length > 0;
}

export async function getAvatarUrl(path) {
  if (!path) return '';
  const result = await authorizedFetch(`/storage/v1/object/sign/avatars/${encodeObjectPath(path)}`, {
    method: 'POST',
    body: { expiresIn: 3600 }
  });
  const signed = result?.signedURL || result?.signedUrl;
  if (!signed) throw new Error('تعذر إنشاء رابط الصورة.');
  if (/^https?:\/\//i.test(signed)) return signed;
  return `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
}

export async function uploadAvatar(userId, file, previousPath = '') {
  if (!file || !file.type.startsWith('image/')) throw new Error('AVATAR_TYPE');
  if (file.size > 2 * 1024 * 1024) throw new Error('AVATAR_SIZE');
  const allowed = new Map([
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/avif', 'avif']
  ]);
  const extension = allowed.get(file.type);
  if (!extension) throw new Error('AVATAR_TYPE');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  await authorizedFetch(`/storage/v1/object/avatars/${encodeObjectPath(path)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type, 'x-upsert': 'false' }
  });
  try {
    await updateUserProfile(userId, { avatar_path: path });
  } catch (error) {
    try { await authorizedFetch('/storage/v1/object/avatars', { method: 'DELETE', body: { prefixes: [path] } }); } catch {}
    throw error;
  }
  if (previousPath) {
    await authorizedFetch('/storage/v1/object/avatars', { method: 'DELETE', body: { prefixes: [previousPath] } });
  }
  return { path, url: await getAvatarUrl(path) };
}

export async function removeAvatar(userId, path) {
  if (path) {
    await authorizedFetch('/storage/v1/object/avatars', { method: 'DELETE', body: { prefixes: [path] } });
  }
  await updateUserProfile(userId, { avatar_path: null });
}

export async function adminListProfiles() {
  return (await rest('rpc/admin_list_profiles', { method: 'POST', body: {} })) || [];
}

export async function adminSetProfileStatus(userId, status) {
  return rest('rpc/admin_set_profile_status', {
    method: 'POST',
    body: { target_user_id: userId, new_status: status }
  });
}

export async function deleteAccount(targetUserId = null) {
  return authorizedFetch('/functions/v1/delete-account', {
    method: 'POST',
    body: targetUserId ? { target_user_id: targetUserId } : {}
  });
}

export function readableAuthError(error) {
  const code = error?.message || String(error || '');
  if (code === 'SUPABASE_NOT_CONFIGURED') return 'إعداد الاتصال بقاعدة البيانات غير مكتمل.';
  if (code.includes('Invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
  if (code.includes('Email not confirmed')) return 'أكد بريدك الإلكتروني من الرسالة التي أرسلناها لك.';
  if (code.includes('User already registered') || code.includes('already been registered')) return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
  if (code === 'AVATAR_SIZE') return 'حجم الصورة أكبر من 2 ميجابايت.';
  if (code === 'AVATAR_TYPE') return 'استخدم صورة JPG أو PNG أو WebP أو AVIF.';
  if (code.includes('not_authorized') || error?.status === 403) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
  if (error?.status === 0 || code.includes('Failed to fetch')) return 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.';
  return 'تعذر إكمال الطلب. تحقق من البيانات والاتصال ثم حاول مرة أخرى.';
}
