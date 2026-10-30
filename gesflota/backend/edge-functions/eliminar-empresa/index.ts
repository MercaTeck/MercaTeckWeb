// ============================================================================
//  GESFLOTA — Edge Function: eliminar-empresa
//  Borra por completo una empresa (datos de negocio + usuarios de auth).
//  Solo la puede ejecutar un perfil con rol 'superadmin'.
//
//  Por qué una Edge Function y no el navegador:
//  borrar un usuario de auth.users requiere la service_role key, que NUNCA
//  debe estar en el cliente. Acá corre del lado del servidor, con la clave
//  inyectada por Supabase (SUPABASE_SERVICE_ROLE_KEY), nunca expuesta.
//
//  La mayoría de las tablas tienen FK ON DELETE CASCADE hacia 'empresas',
//  así que borrar la empresa arrastra vehículos, checklists, mantenimiento,
//  pagos, perfiles, etc. Las que NO cascadean (tickets, ticket_mensajes,
//  consentimientos) se borran explícitamente antes.
//
//  Respuestas: siempre HTTP 200 con { ok: boolean, ... }. Si ok=false, el
//  campo 'error' trae el detalle (así el cliente lo muestra tal cual).
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1) Identificar al solicitante por su JWT
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, error: 'No autorizado' });

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: 'Sesión inválida' });
    const callerId = userData.user.id;

    // 2) Verificar que sea superadmin (con service role, sin depender de RLS)
    const admin = createClient(url, serviceKey);
    const { data: perfilCaller, error: perfErr } = await admin
      .from('perfiles').select('rol, empresa_id').eq('id', callerId).single();
    if (perfErr || !perfilCaller || perfilCaller.rol !== 'superadmin') {
      return json({ ok: false, error: 'Requiere permisos de superadmin' });
    }

    // 3) Leer y validar empresa_id
    const body = await req.json().catch(() => ({}));
    const empresaId = body?.empresa_id;
    if (!empresaId) return json({ ok: false, error: 'Falta empresa_id' });

    // Seguridad: no permitir que el superadmin borre su propia empresa
    if (perfilCaller.empresa_id === empresaId) {
      return json({ ok: false, error: 'No podés borrar tu propia empresa' });
    }

    // Confirmar que la empresa existe (y traer su nombre para el log)
    const { data: emp } = await admin.from('empresas').select('id, nombre').eq('id', empresaId).single();
    if (!emp) return json({ ok: false, error: 'La empresa no existe' });

    // 4) Capturar los usuarios de auth de la empresa ANTES de borrar
    const { data: perfiles } = await admin.from('perfiles').select('id').eq('empresa_id', empresaId);
    const userIds = (perfiles || []).map((p: { id: string }) => p.id);

    // 5) Borrar tablas que NO cascadean hacia empresas
    await admin.from('ticket_mensajes').delete().eq('empresa_id', empresaId);
    await admin.from('tickets').delete().eq('empresa_id', empresaId);
    await admin.from('consentimientos').delete().eq('empresa_id', empresaId);

    // 6) Borrar la empresa → cascada al resto de las tablas
    const { error: delErr } = await admin.from('empresas').delete().eq('id', empresaId);
    if (delErr) return json({ ok: false, error: 'No se pudo borrar la empresa: ' + delErr.message });

    // 7) Borrar los usuarios de auth asociados
    let usuariosBorrados = 0;
    for (const uid of userIds) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (!error) usuariosBorrados++;
    }

    return json({
      ok: true,
      empresa_id: empresaId,
      empresa_nombre: emp.nombre,
      usuarios_borrados: usuariosBorrados,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
