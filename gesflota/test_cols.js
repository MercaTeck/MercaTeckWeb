const https = require('https');

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZG9qdXBwdm9rZHZ2enNlZ29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjkwNDgsImV4cCI6MjA5ODI0NTA0OH0.vTJNDqBbXmLdYdAXU-ZledHPQ5tn_vU6Cay9twkUqgU';

function testCol(col) {
  const url = `https://fbdojuppvokdvvzsegoe.supabase.co/rest/v1/perfiles?select=${col}&limit=1`;
  https.get(url, { headers: { apikey: key, Authorization: 'Bearer ' + key } }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => console.log(`Column '${col}': Status ${res.statusCode} -> ${d}`));
  });
}

testCol('id');
testCol('nombre');
testCol('apellido');
testCol('email');
testCol('rol');
testCol('empresa_id');

