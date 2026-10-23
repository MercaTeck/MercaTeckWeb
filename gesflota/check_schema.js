const https = require('https');

const url = 'https://fbdojuppvokdvvzsegoe.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZG9qdXBwdm9rZHZ2enNlZ29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjkwNDgsImV4cCI6MjA5ODI0NTA0OH0.vTJNDqBbXmLdYdAXU-ZledHPQ5tn_vU6Cay9twkUqgU';

const req = https.request(url, {
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Tables available in definitions:');
      const defs = parsed.definitions || {};
      for (const t in defs) {
        if (t === 'perfiles' || t === 'empresas' || t === 'usuarios_empresa') {
          console.log(`\n=== Table: ${t} ===`);
          console.log(defs[t].properties);
        }
      }
    } catch(e) {
      console.log('Error parsing JSON:', e.message, data.slice(0, 300));
    }
  });
});

req.on('error', e => console.error(e));
req.end();

