/* ==========================================================================
   GESFLOTA - SERVICIO DE MANTENIMIENTO Y TALLER (mantenimientoService.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo controla las reparaciones y servicios de los vehículos:
   - Traer el historial de servicios realizados y pendientes (getMantenimientos).
   - Crear una nueva orden de servicio (cambio de aceite, frenos, cubiertas).
   - Finalizar o eliminar un registro de mantenimiento.
   - Controlar alertas de cambios de aceite o filtros por kilometraje u horas.
   ========================================================================== */

(function(window) {
  'use strict';

  var _cacheMantenimientos = [];

  function getSb() {
    if (window.sb) return window.sb;
    if (window.GesflotaBackend && window.GesflotaBackend.supabase) {
      return window.GesflotaBackend.supabase.getClient();
    }
    return null;
  }

  // 1. Obtener lista de mantenimientos
  async function getMantenimientos(empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) return _cacheMantenimientos;

    var res = await sb.from('mantenimientos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });

    if (res.error) {
      console.error('[MantenimientoService] Error obteniendo registros:', res.error);
      throw new Error(res.error.message);
    }

    _cacheMantenimientos = res.data || [];
    window._mantenimientos = _cacheMantenimientos; // Para sincronización con vistas legadas
    return _cacheMantenimientos;
  }

  // 2. Crear nueva orden de mantenimiento
  async function crearMantenimiento(datos, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión o empresa no válida.');

    datos.empresa_id = empresaId;
    datos.creado_en = new Date().toISOString();

    var res = await sb.from('mantenimientos').insert(datos);
    if (res.error) throw new Error(res.error.message);

    await getMantenimientos(empresaId);
    return res.data;
  }

  // 3. Finalizar un servicio
  async function finalizarMantenimiento(id, observaciones, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión.');

    var res = await sb.from('mantenimientos')
      .update({
        estado: 'finalizado',
        observaciones_finales: observaciones || '',
        finalizado_en: new Date().toISOString()
      })
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (res.error) throw new Error(res.error.message);
    await getMantenimientos(empresaId);
    return true;
  }

  // 4. Eliminar un servicio
  async function eliminarMantenimiento(id, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión.');

    var res = await sb.from('mantenimientos')
      .delete()
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (res.error) throw new Error(res.error.message);
    await getMantenimientos(empresaId);
    return true;
  }

  // Exponer servicio
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.mantenimiento = {
    getMantenimientos: getMantenimientos,
    crearMantenimiento: crearMantenimiento,
    finalizarMantenimiento: finalizarMantenimiento,
    eliminarMantenimiento: eliminarMantenimiento,
    getCache: function() { return _cacheMantenimientos; }
  };

})(window);

