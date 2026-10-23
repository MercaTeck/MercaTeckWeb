/* ==========================================================================
   GESFLOTA - CONTROLADOR DE LA LANDING PAGE (ui-landing.js)
   ==========================================================================
   💡 GUÍA PARA VIBE CODERS / PROMPT ENGINEERS:
   Este archivo maneja la interacción en la página principal:
   - Abrir y cerrar el menú móvil (hamburguesa).
   - Acordeones de preguntas frecuentes (FAQ).
   - Selector de planes y cálculo de precios.
   ========================================================================== */

(function(window) {
  'use strict';

  function init() {
    // 1. Menú hamburguesa para celulares
    var burger = document.querySelector('.nav-burger');
    var menuMovil = document.querySelector('.menu-movil');
    if (burger && menuMovil) {
      burger.addEventListener('click', function() {
        menuMovil.classList.toggle('open');
      });

      // Cerrar al tocar cualquier enlace dentro del menú
      menuMovil.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
          menuMovil.classList.remove('open');
        });
      });
    }

    // 2. Acordeones de Preguntas Frecuentes (FAQ)
    var faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var isOpen = item.classList.contains('open');
        faqItems.forEach(function(f) { f.classList.remove('open'); });
        if (!isOpen) item.classList.add('open');
      });
    });

    console.log('✓ [GesFlota Landing] Controlador de navegación listo.');
  }

  document.addEventListener('DOMContentLoaded', init);

})(window);

