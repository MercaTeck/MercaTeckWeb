// ============================================================================
//  Regresión — handlers inline (onclick/onkeyup/onchange) sin definir.
//  Uso:  node gesflota/tests/test_handlers.js
//  Caza el tipo de bug del split: una página llama a una función (ej.
//  _scrollArriba) que no quedó definida en ningún .js → ReferenceError al usarla.
// ============================================================================
const fs = require('fs');
const path = require('path');
const F = (p) => path.join(__dirname, '..', 'frontend', p);

let js = '';
for (const f of ['js/ui-dashboard.js', 'js/utils.js', 'js/ui-landing.js', 'js/ui-operario.js']) {
  try { js += fs.readFileSync(F(f), 'utf8'); } catch (e) {}
}
const defs = new Set();
for (const m of js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
for (const m of js.matchAll(/(?:const|var|let|window\.)\s*([A-Za-z_$][\w$]*)\s*=\s*function/g)) defs.add(m[1]);
for (const m of js.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);

const builtins = new Set(['click','getElementById','print','querySelector','focus','blur','reset','submit','preventDefault','stopPropagation','open','close','reload','alert','confirm','scrollTo','scrollIntoView']);

let fail = 0;
for (const page of ['landing.html','login.html','dashboard.html','operario.html']) {
  const html = fs.readFileSync(F(page), 'utf8');
  const calls = new Set();
  const attrs = [...html.matchAll(/on(?:click|keyup|change|submit)="([^"]+)"/g)].map(m => m[1]);
  for (const a of attrs) for (const m of a.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) calls.add(m[1]);
  const missing = [...calls].filter(c => !defs.has(c) && !builtins.has(c) && !/^(if|for|while|return)/.test(c)).sort();
  if (missing.length) { fail++; console.log('  ✗ ' + page + ': handlers no definidos → ' + missing.join(', ')); }
}
console.log('\nHandlers inline → ' + (fail ? ('FALLÓ en ' + fail + ' página(s)') : 'TODOS DEFINIDOS ✓'));
process.exit(fail > 0 ? 1 : 0);
