// ============================================================================
//  Regresión — Bloqueo "pendiente de pago".
//  Un plan pago (pro/enterprise) con estado_pago != al_dia solo puede entrar a
//  Configuración; el resto del menú se oculta y aparece el aviso + botón de pago.
//  Demo y planes al día NO se bloquean.
//  Uso:  node gesflota/tests/test_pendiente_pago.js
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

  function estado(user){
    return page.evaluate((u)=>{
      try{ loginSuccess(u); }catch(e){ return { err:e.message }; }
      function vis(tab){ var it=document.querySelector('[data-tab="'+tab+'"]')||document.querySelector('[onclick*="'+tab+'"]'); return it ? getComputedStyle(it).display!=='none' : null; }
      // intentar ir a flota
      try{ var f=document.querySelector('[onclick*="dash-flota"]'); setTab(f,'dash-flota'); }catch(e){}
      var flotaView = document.getElementById('dash-flota');
      var cfgView = document.getElementById('dash-config');
      return {
        pendiente: !!window._pendientePago,
        banner: !!document.getElementById('bannerPendientePago'),
        verFlotaItem: vis('dash-flota'),
        verConfigItem: vis('dash-config'),
        flotaVisible: flotaView ? getComputedStyle(flotaView).display!=='none' : null,
        cfgVisible: cfgView ? getComputedStyle(cfgView).display!=='none' : null
      };
    }, user);
  }

  // 1) Pro en 'prueba' → bloqueado
  const pro = await estado({ name:'Test', email:'t@e.com', company:'C', plan:'pro', role:'user', empresa_id:'E1', estado_pago:'prueba' });
  check(pro.pendiente===true, 'Pro prueba debería quedar pendiente de pago');
  check(pro.banner===true, 'Debería aparecer el aviso de pendiente de pago');
  check(pro.verFlotaItem===false, 'El ítem Flota debería ocultarse');
  check(pro.verConfigItem===true, 'El ítem Configuración debe seguir visible');
  check(pro.flotaVisible===false && pro.cfgVisible===true, 'Al intentar ir a Flota debe quedarse en Configuración');

  // 2) Demo en 'prueba' → NO bloqueado
  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(300);
  const demo = await estado({ name:'Test', email:'d@e.com', company:'C', plan:'demo', role:'user', empresa_id:'E2', estado_pago:'prueba' });
  check(demo.pendiente===false, 'Demo NO debería quedar pendiente de pago');
  check(demo.verFlotaItem===true, 'Demo debe ver el ítem Flota');

  // 3) Pro 'al_dia' → NO bloqueado
  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(300);
  const alDia = await estado({ name:'Test', email:'p@e.com', company:'C', plan:'pro', role:'user', empresa_id:'E3', estado_pago:'al_dia' });
  check(alDia.pendiente===false, 'Pro al_dia NO debería quedar pendiente');
  check(alDia.verFlotaItem===true, 'Pro al_dia debe ver el ítem Flota');

  console.log('\nErrores de página: '+(perr.length?perr.join(' | '):'ninguno'));
  console.log('Pendiente de pago → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail?1:0);
})();
