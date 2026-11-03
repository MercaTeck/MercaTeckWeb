// ============================================================================
//  Regresión — Ventana "Confirmar pago".
//  Verifica: plan por defecto, total mensual/anual, add-on solo en Pro,
//  comprobante obligatorio (no confirma sin archivo) y el cartel "en proceso".
//  Uso:  node gesflota/tests/test_confirmar_pago.js
// ============================================================================
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.join(__dirname, '..', 'frontend') + '/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await ctx.addInitScript(() => {
    const res = { data:null, error:null };
    const chain = () => new Proxy(function(){}, { get(t,p){ if(p==='then') return f=>{try{f(res)}catch(e){}; return chain()}; return ()=>chain(); }, apply(){ return chain(); } });
    window.supabase = { createClient: () => ({ auth:{ getUser:async()=>({data:{user:null}}), onAuthStateChange(){}, getSession:async()=>({data:{session:null}}), signOut(){} }, from:()=>chain(), rpc:()=>chain(), functions:{invoke:()=>chain()}, channel:()=>chain() })};
  });
  const page = await ctx.newPage();
  const perr=[]; page.on('pageerror', e=>perr.push(e.message));
  await page.goto(BASE+'dashboard.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(400);

  let pass=0, fail=0;
  const check=(c,l)=>{ if(c)pass++; else {fail++; console.log('  ✗ '+l);} };

  // Usuario Pro al día (para poder abrir la ventana con plan por defecto = pro)
  await page.evaluate(()=>{ try{ loginSuccess({ name:'T', email:'t@e.com', company:'C', plan:'pro', role:'user', empresa_id:'E1', estado_pago:'al_dia' }); }catch(e){} });

  // 1) Abrir ventana → plan por defecto Pro, total mensual
  const abrir = await page.evaluate(()=>{
    abrirConfirmarPago();
    return {
      abierta: document.getElementById('confirmarPagoModal').classList.contains('open'),
      plan: window._cpPlan,
      total: document.getElementById('cpTotal').textContent,
      addonVisible: getComputedStyle(document.getElementById('cpAddonBox')).display !== 'none'
    };
  });
  check(abrir.abierta===true, 'La ventana debería abrirse');
  check(abrir.plan==='pro', 'El plan por defecto debería ser Pro');
  check(abrir.total==='87.800', 'Total Pro mensual debería ser 87.800 (es '+abrir.total+')');
  check(abrir.addonVisible===true, 'El add-on debería verse en Pro');

  // 2) Add-on mensual Pro → 117.800
  const addon = await page.evaluate(()=>{ document.getElementById('cpAddon').checked=true; _cpActualizar(); return document.getElementById('cpTotal').textContent; });
  check(addon==='117.800', 'Pro mensual + add-on debería ser 117.800 (es '+addon+')');

  // 3) Anual Pro + add-on → 1.201.600
  const anual = await page.evaluate(()=>{ document.querySelector('input[name="cpPeriodo"][value="anual"]').checked=true; _cpActualizar(); return document.getElementById('cpTotal').textContent; });
  check(anual==='1.201.600', 'Pro anual + add-on debería ser 1.201.600 (es '+anual+')');

  // 4) Enterprise → add-on oculto, total mensual 178.800
  const ent = await page.evaluate(()=>{
    document.querySelector('input[name="cpPeriodo"][value="mensual"]').checked=true;
    _cpElegirPlan('enterprise');
    return { addonVisible: getComputedStyle(document.getElementById('cpAddonBox')).display !== 'none', total: document.getElementById('cpTotal').textContent };
  });
  check(ent.addonVisible===false, 'El add-on NO debería verse en Enterprise');
  check(ent.total==='178.800', 'Enterprise mensual debería ser 178.800 (es '+ent.total+')');

  // 5) Sin comprobante no confirma
  const sinArch = await page.evaluate(()=>{
    window._cpArchivoB64 = null;
    _cpConfirmar();
    var err = document.getElementById('cpError');
    var s2 = document.getElementById('cpStep2');
    return { error: !!(err && err.style.display==='block'), step2: getComputedStyle(s2).display!=='none' };
  });
  check(sinArch.error===true, 'Sin comprobante debería mostrar error');
  check(sinArch.step2===false, 'Sin comprobante NO debería pasar a "procesando"');

  // 6) Con comprobante + edge function ok → cartel "en proceso"
  const okProc = await page.evaluate(()=>{
    window._cpArchivoB64 = 'data:application/pdf;base64,JVBERi0=';
    window._cpArchivoTipo = 'application/pdf';
    window._cpArchivoNombre = 'comprobante.pdf';
    // sb con functions.invoke que resuelve ok
    const chain = () => new Proxy(function(){}, { get(t,p){ return ()=>chain(); }, apply(){ return chain(); } });
    window.sb = { functions:{ invoke:()=>Promise.resolve({ data:{ ok:true, monto:117800 }, error:null }) }, from:()=>chain() };
    _cpConfirmar();
    return true;
  });
  await page.waitForTimeout(200);
  const step2 = await page.evaluate(()=> getComputedStyle(document.getElementById('cpStep2')).display!=='none');
  check(step2===true, 'Con comprobante y respuesta ok debería mostrar "Tu pago se está procesando"');

  console.log('\nErrores de página: '+(perr.length?perr.join(' | '):'ninguno'));
  console.log('Confirmar pago → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail?1:0);
})();
