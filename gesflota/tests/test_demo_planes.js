// ============================================================================
//  Regresión — Formulario de demo + consistencia de planes.
//  Cubre:
//   - El modal de demo tiene los campos Nombre y apellido (#demoNombre) y
//     Puesto (#demoPuesto), y enviarSolicitudDemo los valida e incluye en el email.
//   - La tarjeta Demo de la landing no tiene ítems atenuados (todas las funciones).
//   - La tarjeta Pro ya no dice "Todo lo del plan Demo".
//   - PLAN_PRECIO tiene los precios vigentes (pro 87800 / enterprise 178800).
//   - El chatbot (GES_RESPUESTAS) no dice "Todo lo de la Demo" en Pro y el Demo
//     figura con todas las funciones.
//  Uso:  node gesflota/tests/test_demo_planes.js
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
  await page.goto(BASE+'landing.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(500);

  let pass=0, fail=0;
  const check=(c,l)=>{ if(c)pass++; else {fail++; console.log('  ✗ '+l);} };

  // 1) Campos nuevos del formulario de demo
  const campos = await page.evaluate(()=>({
    nombre: !!document.getElementById('demoNombre'),
    puesto: !!document.getElementById('demoPuesto'),
  }));
  check(campos.nombre, 'Falta el campo #demoNombre en el modal de demo');
  check(campos.puesto, 'Falta el campo #demoPuesto en el modal de demo');

  // 2) Tarjeta Demo sin ítems atenuados + Pro sin "Todo lo del plan Demo"
  const landing = await page.evaluate(()=>{
    const grid = document.querySelector('.pricing-grid');
    const dim = grid ? grid.querySelectorAll('.dim').length : -1;
    return { dim, proDemo: (grid ? grid.textContent : '').includes('Todo lo del plan Demo') };
  });
  check(landing.dim===0, 'La tarjeta Demo todavía tiene ítems atenuados (.dim='+landing.dim+')');
  check(landing.proDemo===false, 'La tarjeta Pro todavía dice "Todo lo del plan Demo"');

  // 3) Precios vigentes del MRR
  const precios = await page.evaluate(()=> (typeof PLAN_PRECIO!=='undefined') ? PLAN_PRECIO : null);
  check(precios && precios.pro===87800, 'PLAN_PRECIO.pro debería ser 87800, es '+(precios&&precios.pro));
  check(precios && precios.enterprise===178800, 'PLAN_PRECIO.enterprise debería ser 178800, es '+(precios&&precios.enterprise));

  // 4) Chatbot: respuesta de planes corregida
  const chat = await page.evaluate(()=>{
    if(typeof GES_RESPUESTAS==='undefined') return null;
    const e = GES_RESPUESTAS.find(x=> x.r && x.r.includes('87.800') && x.r.includes('Demo') && x.r.includes('Enterprise'));
    if(!e) return { found:false };
    return { found:true, tieneTodoDemo: e.r.includes('Todo lo de la Demo'), demoTodas: e.r.includes('TODAS las funciones') };
  });
  check(chat && chat.found, 'No se encontró la respuesta de planes del chatbot');
  check(chat && chat.tieneTodoDemo===false, 'El chatbot todavía dice "Todo lo de la Demo" en el Pro');
  check(chat && chat.demoTodas===true, 'El chatbot ya no describe el Demo con TODAS las funciones');

  // 5) enviarSolicitudDemo: valida nombre/puesto e incluye ambos en el email
  const envio = await page.evaluate(()=>{
    window._capturado = null;
    window.enviarEmailInterno = (asunto, cuerpo, opts)=>{ window._capturado = { asunto, cuerpo, opts }; };
    // a) sin nombre → debe fallar
    ['demoNombre','demoPuesto','demoEmpresa','demoCant','demoEmail','demoTel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const tipo=document.getElementById('demoTipo'); if(tipo) tipo.value='Camiones';
    enviarSolicitudDemo();
    const err1 = document.getElementById('demoError');
    const falloSinNombre = err1 && err1.style.display==='block' && /nombre/i.test(err1.textContent);
    // b) completo → debe disparar el email con nombre y puesto
    document.getElementById('demoNombre').value = 'Juan Pérez';
    document.getElementById('demoPuesto').value = 'Jefe de flota';
    document.getElementById('demoEmpresa').value = 'Transportes SA';
    document.getElementById('demoCant').value = '12';
    if(tipo) tipo.value='Camiones';
    document.getElementById('demoEmail').value = 'juan@empresa.com';
    document.getElementById('demoTel').value = '2614696811';
    enviarSolicitudDemo();
    return {
      falloSinNombre: !!falloSinNombre,
      cuerpo: window._capturado ? window._capturado.cuerpo : ''
    };
  });
  check(envio.falloSinNombre, 'Sin nombre, enviarSolicitudDemo debería mostrar error');
  check(envio.cuerpo.includes('Juan Pérez'), 'El email de la solicitud no incluye el nombre y apellido');
  check(envio.cuerpo.includes('Jefe de flota'), 'El email de la solicitud no incluye el puesto');

  // 6) Registro público: el campo Nombre NO puede ser un email (candado anti-autocompletado)
  await page.goto(BASE+'login.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(400);
  const reg = await page.evaluate(()=>{
    const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
    set('regCompany','Transportes SA');
    set('regName','mercateckinfo@gmail.com'); // email metido en el campo Nombre
    set('regLast','pro');
    set('regEmail','juan@empresa.com');
    set('regPass','Abcd1234');
    const pl=document.getElementById('regPlan'); if(pl) pl.value='pro';
    const tc=document.getElementById('regTerms'); if(tc) tc.checked=true;
    if(typeof doRegister!=='function') return { ok:false, motivo:'doRegister no existe' };
    try{ doRegister(); }catch(e){ return { ok:false, motivo:e.message }; }
    const err=document.getElementById('regError');
    return { ok: !!(err && err.style.display==='block' && /email/i.test(err.textContent)) };
  });
  check(reg.ok, 'doRegister debería rechazar un email en el campo Nombre ('+(reg.motivo||'')+')');

  check(perr.length===0, 'Errores de página: '+perr.join(' | '));

  console.log('\nErrores de página: '+(perr.length?perr.join(' | '):'ninguno'));
  console.log('Demo + planes → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail?1:0);
})();
