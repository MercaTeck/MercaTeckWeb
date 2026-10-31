// ============================================================================
//  Regresión — Ruteo de temas del chatbot (service, km, vtv, reglas,
//  constructor, personal, historial, etc.). Verifica que cada consulta caiga
//  en la entrada correcta del conocimiento (no en una genérica por colisión).
//  Uso:  node gesflota/tests/test_chatbot_temas.js
// ============================================================================
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.join(__dirname, '..', 'frontend') + '/';

// Pregunta → tema esperado (k[0] de la entrada que debe responder)
const CASOS = [
  ['vtv', 'vtv'],
  ['service', 'service'],
  ['kilometraje', 'kilometraje'],
  ['km', 'kilometraje'],
  ['horas', 'kilometraje'],
  ['reglas', 'regla'],
  ['constructor', 'armar checklist'],
  ['personal', 'qr'],
  ['accesos', 'qr'],
  ['cada cuanto hago el service', 'service'],
  ['como cargo el kilometraje', 'kilometraje'],
  ['cuando vence la vtv', 'ver vencimientos'],
  ['finalizar tarea de mantenimiento', 'finalizar mantenimiento'],
  ['historial del vehiculo', 'historial'],
  ['reglas del checklist', 'regla'],
  ['como armo el checklist', 'armar checklist'],
];

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
  await page.waitForTimeout(600);

  await page.evaluate(()=>{
    window.__botCapt = [];
    window.gesAgregarMsg = function(txt, who){ if(who==='bot') window.__botCapt.push(txt); };
    window.renderGesSugerencias = function(){};
    window.__mapR = {};
    (window.GES_PROBLEMAS||[]).concat(window.GES_RESPUESTAS||[]).forEach(function(it){ window.__mapR[it.r]= it.k[0]; });
  });

  let pass=0, fail=0;
  for (const [q, esperado] of CASOS){
    const tema = await page.evaluate(async (q)=>{
      window.__botCapt = [];
      try { gesProcesarPregunta(q); } catch(e){ return 'ERROR:'+e.message; }
      await new Promise(r=>setTimeout(r, 650));
      const last = window.__botCapt[window.__botCapt.length-1] || '';
      return window.__mapR[last] || '(fallback/otro)';
    }, q);
    if (tema === esperado) { pass++; }
    else { fail++; console.log('  ✗ « '+q+' » → "'+tema+'"  (esperaba "'+esperado+'")'); }
  }

  console.log('\nErrores de página:', perr.length?('\n  - '+perr.join('\n  - ')):'ninguno');
  if (perr.length) fail++;
  console.log('Chatbot temas → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail>0?1:0);
})();
