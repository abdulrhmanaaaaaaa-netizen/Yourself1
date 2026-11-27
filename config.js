/*
 * إعداد الاتصال العام لـ Yourself.
 * لا تضع أي مفتاح سري أو كلمة مرور هنا؛ هذا الملف متاح لزوار الموقع.
 */
window.YOURSELF_CONFIG = {
  supabaseUrl: 'https://jxdzihloouksaebxigrz.supabase.co',
  supabasePublishableKey: 'sb_publishable_jYfrzGshksyPQZYkKYz7cQ_a8FpXZ_-'
};

(() => {
  'use strict';
  const { supabaseUrl, supabasePublishableKey } = window.YOURSELF_CONFIG;
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  const key = String(supabasePublishableKey || '').trim();
  const supabaseConfigured = Boolean(base && key);
  const STORE = 'yourself_auth_v1';
  const RECOVERY_VERIFIER = 'yourself_recovery_verifier';
  const RECOVERY_TTL = 60 * 60 * 1000;

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
      const message = data?.msg || data?.message || data?.error_description || data?.error || (typeof data === 'string' ? data : 'تعذر الاتصال بالخدمة.');
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
    try {
      const renewed = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (!renewed?.access_token) fail('SESSION_REFRESH_INVALID');
      saveSession(renewed);
      return renewed;
    } catch (error) {
      clearSession();
      throw error;
    }
  }
  async function getSession() {
    if (!supabaseConfigured) return null;
    let session = currentSession();
    if (!session) return null;
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      session = await refreshSession(session);
    }
    return session;
  }
  function base64url(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function consumeRecoveryLink() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (code) {
      let stored;
      try { stored = JSON.parse(localStorage.getItem(RECOVERY_VERIFIER) || 'null'); }
      catch { stored = null; }
      const createdAt = Number(stored?.createdAt);
      if (!stored?.verifier || !Number.isFinite(createdAt) || createdAt > Date.now() || Date.now() - createdAt > RECOVERY_TTL) {
        localStorage.removeItem(RECOVERY_VERIFIER);
        fail('RECOVERY_LINK_INVALID');
      }
      try {
        const session = await authRequest('token?grant_type=pkce', { auth_code: code, code_verifier: stored.verifier });
        saveSession(session);
        localStorage.removeItem(RECOVERY_VERIFIER);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        return true;
      } catch (error) {
        localStorage.removeItem(RECOVERY_VERIFIER);
        throw error;
      }
    }
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery') return false;
    const accessToken = params.get('access_token');
    if (!accessToken) fail('RECOVERY_LINK_INVALID');
    saveSession({ access_token: accessToken, refresh_token: params.get('refresh_token') || '', expires_in: params.get('expires_in') || 3600 });
    localStorage.removeItem(RECOVERY_VERIFIER);
    history.replaceState({}, document.title, location.pathname + location.search);
    return true;
  }
  async function updatePassword(password) {
    if (!supabaseConfigured) fail('SUPABASE_NOT_CONFIGURED');
    let session = currentSession();
    if (!session?.access_token) fail('RECOVERY_SESSION_MISSING');
    if (session.expires_at < Math.floor(Date.now() / 1000) + 45) session = await refreshSession(session);
    if (!session?.access_token) fail('RECOVERY_SESSION_MISSING');
    const response = await fetch(`${base}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    return readResponse(response);
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
  async function sendPasswordRecovery(email) {
    if (!supabaseConfigured) fail('SUPABASE_NOT_CONFIGURED');
    const random = crypto.getRandomValues(new Uint8Array(48));
    const verifier = base64url(random);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    localStorage.setItem(RECOVERY_VERIFIER, JSON.stringify({ verifier, createdAt: Date.now() }));
    const redirect = `${location.origin}${location.pathname}`;
    try {
      return await authRequest(`recover?redirect_to=${encodeURIComponent(redirect)}`, { email, code_challenge: challenge, code_challenge_method: 's256' });
    } catch (error) {
      localStorage.removeItem(RECOVERY_VERIFIER);
      throw error;
    }
  }
  async function signOut() {
    const session = currentSession();
    let remoteError = null;
    try {
      if (session?.access_token && supabaseConfigured) {
        const response = await fetch(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } });
        if (!response.ok) remoteError = new Error('REMOTE_LOGOUT_FAILED');
      }
    } catch (error) { remoteError = error; }
    finally { clearSession(); }
    return { error: remoteError };
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
    if (!rows?.[0]?.user_id) fail('USER_DATA_SAVE_EMPTY');
    return rows[0];
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
    if (previousPath) await removeObjects([previousPath]).catch(error => console.warn('تعذر تنظيف الصورة الشخصية السابقة.', error));
    let url = '';
    try { url = await getAvatarUrl(path); }
    catch (error) { console.warn('تم حفظ الصورة، لكن تعذر إنشاء رابط المعاينة مؤقتًا.', error); }
    return { path, url };
  }
  async function removeObjects(paths) {
    if (!paths.length) return;
    return api('/storage/v1/object/avatars', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  }
  async function removeAvatar(userId, path) {
    await updateUserProfile(userId, { avatar_path: null });
    if (path) await removeObjects([path]).catch(error => console.warn('تعذر تنظيف ملف الصورة المحذوف.', error));
  }
  async function adminListProfiles() {
    // Request pages explicitly instead of relying on PostgREST's default row cap.
    const profiles = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const rows = await api('/rest/v1/rpc/admin_list_profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Range-Unit': 'items',
          'Range': `${offset}-${offset + pageSize - 1}`
        },
        body: '{}'
      });
      if (!Array.isArray(rows)) fail('ADMIN_PROFILES_INVALID_RESPONSE');
      profiles.push(...rows);
      if (rows.length < pageSize) break;
    }
    return profiles;
  }
  async function adminSetProfileStatus(userId, status) {
    return api('/rest/v1/rpc/admin_set_profile_status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_user_id: userId, new_status: status }) });
  }
  async function getSupportConversations() {
    return (await api('/rest/v1/support_conversations?select=id,user_id,subject,status,created_at,updated_at&order=updated_at.desc')) || [];
  }
  async function createSupportConversation(userId, subject) {
    const rows = await api('/rest/v1/support_conversations?select=id,user_id,subject,status,created_at,updated_at', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: userId, subject }) });
    if (!rows?.[0]?.id) fail('تعذر إنشاء المحادثة.');
    return rows[0];
  }
  async function getSupportMessages(conversationId) {
    return (await api(`/rest/v1/support_messages?${query({ select: 'id,conversation_id,sender_id,body,created_at', conversation_id: `eq.${conversationId}`, order: 'created_at.asc', limit: '200' })}`)) || [];
  }
  async function sendSupportMessage(conversationId, senderId, body) {
    return api('/rest/v1/support_messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ conversation_id: conversationId, sender_id: senderId, body }) });
  }
  async function adminSetSupportStatus(conversationId, status) {
    return api('/rest/v1/rpc/admin_set_support_status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_conversation_id: conversationId, new_status: status }) });
  }
  async function createUserNotification(userId, title, body) {
    return api('/rest/v1/user_notifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: userId, title, body }) });
  }
  async function createUserNotifications(userIds, title, body) {
    const uniqueIds = [...new Set((Array.isArray(userIds) ? userIds : []).map(value => String(value || '').trim()).filter(Boolean))];
    if (!uniqueIds.length) fail('NOTIFICATION_RECIPIENTS_EMPTY');
    if (uniqueIds.length > 5000) fail('NOTIFICATION_RECIPIENTS_LIMIT');
    if (!String(title || '').trim() || String(title).length > 120 || !String(body || '').trim() || String(body).length > 2000) fail('NOTIFICATION_CONTENT_INVALID');
    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
      const rows = uniqueIds.slice(offset, offset + 100).map(user_id => ({ user_id, title: String(title).trim(), body: String(body).trim() }));
      await api('/rest/v1/user_notifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
    }
    return uniqueIds.length;
  }
  async function getUserNotifications() {
    return (await api(`/rest/v1/user_notifications?${query({ select: 'id,title,body,created_at,read_at', order: 'created_at.desc', limit: '100' })}`)) || [];
  }
  async function markNotificationRead(notificationId) {
    return api(`/rest/v1/user_notifications?${query({ id: `eq.${notificationId}` })}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
  }
  async function deleteAccount(targetUserId = null) {
    return api('/functions/v1/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetUserId ? { target_user_id: targetUserId } : {}) });
  }
  function readableAuthError(error) {
    const code = error?.message || String(error || '');
    if (code === 'SUPABASE_NOT_CONFIGURED') return 'الخدمة غير متاحة مؤقتًا. يُرجى المحاولة لاحقًا.';
    if (code === 'RECOVERY_LINK_INVALID' || code === 'RECOVERY_SESSION_MISSING') return 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من صفحة تسجيل الدخول.';
    if (code.includes('Invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
    if (code.includes('Email not confirmed')) return 'تعذّر الدخول إلى هذا الحساب حاليًا. راجع بيانات الدخول، وإذا استمرّ التعذّر فتواصل مع إدارة الموقع.';
    if (code.includes('User already registered')) return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
    if (code === 'AVATAR_SIZE') return 'حجم الصورة أكبر من 2 ميجابايت.';
    if (code === 'AVATAR_TYPE') return 'استخدم صورة JPG أو PNG أو WebP أو AVIF.';
    if (code === 'SESSION_REFRESH_INVALID') return 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.';
    if (code === 'USER_DATA_SAVE_EMPTY') return 'لم يؤكد الخادم حفظ البيانات. حاول مرة أخرى.';
    if (error?.status === 403) return 'الحساب غير معتمد أو لا يملك صلاحية المطوّر لهذه العملية.';
    return 'تعذّر إكمال الطلب الآن. تحقّق من الاتصال وحاول مرة أخرى بعد قليل.';
  }
  window.YSBackend = { supabaseConfigured, signInWithPassword, signUpWithPassword, sendPasswordRecovery, signOut, getSession, consumeRecoveryLink, updatePassword, getUserProfile, updateUserProfile, getUserPayload, saveUserPayload, isDeveloper, getAvatarUrl, uploadAvatar, removeAvatar, adminListProfiles, adminSetProfileStatus, getSupportConversations, createSupportConversation, getSupportMessages, sendSupportMessage, adminSetSupportStatus, createUserNotification, createUserNotifications, getUserNotifications, markNotificationRead, deleteAccount, readableAuthError };
})();
