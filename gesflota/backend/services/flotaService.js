/* ==========================================================================
   GESFLOTA - SERVICIO DE FLOTA Y VEHÍCULOS (flotaService.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo administra todo el inventario de camiones, camionetas y máquinas:
   - Traer la lista de vehículos desde Supabase (getFlota).
   - Crear o modificar un vehículo (guardarVehiculo).
   - Eliminar o pausar un vehículo (eliminarVehiculo, toggleActivo).
   - Calcular alertas de vencimiento de VTV, Seguro y Filtros (días restantes).
   ========================================================================== */

(function(window) {
  'use strict';

  var _cacheFlota = [];

  function getSb() {
    if (window.sb) return window.sb;
    if (window.GesflotaBackend && window.GesflotaBackend.supabase) {
      return window.GesflotaBackend.supabase.getClient();
    }
    return null;
  }

  // 1. Obtener la flota de la empresa
  async function getFlota(empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) {
      // Fallback a localStorage si no hay conexión
      try {
        var local = localStorage.getItem('gesflota_' + (empresaId || 'demo') + '_flota');
        if (local) return JSON.parse(local);
      } catch(e){}
      return _cacheFlota;
    }

    var res = await sb.from('vehiculos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: true });

    if (res.error) {
      console.error('[GesFlota Backend] Error cargando vehículos:', res.error);
      throw new Error(res.error.message);
    }

    _cacheFlota = res.data || [];
    window._flota = _cacheFlota; // Mantener sincro con código legado

    // Guardar copia local para disponibilidad offline
    try {
      localStorage.setItem('gesflota_' + empresaId + '_flota', JSON.stringify(_cacheFlota));
    } catch(e){}

    return _cacheFlota;
  }

  // 2. Guardar o actualizar un vehículo
  async function guardarVehiculo(vehiculo, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión o empresa no identificada.');

    vehiculo.empresa_id = empresaId;
    var res = await sb.from('vehiculos').upsert(vehiculo, { onConflict: 'empresa_id,patente' });
    if (res.error) throw new Error(res.error.message);

    // Refrescar caché local
    await getFlota(empresaId);
    return res.data;
  }

  // 3. Cambiar estado activo/pausado
  async function toggleActivo(patente, activo, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión.');

    var res = await sb.from('vehiculos')
      .update({ activo: activo })
      .eq('empresa_id', empresaId)
      .eq('patente', patente);

    if (res.error) throw new Error(res.error.message);
    await getFlota(empresaId);
    return true;
  }

  // 4. Eliminar vehículo
  async function eliminarVehiculo(patente, empresaId) {
    var sb = getSb();
    if (!sb || !empresaId) throw new Error('Sin conexión.');

    var res = await sb.from('vehiculos')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('patente', patente);

    if (res.error) throw new Error(res.error.message);
    await getFlota(empresaId);
    return true;
  }

  // 5. Helper para calcular estado de vencimiento (VTV, seguro, etc.)
  function calcularEstadoVencimiento(fechaStr, diasAviso) {
    if (!fechaStr) return { estado: 'sin_dato', dias: null, label: 'Sin fecha' };
    diasAviso = diasAviso || 15;

    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var target = new Date(fechaStr + 'T00:00:00');
    var diffMs = target.getTime() - hoy.getTime();
    var dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (dias < 0) {
      return { estado: 'vencido', dias: dias, label: 'Vencido (' + Math.abs(dias) + 'd atrás)' };
    }
    if (dias <= diasAviso) {
      return { estado: 'porvencer', dias: dias, label: 'Vence en ' + dias + 'd' };
    }
    return { estado: 'buen', dias: dias, label: 'Al día (' + dias + 'd)' };
  }

  // Exponer servicio
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.flota = {
    getFlota: getFlota,
    guardarVehiculo: guardarVehiculo,
    toggleActivo: toggleActivo,
    eliminarVehiculo: eliminarVehiculo,
    calcularEstadoVencimiento: calcularEstadoVencimiento,
    getCache: function() { return _cacheFlota; }
  };

})(window);

