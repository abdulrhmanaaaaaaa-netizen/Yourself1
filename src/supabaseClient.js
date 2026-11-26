import { createClient } from '@supabase/supabase-js';

// Public browser configuration for the existing Yourself Supabase project.
// Publishable keys are intended for client-side use; never put service-role/secret keys here.
const url = 'https://jxdzihloouksaebxigrz.supabase.co';
const publishableKey = 'sb_publishable_jYfrzGshksyPQZYkKYz7cQ_a8FpXZ_-';

export const supabaseConfigured = Boolean(url && publishableKey);
export const supabase = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    })
  : null;

function requireClient() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email, password) {
  return unwrap(await requireClient().auth.signInWithPassword({ email, password }));
}

export async function signUpWithPassword(email, password, fullName, appPayload) {
  return unwrap(await requireClient().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, app_payload: appPayload },
      emailRedirectTo: window.location.origin
    }
  }));
}


export async function signOut() {
  return unwrap(await requireClient().auth.signOut());
}

export async function getUserProfile(userId) {
  const { data, error } = await requireClient()
    .from('user_profiles')
    .select('id,email,full_name,job_title,account_status,avatar_path,created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(userId, fields) {
  return unwrap(await requireClient()
    .from('user_profiles')
    .update(fields)
    .eq('id', userId)
    .select('id,email,full_name,job_title,account_status,avatar_path,created_at')
    .single());
}

export async function getUserPayload(userId) {
  const { data, error } = await requireClient()
    .from('user_data')
    .select('payload,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveUserPayload(userId, payload) {
  return unwrap(await requireClient()
    .from('user_data')
    .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('user_id,updated_at')
    .single());
}

export async function isDeveloper(userId) {
  const { data, error } = await requireClient()
    .from('app_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'developer')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getAvatarUrl(path) {
  if (!path) return '';
  const { data, error } = await requireClient()
    .storage.from('avatars').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
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
  const { error: uploadError } = await requireClient()
    .storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;
  try {
    await updateUserProfile(userId, { avatar_path: path });
  } catch (error) {
    await requireClient().storage.from('avatars').remove([path]);
    throw error;
  }
  if (previousPath) await requireClient().storage.from('avatars').remove([previousPath]);
  return { path, url: await getAvatarUrl(path) };
}

export async function removeAvatar(userId, path) {
  if (path) {
    const { error } = await requireClient().storage.from('avatars').remove([path]);
    if (error) throw error;
  }
  await updateUserProfile(userId, { avatar_path: null });
}

export async function adminListProfiles() {
  return unwrap(await requireClient().rpc('admin_list_profiles')) || [];
}

export async function adminSetProfileStatus(userId, status) {
  return unwrap(await requireClient().rpc('admin_set_profile_status', {
    target_user_id: userId,
    new_status: status
  }));
}

export async function deleteAccount(targetUserId = null) {
  return unwrap(await requireClient().functions.invoke('delete-account', {
    body: targetUserId ? { target_user_id: targetUserId } : {}
  }));
}

export function readableAuthError(error) {
  const code = error?.message || String(error || '');
  if (code === 'SUPABASE_NOT_CONFIGURED') return 'تعذر الاتصال بإعدادات Supabase المضمنة. راجع إعدادات النشر.';
  if (code.includes('Invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
  if (code.includes('Email not confirmed')) return 'أكد بريدك الإلكتروني من الرسالة التي أرسلناها لك.';
  if (code.includes('User already registered')) return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
  if (code === 'AVATAR_SIZE') return 'حجم الصورة أكبر من 2 ميجابايت.';
  if (code === 'AVATAR_TYPE') return 'استخدم صورة JPG أو PNG أو WebP أو AVIF.';
  return 'تعذر إكمال الطلب. تحقّق من الإعداد والاتصال ثم حاول مرة أخرى.';
}
