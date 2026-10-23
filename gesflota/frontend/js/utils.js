/* ==========================================================================
   GESFLOTA - UTILIDADES DE INTERFAZ Y HELPERS (utils.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo contiene pequeñas funciones que ayudan en toda la pantalla:
   - Mostrar notificaciones flotantes (showToast('Operación exitosa', 'success')).
   - Limpiar texto para evitar ataques XSS (escapeHtml).
   - Formatear fechas y números legibles en español argentino.
   - Cambiar entre tema oscuro y claro (toggleTheme).
   ========================================================================== */

(function(window) {
  'use strict';

  // 1. Notificación flotante (Toast)
  function showToast(mensaje, tipo) {
    tipo = tipo || 'info'; // 'success', 'error', 'info', 'warn'
    var existente = document.getElementById('gfToast');
    if (existente && existente.parentNode) existente.parentNode.removeChild(existente);

    var toast = document.createElement('div');
    toast.id = 'gfToast';
    var bg = '#161B26';
    var border = '#C49A3A';
    if (tipo === 'success') { bg = '#1B3A2B'; border = '#3DAE7C'; }
    if (tipo === 'error') { bg = '#3D1B1B'; border = '#E5564E'; }

    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;padding:12px 20px;'
      + 'background:' + bg + ';border:1px solid ' + border + ';color:#F4F6FA;border-radius:8px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:500;'
      + 'display:flex;align-items:center;gap:10px;animation:fadeInUp .2s ease;';

    toast.textContent = mensaje;
    document.body.appendChild(toast);

    setTimeout(function() {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // 2. Sanitizador de texto (previene inyección de código maligno)
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 3. Formateador de fechas a DD/MM/AAAA
  function formatDate(fechaStr) {
    if (!fechaStr) return '-';
    try {
      var partes = fechaStr.slice(0, 10).split('-');
      if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
      return fechaStr;
    } catch(e) {
      return fechaStr;
    }
  }

  // 4. Alternar tema Claro / Oscuro
  function initTheme() {
    var savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('gesflota_theme') || 'dark'; } catch(e){}
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body && document.body.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.body && document.body.removeAttribute('data-theme');
    }
    try { localStorage.setItem('gesflota_theme', theme); } catch(e){}
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'light' ? 'dark' : 'light';
    setTheme(next);
    showToast('Modo ' + (next === 'light' ? 'Claro' : 'Oscuro') + ' activado', 'info');
  }

  // Inicializar tema al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  // Exponer utilidades globales
  window.showToast = showToast;
  window.escapeHtml = escapeHtml;
  window.formatDate = formatDate;
  window.toggleTheme = toggleTheme;
  window.setTheme = setTheme;

  window.GesflotaUI = window.GesflotaUI || {};
  window.GesflotaUI.utils = {
    showToast: showToast,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    toggleTheme: toggleTheme,
    setTheme: setTheme
  };

})(window);

