/* ==========================================================================
   GESFLOTA - SERVICIO DE REPORTES, EXCEL Y QR (reportesService.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo se encarga de las exportaciones y entregables:
   - Generar archivos Excel estilizados con colores y bordes (exportarFlotaExcel).
   - Generar códigos QR para pegar en el parabrisas de cada vehículo (generarQR).
   - Construir planillas de cumplimiento de checklist y auditoría.
   ========================================================================== */

(function(window) {
  'use strict';

  // 1. Generar código QR para un vehículo
  function generarQR(contenedorId, urlTexto, options) {
    var el = typeof contenedorId === 'string' ? document.getElementById(contenedorId) : contenedorId;
    if (!el) {
      console.warn('[Reportes] Contenedor para QR no encontrado:', contenedorId);
      return null;
    }

    el.innerHTML = '';
    options = options || {};
    var ancho = options.width || 180;
    var alto = options.height || 180;

    if (window.QRCode) {
      try {
        return new window.QRCode(el, {
          text: urlTexto,
          width: ancho,
          height: alto,
          colorDark: '#080C12',
          colorLight: '#FFFFFF',
          correctLevel: window.QRCode.CorrectLevel.H
        });
      } catch (e) {
        console.error('Error generando QR:', e);
      }
    } else {
      console.warn('Librería QRCode no disponible.');
    }
    return null;
  }

  // 2. Exportar flota a Excel con XLSX
  function exportarFlotaExcel(vehiculos, nombreEmpresa) {
    if (!window.XLSX) {
      alert('La librería XLSX no está cargada.');
      return;
    }

    nombreEmpresa = nombreEmpresa || 'Empresa';
    var headers = ['Patente', 'Interno', 'Tipo', 'Marca', 'Modelo', 'Año', 'Sector / Obra', 'Km / Horas', 'VTV Vencimiento', 'Seguro Vencimiento', 'Estado'];
    var rows = [
      ['FLOTA DE VEHÍCULOS - ' + nombreEmpresa.toUpperCase()],
      ['Generado el: ' + new Date().toLocaleDateString('es-AR')],
      [],
      headers
    ];

    (vehiculos || []).forEach(function(v) {
      rows.push([
        v.patente || '',
        v.id_interno || '',
        v.tipo || '',
        v.marca || '',
        v.modelo || '',
        v.anio || '',
        v.obra || v.sector || '',
        v.km_actual || v.horas_actual || 0,
        v.vtv_vence || '',
        v.seguro_vence || '',
        v.activo === false ? 'Inactivo' : 'Activo'
      ]);
    });

    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Flota');

    var filename = 'GesFlota_' + nombreEmpresa.replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    window.XLSX.writeFile(wb, filename);
    console.log('✓ [Reportes] Archivo Excel descargado:', filename);
  }

  // Exponer servicio
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.reportes = {
    generarQR: generarQR,
    exportarFlotaExcel: exportarFlotaExcel
  };

})(window);

