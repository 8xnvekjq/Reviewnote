import { createClient } from 'jsr:@supabase/supabase-js@2';

const ERROR = 'QR이 만료됐거나 이미 사용됐어요. 휴대폰에서 새로 만들어 주세요.';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: ERROR }, 405);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const miss = async (status = 400) => {
    await client.rpc('insert_qr_login_failure', { p_ip: ip });
    return json({ error: ERROR }, status);
  };
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: count, error: countError } = await client.rpc('count_qr_login_failures', { p_ip: ip, p_since: since });
    if (countError) return await miss(503);
    if (Number(count) >= 20) return await miss(429);
    // x-forwarded-for는 요청하는 쪽이 꾸밀 수 있으므로 모든 IP를 합친 상한도 둔다(8자 코드 무작위 대입 방지).
    const { data: total, error: totalError } = await client.rpc('count_qr_login_failures', { p_ip: null, p_since: since });
    if (totalError) return await miss(503);
    if (Number(total) >= 200) return json({ error: '잠시 후 다시 시도해 주세요.' }, 429);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return await miss(); }
    if (!body || typeof body !== 'object') return await miss();
    const token = typeof body.token === 'string' ? body.token : null;
    const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[\s-]/g, '') : null;
    if ((token === null) === (code === null)) return await miss();
    if (token !== null && !/^[A-Za-z0-9_-]{43}$/.test(token)) return await miss();
    if (code !== null && !/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(code)) return await miss();
    // 소비 함수가 관리자 여부를 다시 확인하고 원자적으로 한 번만 사용한다.
    const { data: userId, error } = await client.rpc('consume_qr_login', {
      p_token_hash: token === null ? null : await hash(token),
      p_code_hash: code === null ? null : await hash(code),
    });
    if (error || !userId) return await miss();
    const { data: user, error: userError } = await client.auth.admin.getUserById(userId);
    if (userError || !user.user?.email) return await miss();
    const { data: link, error: linkError } = await client.auth.admin.generateLink({ type: 'magiclink', email: user.user.email });
    if (linkError || !link.properties?.hashed_token) return await miss();
    return json({ token_hash: link.properties.hashed_token });
  } catch { return await miss(); }
});
