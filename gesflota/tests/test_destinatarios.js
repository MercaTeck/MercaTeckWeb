// ============================================================================
//  Regresión — Destinatarios de alertas por email.
//  Verifica que al ELIMINAR un destinatario se borre de la base (no solo local),
//  y que al EDITAR se ACTUALICE (no se duplique). Es el bug de "los emails no se
//  borran y reaparecen al recargar".
//  Uso:  node gesflota/tests/test_destinatarios.js
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
  await page.waitForTimeout(500);

  let pass=0, fail=0;
  const check=(c,l)=>{ if(c)pass++; else {fail++; console.log('  ✗ '+l);} };

  // Instalar sb que REGISTRA las operaciones sobre destinatarios_email
  await page.evaluate(()=>{
    window.__ops = [];
    const rec = (table) => ({
      delete(){ const op={table, type:'delete', f:{}}; window.__ops.push(op);
        const c={ eq(k,v){op.f[k]=v; return c;}, then(cb){cb({error:null}); return c;}, catch(){return c;} }; return c; },
      insert(row){ const op={table, type:'insert', row}; window.__ops.push(op);
        const c={ select(){return c;}, eq(){return c;}, then(cb){cb({error:null, data:[{id:'NEW-ID-123'}]}); return c;}, catch(){return c;} }; return c; },
      update(row){ const op={table, type:'update', row, f:{}}; window.__ops.push(op);
        const c={ eq(k,v){op.f[k]=v; return c;}, then(cb){cb({error:null}); return c;}, catch(){return c;} }; return c; },
      select(){ const c={ eq(){return c;}, then(cb){cb({error:null,data:[]}); return c;} }; return c; }
    });
    window.sb = { from: rec };
    window._empresaId = 'EMP-1';
    window.genConfirm = (t,m,cb)=>cb();          // confirmar automático
    window.showToast = ()=>{};
    window.renderDestinatarios = ()=>{};
  });

  // 1) ELIMINAR → debe borrar de la base por id + empresa_id, y sacarlo del array
  const del = await page.evaluate(()=>{
    window._destinatarios = [{ _id:'DEST-ABC', email:'alertas@empresa.com' }];
    window.__ops = [];
    deleteDestinatario(0);
    const op = window.__ops.find(o=>o.table==='destinatarios_email' && o.type==='delete');
    return { huboDelete: !!op, idOk: op && op.f.id==='DEST-ABC', empOk: op && op.f.empresa_id==='EMP-1', quedaron: window._destinatarios.length };
  });
  check(del.huboDelete, 'eliminar: se llama DELETE a destinatarios_email');
  check(del.idOk, 'eliminar: filtra por el id correcto');
  check(del.empOk, 'eliminar: filtra por empresa_id (multi-tenant)');
  check(del.quedaron===0, 'eliminar: se saca del listado local');

  // 2) EDITAR → debe ACTUALIZAR (no insertar duplicado), conservando el _id
  const edit = await page.evaluate(()=>{
    // crear los campos del formulario si no están, para que saveDestinatario no falle
    const mk = (id,val)=>{ let el=document.getElementById(id); if(!el){ el=document.createElement('input'); el.id=id; document.body.appendChild(el);} el.value=val; return el; };
    mk('gen_email','alertas@empresa.com'); mk('gen_scope','todos'); mk('gen_mensaje','');
    window._destinatarios = [{ _id:'DEST-ABC', email:'alertas@empresa.com' }];
    window._editDestIdx = 0;
    window.__ops = [];
    saveDestinatario();
    const upd = window.__ops.find(o=>o.table==='destinatarios_email' && o.type==='update');
    const ins = window.__ops.find(o=>o.table==='destinatarios_email' && o.type==='insert');
    return { huboUpdate: !!upd, updId: upd && upd.f.id==='DEST-ABC', huboInsert: !!ins, idConservado: window._destinatarios[0] && window._destinatarios[0]._id==='DEST-ABC' };
  });
  check(edit.huboUpdate, 'editar: se llama UPDATE (no insert)');
  check(edit.updId, 'editar: actualiza el id correcto');
  check(!edit.huboInsert, 'editar: NO crea un duplicado (sin insert)');
  check(edit.idConservado, 'editar: conserva el _id del registro');

  // 3) ALTA nueva → debe INSERTAR con .select() y guardar el id devuelto
  const alta = await page.evaluate(()=>{
    const mk = (id,val)=>{ let el=document.getElementById(id); if(!el){ el=document.createElement('input'); el.id=id; document.body.appendChild(el);} el.value=val; return el; };
    mk('gen_email','nuevo@empresa.com'); mk('gen_scope','todos'); mk('gen_mensaje','');
    window._destinatarios = [];
    window._editDestIdx = -1;
    window.__ops = [];
    saveDestinatario();
    const ins = window.__ops.find(o=>o.table==='destinatarios_email' && o.type==='insert');
    return { huboInsert: !!ins, idGuardado: window._destinatarios[0] && window._destinatarios[0]._id==='NEW-ID-123' };
  });
  check(alta.huboInsert, 'alta: se llama INSERT');
  check(alta.idGuardado, 'alta: guarda el id devuelto por .select() (borrable sin recargar)');

  console.log('\nErrores de página:', perr.length?('\n  - '+perr.join('\n  - ')):'ninguno');
  if (perr.length) fail++;
  console.log('Destinatarios → PASÓ: '+pass+' | FALLÓ: '+fail);
  await browser.close();
  process.exit(fail>0?1:0);
})();
