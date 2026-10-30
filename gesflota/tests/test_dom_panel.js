// ============================================================================
//  Regresión DOM — Panel admin (pestañas), alta de demo (captcha) y login.
//  Uso:  node gesflota/tests/test_dom_panel.js
//  Requiere Playwright (npm i -D playwright). Bloquea la red externa y stubbea
//  Supabase, así corre sin credenciales ni internet.
// ============================================================================
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.join(__dirname, '..', 'frontend') + '/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await ctx.addInitScript(() => {
    const chain = () => new Proxy(function(){}, { get: () => chain(), apply: () => Promise.resolve({ data: null, error: null }) });
    window.supabase = { createClient: () => ({ auth: { getUser: async()=>({data:{user:null}}), onAuthStateChange(){}, getSession: async()=>({data:{session:null}}) }, from: chain, rpc: chain, functions: { invoke: async()=>({data:null,error:null}) }, channel: chain }) };
  });

  let pass=0, fail=0; const errs=[];
  const check=(c,l)=>{ if(c)pass++; else {fail++; console.log('  ✗ '+l);} };

  // login.html — botones de Google ocultos
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errs.push('login: '+e.message));
  await p1.goto(BASE+'login.html', { waitUntil:'domcontentloaded' });
  await p1.waitForTimeout(600);
  const googles = await p1.$$('.auth-google');
  check(googles.length===2, 'login: 2 botones .auth-google');
  for (const g of googles){ const d = await g.evaluate(el => getComputedStyle(el).display); check(d==='none', 'login: Google oculto (display='+d+')'); }

  // dashboard.html — pestañas admin + captcha alta demo
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push('dash: '+e.message));
  await p2.goto(BASE+'dashboard.html', { waitUntil:'domcontentloaded' });
  await p2.waitForTimeout(800);
  check(await p2.$('#admTabbar')!==null, 'dash: barra de pestañas');
  check((await p2.$$('#admTabbar .adm-tab-btn')).length===7, 'dash: 7 botones de pestaña');
  check((await p2.$$('#view-admin .admtab')).length===7, 'dash: 7 paneles .admtab');
  check(await p2.$('#admtab-empresas.active')!==null, 'dash: Empresas activo por defecto');
  check(await p2.$('#altaDemoCaptchaBox')!==null, 'dash: #altaDemoCaptchaBox');
  check(await p2.$('#hcaptcha-altademo')!==null, 'dash: #hcaptcha-altademo');
  for (const fn of ['showAdminTab','eliminarEmpresaAdmin','_initCaptchaAltaDemo','crearCuentaDemo','gesEnviar']){
    const t = await p2.evaluate(n => typeof window[n], fn);
    check(t==='function', 'dash: '+fn+'() definida');
  }
  await p2.evaluate(() => showAdminTab('facturacion'));
  await p2.waitForTimeout(100);
  check(await p2.$eval('#admtab-facturacion', el => el.classList.contains('active')) &&
        !(await p2.$eval('#admtab-empresas', el => el.classList.contains('active'))),
        'dash: showAdminTab("facturacion") togglea bien');
  check(!(await p2.evaluate(() => document.body.innerHTML.indexOf('Borrar datos de Flota')>=0)), 'dash: "Borrar mis datos" eliminado');

  // login.html — regresión: loginSuccess NO debe tirar (antes fallaba en navUserName)
  // y showToast debe auto-crear su contenedor. En el split, login.html no tiene el DOM del panel.
  const p3 = await ctx.newPage(); const e3=[];
  p3.on('pageerror', e => e3.push('login: '+e.message));
  await p3.goto(BASE+'login.html', { waitUntil:'domcontentloaded' });
  await p3.waitForTimeout(400);
  const r3 = await p3.evaluate(()=>{
    let toastThrew=false, lsThrew=false;
    try{ Object.defineProperty(window.location,'replace',{configurable:true,value:()=>{}}); }catch(e){}
    try{ showToast('t','success'); }catch(e){ toastThrew=true; }
    try{ loginSuccess({email:'x@y.com',name:'G',company:'C',plan:'pro',role:'admin',empresa_id:'1',rol_real:'superadmin',estado_pago:'vencido'}); }catch(e){ lsThrew=true; }
    return { toastThrew, lsThrew, wrap: !!document.getElementById('toastWrap') };
  });
  check(r3.toastThrew===false, 'login.html: showToast no tira');
  check(r3.wrap===true, 'login.html: showToast crea #toastWrap');
  check(r3.lsThrew===false, 'login.html: loginSuccess no tira (redirige a dashboard)');

  console.log('\nErrores de página:', errs.length?('\n  - '+errs.join('\n  - ')):'ninguno');
  console.log('DOM panel → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail>0?1:0);
})();
