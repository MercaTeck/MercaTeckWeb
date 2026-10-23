const https = require('https');

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZG9qdXBwdm9rZHZ2enNlZ29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjkwNDgsImV4cCI6MjA5ODI0NTA0OH0.vTJNDqBbXmLdYdAXU-ZledHPQ5tn_vU6Cay9twkUqgU';

const rpcs = [
  'exec_sql',
  'execute_sql',
  'run_sql',
  'crear_perfil',
  'actualizar_perfil',
  'validar_acceso_checklist',
  'guardar_checklist_operario',
  'config_checklist_empresa'
];

rpcs.forEach(rpc => {
  const req = https.request(`https://fbdojuppvokdvvzsegoe.supabase.co/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    }
  }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => console.log(`RPC ${rpc}: Status ${res.statusCode} -> ${d.slice(0, 100)}`));
  });
  req.write(JSON.stringify({}));
  req.end();
});

