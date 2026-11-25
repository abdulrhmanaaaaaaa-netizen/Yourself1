/*
 * إعداد Yourself العام: ضع رابط Supabase والمفتاح العام Publishable/anon هنا.
 * لا تضع service_role أو سر Google في هذا الملف؛ الملف يصل لكل زائر.
 */
window.YOURSELF_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: ''
};

(() => {
  'use strict';
  const { supabaseUrl, supabasePublishableKey } = window.YOURSELF_CONFIG;
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  const key = String(supabasePublishableKey || '').trim();
  const supabaseConfigured = Boolean(base && key);
  const STORE = 'yourself_auth_v1';
  const VERIFIER = 'yourself_pkce_verifier';

  function currentSession() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || 'null'); }
    catch { return null; }
  }
  function saveSession(session) {
    if (!session?.access_token) return null;
    const expiresAt = session.expires_at || (Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600));
    const saved = { ...session, expires_at: expiresAt };
    sessionStorage.setItem(STORE, JSON.stringify(saved));
    return saved;
  }
  function clearSession() {
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem(VERIFIER);
  }
  function fail(message, status = 400, code = '') {
    const error = new Error(message || 'request_failed');
    error.status = status;
    error.code = code;
    throw error;
  }
  async function readResponse(response) {
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text; }
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || (typeof data === 'string' ? data : 'تعذر الاتصال بخدمة Supabase.');
      fail(String(message), response.status, data?.code || data?.error_code || '');
    }
    return data;
  }
  async function authRequest(path, body, token) {
    if (!supabaseConfigured) fail('SUPABASE_NOT_CONFIGURED');
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    return readResponse(response);
  }
  async function refreshSession(session) {
    if (!session?.refresh_token) { clearSession(); return null; }
    const renewed = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    saveSession(renewed);
    return renewed;
  }
  async function exchangeOAuthCode() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (!code) return null;
    const verifier = sessionStorage.getItem(VERIFIER);
    if (!verifier) fail('تعذر إكمال تسجيل Google. أعد المحاولة من صفحة الموقع نفسها.');
    const session = await authRequest('token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
    saveSession(session);
    sessionStorage.removeItem(VERIFIER);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    return session;
  }
  async function getSession() {
    if (!supabaseConfigured) return null;
    const callback = await exchangeOAuthCode();
    let session = callback || currentSession();
    if (!session) return null;
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      session = await refreshSession(session);
    }
    return session;
  }
  async function api(path, options = {}, retry = true) {
    if (!supabaseConfigured) fail('SUPABASE_NOT_CONFIGURED');
    let session = currentSession();
    if (session?.expires_at < Math.floor(Date.now() / 1000) + 45) session = await refreshSession(session);
    const headers = { apikey: key, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.headers || {}) };
    const response = await fetch(`${base}${path}`, { ...options, headers });
    if (response.status === 401 && retry && session?.refresh_token) {
      await refreshSession(session);
      return api(path, options, false);
    }
    return readResponse(response);
  }
  function query(values) {
    const p = new URLSearchParams(values);
    return p.toString();
  }
  async function signInWithPassword(email, password) {
    const data = await authRequest('token?grant_type=password', { email, password });
    saveSession(data);
    return { data: { user: data.user, session: data } };
  }
  async function signUpWithPassword(email, password, fullName, appPayload) {
    const redirect = `${location.origin}${location.pathname}`;
    const data = await authRequest(`signup?redirect_to=${encodeURIComponent(redirect)}`, { email, password, data: { full_name: fullName, app_payload: appPayload } });
    if (data?.access_token) saveSession(data);
    return { data: { user: data.user || data, session: data.access_token ? data : null } };
  }
  function base64url(bytes) {
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function signInWithGoogle() {
    if (!supabaseConfigured) fail('SUPABASE_NOT_CONFIGURED');
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    const verifier = base64url(bytes);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    sessionStorage.setItem(VERIFIER, verifier);
    const redirect = `${location.origin}${location.pathname}`;
    const params = query({ provider: 'google', redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' });
    location.assign(`${base}/auth/v1/authorize?${params}`);
  }
  async function signOut() {
    const session = currentSession();
    try {
      if (session?.access_token && supabaseConfigured) {
        await fetch(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } });
      }
    } finally { clearSession(); }
    return { error: null };
  }
  const profileFields = 'id,email,full_name,job_title,account_status,avatar_path,created_at';
  async function getUserProfile(userId) {
    const rows = await api(`/rest/v1/user_profiles?${query({ select: profileFields, id: `eq.${userId}`, limit: '1' })}`);
    return rows?.[0] || null;
  }
  async function updateUserProfile(userId, fields) {
    const rows = await api(`/rest/v1/user_profiles?${query({ id: `eq.${userId}`, select: profileFields })}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fields) });
    if (!rows?.[0]) fail('تعذر تحديث الملف الشخصي.');
    return rows[0];
  }
  async function getUserPayload(userId) {
    const rows = await api(`/rest/v1/user_data?${query({ select: 'payload,updated_at', user_id: `eq.${userId}`, limit: '1' })}`);
    return rows?.[0] || null;
  }
  async function saveUserPayload(userId, payload) {
    const rows = await api(`/rest/v1/user_data?${query({ on_conflict: 'user_id', select: 'user_id,updated_at' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ user_id: userId, payload, updated_at: new Date().toISOString() }) });
    return rows?.[0] || null;
  }
  async function isDeveloper(userId) {
    const rows = await api(`/rest/v1/app_user_roles?${query({ select: 'role', user_id: `eq.${userId}`, role: 'eq.developer', limit: '1' })}`);
    return Boolean(rows?.length);
  }
  function objectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }
  async function getAvatarUrl(path) {
    if (!path) return '';
    const data = await api('/storage/v1/object/sign/avatars/' + objectPath(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
    return data?.signedURL ? base + '/storage/v1' + '/' + data.signedURL.replace(/^\/+/, '') : '';
  }
  async function uploadAvatar(userId, file, previousPath = '') {
    const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
    if (!file || !allowed.has(file.type)) fail('AVATAR_TYPE');
    if (file.size > 2 * 1024 * 1024) fail('AVATAR_SIZE');
    const path = `${userId}/${crypto.randomUUID()}.${allowed.get(file.type)}`;
    await api('/storage/v1/object/avatars/' + objectPath(path), { method: 'POST', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    try { await updateUserProfile(userId, { avatar_path: path }); }
    catch (error) { await removeObjects([path]).catch(() => {}); throw error; }
    if (previousPath) await removeObjects([previousPath]);
    return { path, url: await getAvatarUrl(path) };
  }
  async function removeObjects(paths) {
    if (!paths.length) return;
    return api('/storage/v1/object/avatars', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  }
  async function removeAvatar(userId, path) {
    if (path) await removeObjects([path]);
    await updateUserProfile(userId, { avatar_path: null });
  }
  async function adminListProfiles() {
    return (await api('/rest/v1/rpc/admin_list_profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })) || [];
  }
  async function adminSetProfileStatus(userId, status) {
    return api('/rest/v1/rpc/admin_set_profile_status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_user_id: userId, new_status: status }) });
  }
  async function deleteAccount(targetUserId = null) {
    return api('/functions/v1/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetUserId ? { target_user_id: targetUserId } : {}) });
  }
  function readableAuthError(error) {
    const code = error?.message || String(error || '');
    if (code === 'SUPABASE_NOT_CONFIGURED') return 'أضف رابط Supabase والمفتاح العام إلى config.js أولًا.';
    if (code.includes('Invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
    if (code.includes('Email not confirmed')) return 'أكد بريدك الإلكتروني من الرسالة التي أرسلناها لك.';
    if (code.includes('User already registered')) return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
    if (code === 'AVATAR_SIZE') return 'حجم الصورة أكبر من 2 ميجابايت.';
    if (code === 'AVATAR_TYPE') return 'استخدم صورة JPG أو PNG أو WebP أو AVIF.';
    if (error?.status === 403) return 'الحساب غير معتمد أو لا يملك صلاحية المطوّر لهذه العملية.';
    return 'تعذر إكمال الطلب. تحقّق من إعداد Supabase والاتصال ثم حاول مرة أخرى.';
  }
  window.YSBackend = { supabaseConfigured, signInWithPassword, signUpWithPassword, signInWithGoogle, signOut, getSession, getUserProfile, updateUserProfile, getUserPayload, saveUserPayload, isDeveloper, getAvatarUrl, uploadAvatar, removeAvatar, adminListProfiles, adminSetProfileStatus, deleteAccount, readableAuthError };
})();