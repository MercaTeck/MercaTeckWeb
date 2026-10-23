/* ==========================================================================
   GESFLOTA - CONTROLADOR DE LA INTERFAZ DE OPERARIO (ui-operario.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo escucha los clics y acciones del chofer en operario.html:
   - Detecta el parámetro ?cl= de la URL (el ID de la empresa).
   - Valida el formulario de Login con PIN.
   - Muestra el panel con las opciones correspondientes a su puesto.
   ========================================================================== */

(function(window) {
  'use strict';

  var _opEmpresaId = null;
  var _opActual = null;

  function init() {
    // 1. Extraer ID de la empresa desde la URL (?cl=ID)
    var params = new URLSearchParams(window.location.search);
    _opEmpresaId = params.get('cl');

    if (!_opEmpresaId) {
      console.warn('[Operario] No se especificó ID de empresa en la URL (?cl=...). Usando demo o local.');
      var lbl = document.getElementById('operarioEmpresaNombre');
      if (lbl) lbl.textContent = 'Ingresá el enlace proporcionado por tu empresa.';
    }

    // 2. Asociar eventos de botones
    var btnLogin = document.getElementById('btnOpLogin');
    if (btnLogin) btnLogin.addEventListener('click', handleLogin);

    var btnLogout = document.getElementById('btnOpLogout');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);

    var btnNuevoCl = document.getElementById('btnOpNuevoCl');
    if (btnNuevoCl) btnNuevoCl.addEventListener('click', handleNuevoChecklist);

    // Enter en campos de texto para enviar
    var inputPin = document.getElementById('opPin');
    if (inputPin) {
      inputPin.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') handleLogin();
      });
    }

    // Monitorear estado de red
    window.addEventListener('offline', function() {
      actualizarStatusRed(false);
    });
    window.addEventListener('online', function() {
      actualizarStatusRed(true);
    });
  }

  function actualizarStatusRed(online) {
    var statusEl = document.getElementById('opStatusRed');
    if (!statusEl) return;
    if (online) {
      statusEl.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3DAE7C;"></span> Conexión activa con GesFlota';
    } else {
      statusEl.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D99A3C;"></span> Modo Offline (los checklists se guardarán localmente)';
    }
  }

  async function handleLogin() {
    var nombre = (document.getElementById('opNombre').value || '').trim();
    var pin = (document.getElementById('opPin').value || '').trim();
    var errEl = document.getElementById('opError');

    errEl.style.display = 'none';

    if (!nombre || !pin) {
      errEl.textContent = 'Completá tu nombre y PIN de 6 dígitos.';
      errEl.style.display = 'block';
      return;
    }

    try {
      if (!window.GesflotaBackend || !window.GesflotaBackend.checklist) {
        throw new Error('Servicios no cargados correctamente.');
      }

      var opData = await window.GesflotaBackend.checklist.loginOperario(_opEmpresaId, nombre, pin);
      _opActual = opData;

      // Mostrar panel
      document.getElementById('operarioLoginBox').style.display = 'none';
      var panel = document.getElementById('operarioPanelBox');
      panel.style.display = 'block';

      document.getElementById('opSaludo').textContent = '¡Hola, ' + escapeHtml(opData.nombre) + '!';
      document.getElementById('opPuesto').textContent = 'Puesto: ' + escapeHtml(opData.puesto || 'General');

      // Si su puesto es mantenimiento, mostrar botones específicos
      if ((opData.puesto || '').toLowerCase().indexOf('mantenimiento') >= 0) {
        var mantBox = document.getElementById('opMantBox');
        if (mantBox) mantBox.style.display = 'block';
      }

      window.showToast('Bienvenido, ' + opData.nombre, 'success');

    } catch (err) {
      errEl.textContent = err.message || 'Error al validar credenciales.';
      errEl.style.display = 'block';
    }
  }

  function handleLogout() {
    _opActual = null;
    document.getElementById('operarioLoginBox').style.display = 'block';
    document.getElementById('operarioPanelBox').style.display = 'none';
    document.getElementById('opPin').value = '';
    window.showToast('Sesión de operario finalizada', 'info');
  }

  function handleNuevoChecklist() {
    window.showToast('Abriendo formulario de inspección...', 'info');
    // Si existe el sistema completo de formularios modales en window o se navega a formulario
    if (typeof window.abrirChecklistOperario === 'function') {
      window.abrirChecklistOperario();
    } else {
      alert('Iniciando carga de inspección para ' + (_opActual ? _opActual.nombre : 'Operario'));
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})(window);

