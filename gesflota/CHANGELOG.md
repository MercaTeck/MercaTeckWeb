# Changelog — GesFlota

Registro de cambios del SaaS de gestión de flota de MercaTeck.
Repositorio: `MercaTeck/MercaTeckWeb`, carpeta `gesflota/`.

---

## 2026-11-01 — Despliegue en subdominio + seguridad + alta de demo

### Estructura / despliegue
- Reorganización a estructura modular:
  - `frontend/` → `landing.html`, `login.html`, `dashboard.html`, `operario.html` + `css/` + `js/` (`ui-dashboard.js`, `utils.js`, …)
  - `backend/` → `config/` (cliente Supabase), `services/`, `edge-functions/`, `database/`
  - `gesflota_monolito_original.html` conservado como referencia del monolito anterior.
- Despliegue en subdominio propio **gesflota.mercateck.com.ar**, servido bajo `/frontend/`.
- **Cache-busting**: `?v=AAAAMMDD(x)` en el `<script>` de `ui-dashboard.js` en las 4 páginas, para que el hosting (LiteSpeed/CDN) no siga sirviendo el JS viejo. Se sube la versión en cada release.

### Seguridad (GRAVE, resuelto)
- Trigger `handle_new_user`: antes daba rol `superadmin` a cualquier email con "german" o "mercateck.com.ar" → las demos entraban al panel central. Ahora **solo** a emails que terminan en `@mercateck.com.ar`.
- Se demotó a `user` la cuenta de demo que había quedado mal escalada.

### Alta de demo
- Nueva **edge function `crear-demo`** (service role): valida contra el JWT que el llamante sea superadmin y crea el usuario con `email_confirm: true`. El cliente ingresa directo con **un solo email** que incluye email + contraseña + aviso de cambiarla al primer ingreso. Ya no depende del email de confirmación de Supabase.
- `crearCuentaDemo` llama a la edge function en vez del `signUp` del navegador.
- Links de login de los emails armados **relativos** a la carpeta actual (`/frontend/login.html`).

### Planes
- **Plan Demo con todas las funciones** (igual que Enterprise): Mantenimiento, Check-list incluido, Informes, alertas y configuración. Se mantiene el límite de 5 vehículos y 1 mes.

### Panel / Configuración
- **Cambiar contraseña** desde Configuración (desplegable debajo de "Mi suscripción", todos los planes) con `updateUser` de Supabase.
- **Fix destinatarios de alertas**: `deleteDestinatario` ahora borra en la base (`destinatarios_email`) por `id` + `empresa_id` (antes solo local → reaparecían y seguían recibiendo alertas). Editar ya no duplica (preserva `_id` → `UPDATE`). Insert con `.select()` para capturar el id.

### Chatbot (asistente)
- Responde consultas de **service, kilometraje/km/horas y VTV** (nuevas entradas + fix del motor: capa de coincidencia exacta para palabras cortas y separación de las familias de sinónimos mantenimiento/service).
- **Check-list** detallado: Reglas, Constructor, Personal y accesos, con los pasos reales.
- **Mantenimiento** detallado: historial, finalizar, observaciones, origen, filtros.

### UI
- Se quitó el `padding-top` duplicado de `#view-dashboard` (hueco grande arriba de todos los paneles).
- Márgenes laterales corregidos en el modal de onboarding de check-list.

### Landing / avisos
- Quitados los botones "Empezar" de los planes Pro y Enterprise en la landing.
- Aviso de seguridad de pagos del panel actualizado.

### Tests de regresión (`gesflota/tests/`)
- `test_chatbot_privacidad.js`, `test_chatbot_temas.js`, `test_dom_panel.js`, `test_handlers.js`, `test_destinatarios.js`.
- Se corren todos antes de cada entrega.

### Pendiente (fuera del alcance de Claude)
- Supabase → Authentication → URL Configuration: Site URL y Redirect URLs al subdominio (necesario para la confirmación del auto-registro público y el "olvidé mi contraseña"; el alta de demo ya no lo necesita).
- Rotar la service key de Supabase expuesta.
- Limpiar duplicados viejos de destinatarios en la empresa de prueba.
