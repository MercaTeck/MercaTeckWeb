/* ==========================================================================
   GESFLOTA - SERVICIO DE CHECK-LIST Y OPERARIOS (checklistService.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo maneja todo el flujo de inspección de vehículos:
   - Validación del chofer/operario con su Nombre y PIN (loginOperario).
   - Descarga de las preguntas y reglas configuradas para su puesto de trabajo.
   - Envío de las respuestas del checklist a Supabase (submitChecklist).
   - Cola offline: si el chofer está en el campo sin señal, guarda el checklist
     en el teléfono y lo sube apenas recupera internet.
   - Motor de Reglas: calcula cuántos checklists se esperaban vs cuántos se hicieron.
   ========================================================================== */

(function(window) {
  'use strict';

  function getSb() {
    if (window.sb) return window.sb;
    if (window.GesflotaBackend && window.GesflotaBackend.supabase) {
      return window.GesflotaBackend.supabase.getClient();
    }
    return null;
  }

  // 1. Validar acceso de operario con PIN
  async function loginOperario(empresaId, nombre, pin) {
    var sb = getSb();
    if (!sb) throw new Error('Sin conexión con la base de datos.');

    nombre = (nombre || '').trim();
    pin = (pin || '').trim();
    if (!nombre || !pin) throw new Error('Completá nombre y PIN.');

    var res = await sb.rpc('validar_acceso_checklist', {
      p_empresa_id: empresaId,
      p_nombre: nombre,
      p_pin: pin
    });

    if (res.error || !res.data || !res.data.length) {
      throw new Error('Nombre o PIN incorrecto.');
    }

    var operario = res.data[0];
    return {
      nombre: nombre,
      pin: pin,
      puesto: operario.puesto,
      frecuencia: operario.frecuencia || 'semanal',
      sector: operario.sector || null
    };
  }

  // 2. Traer configuración de preguntas y constructor de la empresa
  async function getConfigChecklist(empresaId, nombre, pin) {
    var sb = getSb();
    if (!sb) return null;

    var res = await sb.rpc('config_checklist_empresa', {
      p_empresa_id: empresaId,
      p_nombre: nombre,
      p_pin: pin
    });

    if (res.error) {
      console.warn('[ChecklistService] No se pudo cargar config remota:', res.error);
      return null;
    }
    return res.data;
  }

  // 3. Cola offline (para guardar si no hay internet y reintentar luego)
  function getColaOffline() {
    try { return JSON.parse(localStorage.getItem('gesflota_cola_offline') || '[]'); } catch(e){ return []; }
  }

  function guardarEnColaOffline(payload) {
    try {
      var cola = getColaOffline();
      cola.push({ payload: payload, timestamp: Date.now() });
      localStorage.setItem('gesflota_cola_offline', JSON.stringify(cola));
      console.log('📦 [Checklist] Guardado en cola offline. Total pendientes:', cola.length);
    } catch(e){}
  }

  // 4. Enviar checklist a Supabase (con soporte offline automático)
  async function guardarChecklist(payload) {
    var sb = getSb();

    // Si estamos offline, guardamos en la cola para sincronizar después
    if (!navigator.onLine || !sb) {
      guardarEnColaOffline(payload);
      return { offline: true, message: 'Guardado sin conexión. Se sincronizará automáticamente al volver la señal.' };
    }

    try {
      // Intentar por RPC primero
      var res = await sb.rpc('guardar_checklist_operario', { p_data: payload });
      if (res.error) {
        // Fallback a insert directo
        var insertRes = await sb.from('checklist_registros').insert(payload);
        if (insertRes.error) throw new Error(insertRes.error.message);
        return { success: true, data: insertRes.data };
      }
      return { success: true, data: res.data };
    } catch (err) {
      // Si falló por red inesperada, almacenar offline
      guardarEnColaOffline(payload);
      return { offline: true, error: err.message };
    }
  }

  // 5. Procesar cola offline al recuperar conexión
  async function sincronizarColaOffline() {
    var cola = getColaOffline();
    if (!cola.length) return;

    var sb = getSb();
    if (!sb || !navigator.onLine) return;

    console.log('🔄 [Checklist] Sincronizando', cola.length, 'checklists offline...');
    var pendientes = [];

    for (var i = 0; i < cola.length; i++) {
      var item = cola[i];
      try {
        var res = await sb.from('checklist_registros').insert(item.payload);
        if (res.error) pendientes.push(item);
      } catch(e) {
        pendientes.push(item);
      }
    }

    localStorage.setItem('gesflota_cola_offline', JSON.stringify(pendientes));
    if (pendientes.length === 0) {
      console.log('✓ [Checklist] Todos los registros offline fueron sincronizados con éxito.');
    }
  }

  // Escuchar cuando vuelve la red para sincronizar
  window.addEventListener('online', sincronizarColaOffline);

  // Exponer servicio
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.checklist = {
    loginOperario: loginOperario,
    getConfigChecklist: getConfigChecklist,
    guardarChecklist: guardarChecklist,
    getColaOffline: getColaOffline,
    sincronizarColaOffline: sincronizarColaOffline
  };

})(window);

