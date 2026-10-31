// GESFLOTA — Edge Function: crear-demo
// Alta de demo hecha por un superadmin desde el panel central.
// Crea el usuario YA CONFIRMADO (email_confirm:true) con el service role, así
// el cliente puede ingresar directo con su email y contraseña, sin depender del
// email de confirmación de Supabase. El trigger handle_new_user arma la empresa
// y el perfil con rol 'user'. No toca la sesión del admin que la llama.
//
// Seguridad: valida contra el JWT del que llama que sea superadmin antes de usar
// el service role. El service role nunca sale del servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: Record<string, unknown>) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, error: 'No autorizado' });

    // 1) Validar que quien llama es superadmin
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: 'Sesión inválida' });
    const callerId = userData.user.id;

    const admin = createClient(url, serviceKey);
    const { data: perfilCaller, error: perfErr } = await admin
      .from('perfiles').select('rol').eq('id', callerId).single();
    if (perfErr || !perfilCaller || perfilCaller.rol !== 'superadmin') {
      return json({ ok: false, error: 'Requiere permisos de superadmin' });
    }

    // 2) Validar datos de entrada
    const body = await req.json().catch(() => ({}));
    const empresa = String(body?.empresa || '').trim();
    const nombre = String(body?.nombre || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (empresa.length < 2) return json({ ok: false, error: 'Nombre de empresa inválido' });
    if (!emailOk(email)) return json({ ok: false, error: 'Email inválido' });
    if (password.length < 8) return json({ ok: false, error: 'La contraseña necesita al menos 8 caracteres' });

    // nombre / apellido (el trigger también lo hace; lo dejamos explícito)
    let nom = nombre, ape = '';
    if (nombre.indexOf(' ') > 0) {
      const partes = nombre.split(/\s+/);
      nom = partes[0];
      ape = partes.slice(1).join(' ');
    }

    // 3) Crear usuario YA CONFIRMADO. El trigger handle_new_user arma empresa +
    //    perfil con rol 'user'. createUser con service role NO inicia sesión del
    //    nuevo usuario ni afecta la sesión del admin que llama.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        empresa, nombre: nom, apellido: ape, email,
        plan: 'demo', version_terminos: '2025-06', user_agent: 'alta-demo-mercateck',
      },
    });
    if (createErr) {
      const m = String((createErr as { message?: string })?.message || createErr);
      if (/already|registered|exists/i.test(m)) return json({ ok: false, error: 'Ese email ya tiene cuenta en GesFlota.' });
      return json({ ok: false, error: 'No se pudo crear la cuenta: ' + m });
    }

    return json({ ok: true, user_id: created?.user?.id || null, email });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
