// GESFLOTA — Edge Function: registrar-pago
// El cliente confirma su pago por transferencia: sube el comprobante y elige
// plan / periodicidad / add-on. La función (service role) valida el JWT,
// CALCULA EL MONTO DEL LADO DEL SERVIDOR (no confía en el cliente), guarda el
// comprobante en Storage, registra el pago como 'pendiente' y le avisa a
// MercaTeck por email con el comprobante adjunto. El alta final la hace el
// superadmin desde el panel (confirmar_pago).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Precios canónicos (del lado del servidor). Mensual en ARS.
const PRECIO_MES: Record<string, number> = { pro: 87800, enterprise: 178800 };
const ADDON_MES = 30000; // solo aplica al plan Pro
const r100 = (n: number) => Math.round(n / 100) * 100;

// Total según plan + periodicidad + add-on. Anual = 12 meses con 15% off.
function calcularMonto(plan: string, periodo: string, addon: boolean) {
  const base = PRECIO_MES[plan] || 0;
  const conAddon = addon && plan === 'pro';
  if (periodo === 'anual') {
    let total = r100(base * 12 * 0.85);
    if (conAddon) total += r100(ADDON_MES * 12 * 0.85);
    return { monto: total, meses: 12 };
  }
  let total = base;
  if (conAddon) total += ADDON_MES;
  return { monto: total, meses: 1 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, error: 'No autorizado' }, 401);

    // Quién llama
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: 'Sesión inválida' }, 401);
    const callerId = userData.user.id;
    const callerEmail = userData.user.email || '';

    const admin = createClient(url, serviceKey);
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('id', callerId).single();
    if (!perfil?.empresa_id) return json({ ok: false, error: 'No se encontró tu empresa' }, 400);
    const empresaId = perfil.empresa_id;
    const { data: emp } = await admin.from('empresas').select('nombre').eq('id', empresaId).single();
    const empresaNombre = emp?.nombre || '(sin nombre)';

    // Entrada
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || '').toLowerCase().trim();
    const periodo = String(body?.periodo || 'mensual').toLowerCase().trim();
    const addon = body?.addon === true;
    const b64raw = String(body?.comprobante_base64 || '');
    const nombreArch = String(body?.comprobante_nombre || 'comprobante').slice(0, 80);
    const tipo = String(body?.comprobante_tipo || '').toLowerCase().trim();

    if (!['pro', 'enterprise'].includes(plan)) return json({ ok: false, error: 'Plan inválido' }, 400);
    if (!['mensual', 'anual'].includes(periodo)) return json({ ok: false, error: 'Periodicidad inválida' }, 400);
    if (!b64raw) return json({ ok: false, error: 'Falta el comprobante' }, 400);

    // Tipo/extension permitidos
    const ext = tipo === 'application/pdf' || tipo === 'pdf' ? 'pdf'
      : (tipo === 'image/jpeg' || tipo === 'jpg' || tipo === 'jpeg') ? 'jpg'
      : (tipo === 'image/png' || tipo === 'png') ? 'png' : '';
    if (!ext) return json({ ok: false, error: 'El comprobante debe ser PDF, JPG o PNG' }, 400);
    const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';

    // Decodificar base64 (soporta data URL)
    const b64 = b64raw.indexOf(',') >= 0 ? b64raw.slice(b64raw.indexOf(',') + 1) : b64raw;
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
    catch { return json({ ok: false, error: 'Comprobante ilegible' }, 400); }
    if (bytes.length < 50) return json({ ok: false, error: 'El comprobante está vacío' }, 400);
    if (bytes.length > 8 * 1024 * 1024) return json({ ok: false, error: 'El comprobante supera los 8 MB' }, 400);

    // Monto del lado del servidor
    const { monto, meses } = calcularMonto(plan, periodo, addon);

    // Guardar el comprobante en Storage
    const path = `${empresaId}/${Date.now()}.${ext}`;
    const up = await admin.storage.from('comprobantes').upload(path, bytes, { contentType, upsert: false });
    if (up.error) return json({ ok: false, error: 'No se pudo guardar el comprobante: ' + up.error.message }, 500);

    // Registrar el pago como pendiente (lo confirma el superadmin)
    const nota = `Transferencia · ${periodo}${addon && plan === 'pro' ? ' + check-list' : ''} · comprobante subido por el cliente`;
    const ins = await admin.from('pagos').insert({
      empresa_id: empresaId,
      fecha: new Date().toISOString().slice(0, 10),
      plan,
      addon_checklist: addon && plan === 'pro',
      meses,
      monto_usd: 0,
      monto_ars: monto,
      medio: 'transferencia',
      estado: 'pendiente',
      comprobante_url: path,
      nota,
    }).select('id').single();
    if (ins.error) return json({ ok: false, error: 'No se pudo registrar el pago: ' + ins.error.message }, 500);

    // Avisar a MercaTeck con el comprobante adjunto (si falla el email, el pago igual queda registrado)
    let emailOk = false;
    try {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
      if (RESEND_API_KEY) {
        const montoFmt = '$' + monto.toLocaleString('es-AR');
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
          <h2 style="color:#C49A3A;">Nuevo comprobante de pago</h2>
          <p>Un cliente confirmó un pago por transferencia y subió el comprobante.</p>
          <table style="border-collapse:collapse;margin:16px 0;font-size:13px;">
            <tr><td style="padding:6px 12px;background:#faf7f0;">Empresa</td><td style="padding:6px 12px;"><b>${empresaNombre}</b></td></tr>
            <tr><td style="padding:6px 12px;background:#faf7f0;">Email</td><td style="padding:6px 12px;">${callerEmail}</td></tr>
            <tr><td style="padding:6px 12px;background:#faf7f0;">Plan</td><td style="padding:6px 12px;">${plan}${addon && plan === 'pro' ? ' + check-list' : ''}</td></tr>
            <tr><td style="padding:6px 12px;background:#faf7f0;">Periodicidad</td><td style="padding:6px 12px;">${periodo}</td></tr>
            <tr><td style="padding:6px 12px;background:#faf7f0;">Monto</td><td style="padding:6px 12px;"><b>${montoFmt}</b></td></tr>
          </table>
          <p style="color:#666;">Revisá el comprobante adjunto y aprobá el pago desde el panel de administración (Pagos).</p>
        </div>`;
        const payload: Record<string, unknown> = {
          from: `GesFlota by MercaTeck <${FROM_EMAIL}>`,
          to: ['germanmercado@mercateck.com.ar'],
          subject: `💳 Comprobante de pago — ${empresaNombre} (${montoFmt})`,
          html,
          attachments: [{ filename: `comprobante-${empresaNombre}.${ext}`.replace(/\s+/g, '_'), content: b64 }],
        };
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        emailOk = r.ok;
      }
    } catch (_e) { emailOk = false; }

    return json({ ok: true, pago_id: ins.data?.id, monto, email_aviso: emailOk });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
