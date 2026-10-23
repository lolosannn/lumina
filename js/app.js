(function () {
  'use strict';

  // Evita que la página se muestre dentro de un iframe de otro sitio (clickjacking).
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.hidden = true; }
    return;
  }

  // Los productos se leen de data/productos.json (se editan desde /admin).
  // Mientras carga, el sitio arranca vacío pero con el WhatsApp funcionando.
  var data = { whatsapp: '5491132385943', categorias: [], productos: [] };
  var STORAGE_KEY = 'lumina-carrito';
  var MAX_CANTIDAD = 50;
  var MAX_NOMBRE = 60;
  var MAX_NOTA = 300;
  // Fotos que no existen todavía: no se vuelven a pedir en cada render.
  var fotosFaltantes = {};

  var state = {
    filtro: 'todos',
    carrito: {},
    nombre: '',
    nota: ''
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var ICON_MINUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  var ICON_PHOTO = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>';

  // ---------- utilidades ----------

  function precioTexto(n) {
    if (n === null || n === undefined) return 'Consultar';
    return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function producto(id) {
    for (var i = 0; i < data.productos.length; i++) {
      if (data.productos[i].id === id) return data.productos[i];
    }
    return null;
  }

  function etiquetaCategoria(id) {
    for (var i = 0; i < data.categorias.length; i++) {
      if (data.categorias[i].id === id) return data.categorias[i].etiqueta;
    }
    return '';
  }

  function cargarCarrito() {
    try {
      var guardado = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      var limpio = {};
      Object.keys(guardado).forEach(function (id) {
        var q = parseInt(guardado[id], 10);
        if (q > 0 && producto(id)) limpio[id] = Math.min(q, MAX_CANTIDAD);
      });
      return limpio;
    } catch (e) {
      return {};
    }
  }

  function guardarCarrito() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.carrito)); } catch (e) { /* sin storage */ }
  }

  function itemsCarrito() {
    return data.productos
      .filter(function (p) { return state.carrito[p.id] > 0; })
      .map(function (p) { return { p: p, qty: state.carrito[p.id] }; });
  }

  function linkWhatsApp(texto) {
    return 'https://wa.me/' + data.whatsapp + '?text=' + encodeURIComponent(texto);
  }

  // ---------- carrito ----------

  function setCantidad(id, qty) {
    if (!producto(id)) return;
    qty = Math.min(qty, MAX_CANTIDAD);
    if (qty > 0) state.carrito[id] = qty;
    else delete state.carrito[id];
    guardarCarrito();
    renderProductos();
    renderCarrito();
  }

  function mensajePedido() {
    var items = itemsCarrito();
    var total = 0;
    var sinPrecio = false;
    var lineas = ['¡Hola Lúmina Bakery! Quiero hacer este pedido:', ''];
    items.forEach(function (it) {
      var sub = it.p.precio === null ? 'precio a confirmar' : precioTexto(it.p.precio * it.qty);
      if (it.p.precio === null) sinPrecio = true; else total += it.p.precio * it.qty;
      lineas.push('• ' + it.qty + ' x ' + it.p.nombre + ' — ' + sub);
    });
    lineas.push('', 'Total: ' + precioTexto(total) + (sinPrecio ? ' (+ productos a confirmar)' : ''));
    if (state.nombre.trim()) lineas.push('Nombre: ' + state.nombre.trim());
    if (state.nota.trim()) lineas.push('Aclaraciones: ' + state.nota.trim());
    return lineas.join('\n');
  }

  // ---------- render ----------

  function renderFiltros() {
    var cont = $('[data-filters]');
    var opciones = [{ id: 'todos', nombre: 'Todos' }].concat(data.categorias);
    cont.innerHTML = opciones.map(function (c) {
      var on = state.filtro === c.id;
      return '<button type="button" class="pill' + (on ? ' is-active' : '') + '" aria-pressed="' + on + '" data-filter="' + escapar(c.id) + '">' + escapar(c.nombre) + '</button>';
    }).join('');
  }

  function controlCantidad(p, qty) {
    if (!qty) {
      return '<button type="button" class="btn btn-cream btn-sm" data-add="' + escapar(p.id) + '">' + ICON_PLUS + 'Agregar</button>';
    }
    return '<div class="stepper">' +
      '<button type="button" data-dec="' + escapar(p.id) + '" aria-label="Quitar un ' + escapar(p.nombre) + '">' + ICON_MINUS + '</button>' +
      '<span aria-live="polite">' + qty + '</span>' +
      '<button type="button" class="stepper-plus" data-add="' + escapar(p.id) + '" aria-label="Agregar un ' + escapar(p.nombre) + '">' + ICON_PLUS + '</button>' +
      '</div>';
  }

  function renderProductos() {
    var grid = $('[data-product-grid]');
    var visibles = data.productos.filter(function (p) {
      return state.filtro === 'todos' || p.categoria === state.filtro;
    });
    grid.innerHTML = visibles.map(function (p) {
      var qty = state.carrito[p.id] || 0;
      var foto = p.imagen && !fotosFaltantes[p.imagen]
        ? '<img src="img/productos/' + escapar(p.imagen) + '" alt="' + escapar(p.nombre) + '" loading="lazy" data-photo="' + escapar(p.imagen) + '">'
        : '';
      return '<article class="product-card">' +
        '<div class="product-photo">' + foto +
          '<div class="photo-placeholder">' + ICON_PHOTO + '<span>Foto próximamente</span></div>' +
          '<span class="tag">' + escapar(etiquetaCategoria(p.categoria)) + '</span>' +
        '</div>' +
        '<div class="product-body">' +
          '<div><h3>' + escapar(p.nombre) + '</h3>' + (p.detalle ? '<p class="product-detail">' + escapar(p.detalle) + '</p>' : '') + '</div>' +
          '<div class="product-buy">' +
            '<span class="price' + (p.precio === null ? ' price-ask' : '') + '">' + precioTexto(p.precio) + '</span>' +
            controlCantidad(p, qty) +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
    // Si la foto carga, oculta el placeholder; si falla, la saca.
    $$('[data-photo]').forEach(function (img) {
      var marcar = function () { img.parentNode.classList.add('has-photo'); };
      if (img.complete && img.naturalWidth) marcar();
      img.addEventListener('load', marcar);
      img.addEventListener('error', function () {
        fotosFaltantes[img.getAttribute('data-photo')] = true;
        img.remove();
      });
    });
  }

  function renderCarrito() {
    var items = itemsCarrito();
    var cantidad = items.reduce(function (a, it) { return a + it.qty; }, 0);
    var total = items.reduce(function (a, it) { return a + (it.p.precio || 0) * it.qty; }, 0);
    var sinPrecio = items.some(function (it) { return it.p.precio === null; });

    $$('[data-cart-count]').forEach(function (el) { el.textContent = cantidad; });

    var vacio = items.length === 0;
    $('[data-cart-empty]').hidden = !vacio;
    $('[data-cart-body]').hidden = vacio;
    $('[data-cart-foot]').hidden = vacio;

    $('[data-cart-items]').innerHTML = items.map(function (it) {
      var sub = it.p.precio === null ? 'A confirmar' : precioTexto(it.p.precio * it.qty);
      return '<li class="cart-item">' +
        '<div class="cart-item-info">' +
          '<span class="cart-item-name">' + escapar(it.p.nombre) + '</span>' +
          '<span class="cart-item-unit">' + (it.p.precio === null ? 'Precio a consultar' : precioTexto(it.p.precio) + ' c/u') + '</span>' +
        '</div>' +
        '<div class="cart-item-side">' +
          '<div class="stepper stepper-dark">' +
            '<button type="button" data-dec="' + escapar(it.p.id) + '" aria-label="Quitar un ' + escapar(it.p.nombre) + '">' + ICON_MINUS + '</button>' +
            '<span>' + it.qty + '</span>' +
            '<button type="button" data-add="' + escapar(it.p.id) + '" aria-label="Agregar un ' + escapar(it.p.nombre) + '">' + ICON_PLUS + '</button>' +
          '</div>' +
          '<strong>' + sub + '</strong>' +
        '</div>' +
      '</li>';
    }).join('');

    $('[data-cart-total]').textContent = precioTexto(total) + (sinPrecio ? ' + a confirmar' : '');
    $('[data-cart-hint]').hidden = !sinPrecio;
    actualizarLinkPedido();
  }

  function actualizarLinkPedido() {
    $('[data-wa="pedido"]').href = linkWhatsApp(mensajePedido());
  }

  // ---------- panel del carrito ----------

  var ultimoFoco = null;

  function abrirCarrito() {
    ultimoFoco = document.activeElement;
    $('[data-cart]').hidden = false;
    document.body.classList.add('no-scroll');
    $('.cart-panel .icon-btn').focus();
  }

  function cerrarCarrito() {
    $('[data-cart]').hidden = true;
    document.body.classList.remove('no-scroll');
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  // ---------- eventos ----------

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.hasAttribute('data-filter')) {
      state.filtro = t.getAttribute('data-filter');
      renderFiltros();
      renderProductos();
    } else if (t.hasAttribute('data-add') || t.hasAttribute('data-dec')) {
      var suma = t.hasAttribute('data-add');
      var id = t.getAttribute(suma ? 'data-add' : 'data-dec');
      var region = t.closest('.cart-panel') ? '.cart-panel ' : '[data-product-grid] ';
      setCantidad(id, (state.carrito[id] || 0) + (suma ? 1 : -1));
      // El render reemplaza los botones: devolvemos el foco al control equivalente.
      var siguiente = $(region + '[data-' + (suma ? 'add' : 'dec') + '="' + id + '"]') || $(region + '[data-add="' + id + '"]');
      if (siguiente) siguiente.focus();
    } else if (t.hasAttribute('data-open-cart')) {
      abrirCarrito();
    } else if (t.hasAttribute('data-close-cart')) {
      cerrarCarrito();
      if (t.closest('.cart-empty')) location.hash = '#productos';
    }
  });

  // ---------- menú del celular ----------

  var menuBoton = $('[data-menu-toggle]');
  var menu = $('[data-nav]');

  function setMenu(abierto) {
    menu.classList.toggle('is-open', abierto);
    menuBoton.setAttribute('aria-expanded', String(abierto));
    menuBoton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  }

  menuBoton.addEventListener('click', function () {
    setMenu(!menu.classList.contains('is-open'));
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('click', function (e) {
    if (menu.classList.contains('is-open') && !e.target.closest('.site-header')) setMenu(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('[data-cart]').hidden) cerrarCarrito();
    else if (menu.classList.contains('is-open')) { setMenu(false); menuBoton.focus(); }
  });

  $('[data-cart-name]').addEventListener('input', function (e) {
    state.nombre = e.target.value.slice(0, MAX_NOMBRE);
    actualizarLinkPedido();
  });
  $('[data-cart-note]').addEventListener('input', function (e) {
    state.nota = e.target.value.slice(0, MAX_NOTA);
    actualizarLinkPedido();
  });

  // ---------- inicio ----------

  function actualizarLinksWhatsApp() {
    $$('[data-wa="consulta"]').forEach(function (a) {
      a.href = linkWhatsApp('¡Hola Lúmina Bakery! Quería hacer una consulta.');
    });
    $$('[data-wa="mayorista"]').forEach(function (a) {
      a.href = linkWhatsApp('¡Hola Lúmina Bakery! Tengo un local y me interesa ofrecer sus productos. ¿Me pasan info para revendedores?');
    });
  }
  actualizarLinksWhatsApp();

  function iniciar() {
    state.carrito = cargarCarrito();
    renderFiltros();
    renderProductos();
    renderCarrito();
  }

  renderCarrito();
  fetch('data/productos.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      if (!json || !Array.isArray(json.productos) || !Array.isArray(json.categorias)) throw new Error('formato');
      data = json;
      if (!/^\d{8,15}$/.test(String(data.whatsapp || ''))) data.whatsapp = '5491132385943';
      actualizarLinksWhatsApp();
      iniciar();
    })
    .catch(function () {
      $('[data-product-grid]').innerHTML = '<p class="load-error">No pudimos cargar los productos. Escribinos por WhatsApp y te pasamos la lista.</p>';
    });
})();
