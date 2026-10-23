/* ==========================================================================
   GESFLOTA - SERVICIO DE AUTENTICACIÓN Y ROLES (authService.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo se encarga de TODO lo relacionado a usuarios y seguridad:
   - Iniciar sesión (login con email y contraseña).
   - Registrarse (wizard de registro con selección de planes Starter/Pro/Enterprise).
   - Cerrar sesión (logout).
   - Recuperar contraseña perdida (envío de email con link seguro).
   - Manejar roles: 'superadmin' (dueño de la plataforma) vs 'admin' (empresa).
   - Mantener al usuario conectado automáticamente (sesión persistente).
   ========================================================================== */

(function(window) {
  'use strict';

  var authState = {
    currentUser: null,
    currentProfile: null,
    currentCompany: null,
    empresaId: null,
    empresaPlan: 'starter',
    isAdmin: false
  };

  // Helper para obtener el cliente de Supabase
  function getSb() {
    if (window.sb) return window.sb;
    if (window.GesflotaBackend && window.GesflotaBackend.supabase) {
      return window.GesflotaBackend.supabase.getClient();
    }
    return null;
  }

  // Control de intentos de login (anti fuerza bruta)
  function verificarIntentos(email) {
    var MAX = 5, MINUTOS = 5;
    var data = {};
    try { data = JSON.parse(localStorage.getItem('gesflota_login_intentos') || '{}'); } catch(e){}
    var reg = data[email.toLowerCase()];
    if (!reg) return { bloqueado: false, restantes: MAX };
    var ahora = Date.now();
    if (reg.count >= MAX && reg.hasta && ahora < reg.hasta) {
      return { bloqueado: true, minutos: Math.ceil((reg.hasta - ahora) / 60000) };
    }
    if (reg.hasta && ahora >= reg.hasta) { return { bloqueado: false, restantes: MAX }; }
    return { bloqueado: false, restantes: Math.max(0, MAX - (reg.count || 0)) };
  }

  function registrarIntentoFallido(email) {
    var MAX = 5, MINUTOS = 5;
    var data = {};
    try { data = JSON.parse(localStorage.getItem('gesflota_login_intentos') || '{}'); } catch(e){}
    var key = email.toLowerCase();
    var reg = data[key] || { count: 0 };
    reg.count = (reg.count || 0) + 1;
    if (reg.count >= MAX) { reg.hasta = Date.now() + MINUTOS * 60000; }
    data[key] = reg;
    try { localStorage.setItem('gesflota_login_intentos', JSON.stringify(data)); } catch(e){}
  }

  function limpiarIntentos(email) {
    var data = {};
    try { data = JSON.parse(localStorage.getItem('gesflota_login_intentos') || '{}'); } catch(e){}
    delete data[email.toLowerCase()];
    try { localStorage.setItem('gesflota_login_intentos', JSON.stringify(data)); } catch(e){}
  }

  // 1. Iniciar sesión con email y contraseña
  async function login(email, password, captchaToken) {
    var sb = getSb();
    if (!sb) throw new Error('No hay conexión con la base de datos.');

    email = (email || '').trim();
    if (!email || !password) throw new Error('Completá email y contraseña.');

    var bloqueo = verificarIntentos(email);
    if (bloqueo.bloqueado) {
      throw new Error('Demasiados intentos fallidos. Esperá ' + bloqueo.minutos + ' min o recuperá tu contraseña.');
    }

    var opciones = {};
    if (captchaToken) opciones.captchaToken = captchaToken;

    var res = await sb.auth.signInWithPassword({
      email: email,
      password: password,
      options: opciones
    });

    if (res.error) {
      registrarIntentoFallido(email);
      var msg = res.error.message || 'Error al iniciar sesión.';
      if (msg.indexOf('Invalid login') >= 0) msg = 'Email o contraseña incorrectos.';
      if (msg.indexOf('Email not confirmed') >= 0) msg = 'Debés confirmar tu email antes de ingresar.';
      throw new Error(msg);
    }

    limpiarIntentos(email);
    return await cargarPerfil(res.data.user);
  }

  // 2. Cargar perfil y empresa del usuario autenticado
  async function cargarPerfil(authUser, reintento) {
    var sb = getSb();
    if (!sb || !authUser) return null;

    // Helper para consultar perfil (con o sin email defensivamente por si la columna aún no fue migrada)
    async function _leerPerfil(conEmail) {
      var campos = conEmail
        ? 'nombre, apellido, email, rol, empresa_id, empresas(nombre, plan, estado_pago, addon_checklist, prox_pago, bienvenida_enviada)'
        : 'nombre, apellido, rol, empresa_id, empresas(nombre, plan, estado_pago, addon_checklist, prox_pago, bienvenida_enviada)';
      return await sb.from('perfiles').select(campos).eq('id', authUser.id).single();
    }

    var res = await _leerPerfil(true);
    if (res.error && res.error.code === '42703') {
      // Si la columna email aún no existe en Supabase, reintentar sin ella
      res = await _leerPerfil(false);
    }

    if (res.error || !res.data) {
      if (!reintento) {
        await new Promise(r => setTimeout(r, 1500));
        return await cargarPerfil(authUser, true);
      }
      throw new Error('No se pudo cargar el perfil de usuario.');
    }

    var perfil = res.data;
    var empresa = perfil.empresas || {};

    if (empresa.estado_pago === 'suspendido' && perfil.rol !== 'superadmin') {
      await sb.auth.signOut();
      throw new Error('Cuenta suspendida. Contactanos a germanmercado@mercateck.com.ar para regularizarla.');
    }

    // Sincronizar automáticamente en background si faltaban email, nombre o apellido
    var userEmail = perfil.email || authUser.email || '';
    var userMeta = authUser.user_metadata || {};
    var updates = {};
    if (!perfil.email && userEmail) updates.email = userEmail;
    if (!perfil.apellido && userMeta.apellido) updates.apellido = userMeta.apellido;
    if (!perfil.nombre && (userMeta.nombre || userMeta.full_name)) updates.nombre = userMeta.nombre || userMeta.full_name;
    if (Object.keys(updates).length > 0) {
      sb.from('perfiles').update(updates).eq('id', authUser.id).then(function(){}).catch(function(){});
    }

    // Actualizar estado en memoria y globales
    authState.currentUser = authUser;
    authState.currentProfile = perfil;
    authState.currentProfile.email = userEmail;
    authState.currentCompany = empresa.nombre || 'Empresa';
    authState.empresaId = perfil.empresa_id;
    authState.empresaPlan = empresa.plan || 'starter';
    authState.isAdmin = (perfil.rol === 'superadmin');

    // Sincronizar con las variables del script original para máxima compatibilidad
    window.currentUser = authUser;
    window._currentCompany = authState.currentCompany;
    window._empresaId = authState.empresaId;
    window._empresaPlan = authState.empresaPlan;
    window.isAdmin = authState.isAdmin;

    return authState;
  }

  // 3. Restaurar sesión activa (al cargar o recargar la página)
  async function restaurarSesion() {
    var sb = getSb();
    if (!sb) return null;

    try {
      var res = await sb.auth.getSession();
      if (res && res.data && res.data.session && res.data.session.user) {
        console.log('✓ [GesFlota Auth] Sesión previa encontrada. Cargando perfil...');
        return await cargarPerfil(res.data.session.user);
      }
    } catch (e) {
      console.warn('[GesFlota Auth] Error comprobando sesión activa:', e);
    }
    return null;
  }

  // 4. Cerrar sesión
  async function logout() {
    var sb = getSb();
    if (sb) {
      await sb.auth.signOut();
    }
    authState.currentUser = null;
    authState.currentProfile = null;
    authState.currentCompany = null;
    authState.empresaId = null;
    authState.isAdmin = false;

    window.currentUser = null;
    window._empresaId = null;
    window.isAdmin = false;

    console.log('✓ [GesFlota Auth] Sesión cerrada.');
  }

  // 5. Recuperación de contraseña por email
  async function recuperarClave(email) {
    var sb = getSb();
    if (!sb) throw new Error('Sin conexión con la base de datos.');

    email = (email || '').trim();
    if (!email) throw new Error('Ingresá tu correo electrónico.');

    var volverA = window.location.origin + window.location.pathname + '?type=recovery';
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: volverA });
    if (res.error) throw new Error(res.error.message || 'Error enviando el correo.');
    return true;
  }

  // 6. Registro de nuevo usuario y empresa
  async function register(datos) {
    var sb = getSb();
    if (!sb) throw new Error('No hay conexión con la base de datos.');

    var empresa = (datos.empresa || '').trim();
    var nombre  = (datos.nombre || '').trim();
    var apellido = (datos.apellido || '').trim();
    var email   = (datos.email || '').trim().toLowerCase();
    var pass    = datos.password || '';
    var plan    = datos.plan || 'pro';

    if (!empresa || !nombre || !email || !pass) {
      throw new Error('Completá todos los campos requeridos.');
    }

    if (!apellido && nombre.indexOf(' ') > 0) {
      var partes = nombre.split(/\s+/);
      nombre = partes[0];
      apellido = partes.slice(1).join(' ');
    }

    var res = await sb.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: {
          empresa: empresa,
          nombre: nombre,
          apellido: apellido,
          email: email,
          plan: plan,
          version_terminos: '2025-06',
          user_agent: navigator.userAgent
        },
        captchaToken: datos.captchaToken || undefined
      }
    });

    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  // Exponer servicio
  window.GesflotaBackend = window.GesflotaBackend || {};
  window.GesflotaBackend.auth = {
    state: authState,
    login: login,
    logout: logout,
    register: register,
    cargarPerfil: cargarPerfil,
    restaurarSesion: restaurarSesion,
    recuperarClave: recuperarClave
  };

})(window);

