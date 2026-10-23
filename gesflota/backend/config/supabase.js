/* ==========================================================================
   GESFLOTA - CONFIGURACIÓN CENTRAL DE SUPABASE (supabase.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo es el "puente" que conecta toda la aplicación con la base
   de datos de Supabase.
   
   ¿Qué hace este archivo?
   1. Se conecta a la base de datos de GesFlota usando la URL y la Anon Key.
   2. Configura la sesión para que NO se desconecte (autoRefreshToken: true).
   3. Guarda la sesión en el navegador (persistSession: true) para que al recargar
      la página o cerrar la pestaña, el usuario siga logueado.
   4. Escucha eventos de conexión a internet (online/offline) para reintentar
      consultas si el chofer o administrador pierde señal temporalmente.
   ========================================================================== */

(function(window) {
  'use strict';

  // Credenciales oficiales de GesFlota en Supabase
  var SUPABASE_URL = 'https://fbdojuppvokdvvzsegoe.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZG9qdXBwdm9rZHZ2enNlZ29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjkwNDgsImV4cCI6MjA5ODI0NTA0OH0.vTJNDqBbXmLdYdAXU-ZledHPQ5tn_vU6Cay9twkUqgU';

  var client = null;

  // Función para inicializar o recuperar el cliente
  function initSupabase() {
    if (client) return client;

    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            detectSessionInUrl: true,  // Detecta tokens de confirmación o reseteo en la URL
            flowType: 'pkce',
            persistSession: true,       // Guarda sesión en localStorage para no desconectar
            autoRefreshToken: true,     // Renueva automáticamente el token antes de que expire
            storage: window.localStorage
          }
        });

        // Registrar cliente global para compatibilidad con scripts existentes
        window.sb = client;
        window.SUPABASE_URL = SUPABASE_URL;
        window.SUPABASE_KEY = SUPABASE_KEY;

        console.log('✓ [GesFlota Backend] Supabase conectado y persistente.');
        return client;
      } else {
        console.warn('⚠️ [GesFlota Backend] La librería @supabase/supabase-js aún no está cargada.');
        return null;
      }
    } catch (err) {
      console.error('❌ [GesFlota Backend] Error iniciando Supabase:', err);
      return null;
    }
  }

  // Intentar inicializar de inmediato si la librería ya está presente
  initSupabase();

  // Escuchar reconexión a internet para recuperar estado automáticamente
  window.addEventListener('online', function() {
    console.log('🌐 [GesFlota] Conexión a internet restablecida. Verificando sesión...');
    var sbInstance = initSupabase();
    if (sbInstance && sbInstance.auth) {
      sbInstance.auth.getSession().then(function(res) {
        if (res && res.data && res.data.session) {
          console.log('✓ [GesFlota] Sesión revalidada exitosamente.');
        }
      }).catch(function(e) {
        console.warn('Advertencia revalidando sesión:', e);
      });
    }
  });

  // Exponer API en el objeto global GesflotaBackend
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.supabase = {
    getClient: initSupabase,
    url: SUPABASE_URL,
    key: SUPABASE_KEY
  };

})(window);

