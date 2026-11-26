const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function jsonOrNull(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !publicKey || !serviceKey || !authorization?.startsWith('Bearer ')) {
    return reply(503, { error: 'function_not_configured' });
  }

  let body: { target_user_id?: unknown };
  try { body = await request.json(); }
  catch { return reply(400, { error: 'invalid_json' }); }

  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: authorization }
  });
  const caller = await jsonOrNull(authResponse);
  if (!authResponse.ok || !caller?.id) return reply(401, { error: 'unauthorized' });

  const targetId = typeof body.target_user_id === 'string' ? body.target_user_id : caller.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    return reply(400, { error: 'invalid_target' });
  }

  const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  if (targetId !== caller.id) {
    const roleUrl = new URL(`${url}/rest/v1/app_user_roles`);
    roleUrl.search = new URLSearchParams({ select: 'user_id', user_id: `eq.${caller.id}`, role: 'eq.developer', limit: '1' }).toString();
    const roleResponse = await fetch(roleUrl, { headers: adminHeaders });
    const roleRows = await jsonOrNull(roleResponse);
    if (!roleResponse.ok || !Array.isArray(roleRows) || !roleRows.length) return reply(403, { error: 'not_authorized' });

    const targetRoleUrl = new URL(`${url}/rest/v1/app_user_roles`);
    targetRoleUrl.search = new URLSearchParams({ select: 'user_id', user_id: `eq.${targetId}`, role: 'eq.developer', limit: '1' }).toString();
    const targetRoleResponse = await fetch(targetRoleUrl, { headers: adminHeaders });
    const targetRoleRows = await jsonOrNull(targetRoleResponse);
    if (!targetRoleResponse.ok || !Array.isArray(targetRoleRows)) return reply(500, { error: 'target_role_check_failed' });
    if (targetRoleRows.length) return reply(409, { error: 'developer_target_protected' });
  }

  const storageUrl = `${url}/storage/v1/object`;
  for (;;) {
    const listResponse = await fetch(`${storageUrl}/list/avatars`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: targetId, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } })
    });
    const files = await jsonOrNull(listResponse);
    if (!listResponse.ok || !Array.isArray(files)) return reply(500, { error: 'avatar_cleanup_failed' });
    const paths = files.filter((file: { id?: string | null }) => file?.id).map((file: { name: string }) => `${targetId}/${file.name}`);
    if (!paths.length) break;
    const removeResponse = await fetch(`${storageUrl}/avatars`, {
      method: 'DELETE',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths.map(encodePath) })
    });
    if (!removeResponse.ok) return reply(500, { error: 'avatar_cleanup_failed' });
  }

  const deleteResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
    headers: adminHeaders
  });
  if (!deleteResponse.ok) return reply(400, { error: 'delete_failed' });
  return reply(200, { success: true });
});
