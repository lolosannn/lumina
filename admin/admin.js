(function () {
  'use strict';

  if (window.top !== window.self) {
    document.documentElement.hidden = true;
    return;
  }

  // Repositorio donde vive la web. Los cambios se guardan como commits ahí,
  // y GitHub Pages publica la nueva versión en uno o dos minutos.
  var REPO = 'lolosannn/lumina';
  var DATA_PATH = 'data/productos.json';
  var IMG_DIR = 'img/productos/';
  var STORAGE_KEY = 'lumina-admin-v1';
  var INTENTOS_KEY = 'lumina-admin-intentos';
  // Iteraciones recomendadas por OWASP para PBKDF2-SHA256. Las llaves guardadas con
  // menos (versiones anteriores) se vuelven a cifrar solas al entrar.
  var PBKDF2_ITER = 600000;
  var PBKDF2_ITER_VIEJO = 310000;
  var MIN_PASS = 10;
  var MAX_FOTO_BYTES = 25 * 1024 * 1024;
  var INACTIVIDAD_MS = 20 * 60 * 1000;
  var ID_OK = /^[a-z0-9-]{1,60}$/;
  var FOTO_OK = /^[a-z0-9-]{1,80}\.(jpe?g|png|webp)$/i;

  var token = null;   // solo en memoria; se pierde al recargar o salir
  var branch = null;
  var data = null;
  var dataSha = null;
  var fotosNuevas = {}; // clave de producto -> { base64, preview }
  var sucio = false;
  var claveTemp = 0;

  var $ = function (sel) { return document.querySelector(sel); };

  // ---------- pantallas y mensajes ----------

  function mostrar(nombre) {
    document.querySelectorAll('[data-screen]').forEach(function (el) {
      el.hidden = el.getAttribute('data-screen') !== nombre;
    });
    $('[data-logout]').hidden = nombre !== 'editor';
  }

  function mensaje(donde, texto, tipo) {
    var el = $('[data-msg="' + donde + '"]');
    el.textContent = texto || '';
    el.className = 'msg' + (tipo ? ' is-' + tipo : '');
  }

  // ---------- cifrado de la llave con la contraseña ----------

  function b64(bytes) {
    var s = '';
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function desdeB64(str) {
    var bin = atob(str);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function derivarClave(password, salt, iteraciones) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iteraciones, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function guardarLlave(llave, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return derivarClave(password, salt, PBKDF2_ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(llave));
    }).then(function (ct) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, iter: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
    });
  }

  function abrirLlave(password) {
    var guardado, iter;
    try {
      guardado = JSON.parse(localStorage.getItem(STORAGE_KEY));
      iter = guardado.iter || PBKDF2_ITER_VIEJO;
    } catch (e) {
      return Promise.reject(e);
    }
    return derivarClave(password, desdeB64(guardado.salt), iter).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: desdeB64(guardado.iv) }, key, desdeB64(guardado.ct));
    }).then(function (plano) {
      var llave = new TextDecoder().decode(plano);
      if (iter >= PBKDF2_ITER) return llave;
      return guardarLlave(llave, password).then(function () { return llave; }, function () { return llave; });
    });
  }

  // ---------- freno a los intentos de contraseña ----------

  // Después de 3 errores seguidos hay que esperar, cada vez el doble (hasta 15 min).
  function leerIntentos() {
    try { return JSON.parse(localStorage.getItem(INTENTOS_KEY)) || { fallos: 0, hasta: 0 }; } catch (e) { return { fallos: 0, hasta: 0 }; }
  }

  function registrarFallo() {
    var i = leerIntentos();
    i.fallos++;
    if (i.fallos >= 3) i.hasta = Date.now() + Math.min(15 * 60, 15 * Math.pow(2, i.fallos - 3)) * 1000;
    try { localStorage.setItem(INTENTOS_KEY, JSON.stringify(i)); } catch (e) { /* sin storage */ }
  }

  function limpiarIntentos() {
    try { localStorage.removeItem(INTENTOS_KEY); } catch (e) { /* sin storage */ }
  }

  function segundosDeEspera() {
    return Math.max(0, Math.ceil((leerIntentos().hasta - Date.now()) / 1000));
  }

  function hayLlaveGuardada() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  // ---------- GitHub ----------

  function gh(ruta, opciones) {
    opciones = opciones || {};
    return fetch('https://api.github.com/repos/' + REPO + ruta, {
      method: opciones.method || 'GET',
      cache: 'no-store',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: opciones.body ? JSON.stringify(opciones.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        var err = new Error('GitHub respondió ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }

  function verificarAcceso() {
    return gh('').then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        var err = new Error('sin permiso');
        err.status = 403;
        throw err;
      }
      branch = repo.default_branch;
    });
  }

  function textoErrorGitHub(err) {
    if (err.status === 401) return 'La llave de GitHub no es válida o venció. Usá “Olvidé mi contraseña” para cargar una nueva.';
    if (err.status === 403 || err.status === 404) return 'La llave no tiene permiso para editar la web. Revisá que tenga acceso a “lumina” con Contents: Read and write.';
    if (err.status === 409) return 'Alguien guardó cambios mientras tanto. Recargá la página y volvé a intentar.';
    return 'No se pudo conectar con GitHub. Revisá tu internet y probá de nuevo.';
  }

  function utf8AB64(texto) {
    return b64(new TextEncoder().encode(texto));
  }

  function cargarDatos() {
    return gh('/contents/' + DATA_PATH + '?ref=' + encodeURIComponent(branch)).then(function (archivo) {
      dataSha = archivo.sha;
      data = JSON.parse(new TextDecoder().decode(desdeB64(archivo.content.replace(/\n/g, ''))));
      data.productos.forEach(function (p) { p._k = 'p' + (claveTemp++); });
      data.categorias.forEach(function (c) { c._k = 'c' + (claveTemp++); });
    });
  }

  function subirArchivo(ruta, base64, mensajeCommit, sha) {
    var body = { message: mensajeCommit, content: base64, branch: branch };
    if (sha) body.sha = sha;
    return gh('/contents/' + ruta, { method: 'PUT', body: body });
  }

  // ---------- fotos ----------

  // Recorta al centro en 4:5 y achica a 800×1000 para que la web cargue rápido.
  function procesarFoto(file) {
    return new Promise(function (resolve, reject) {
      // Se vuelve a dibujar en un canvas: así la foto que se sube no lleva los datos
      // ocultos del celular (ubicación GPS, modelo, fecha).
      if (!/^image\//.test(file.type) || file.size > MAX_FOTO_BYTES) { reject(new Error('imagen')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var W = 800, H = 1000;
        var escala = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        var w = img.naturalWidth * escala, h = img.naturalHeight * escala;
        var canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        resolve({ preview: dataUrl, base64: dataUrl.split(',')[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }

  // ---------- utilidades del editor ----------

  function slug(texto) {
    return String(texto).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item';
  }

  function idUnico(base, usados) {
    var id = base, n = 2;
    while (usados[id]) id = base + '-' + (n++);
    usados[id] = true;
    return id;
  }

  function marcarSucio() {
    sucio = true;
    mensaje('editor', 'Tenés cambios sin guardar.');
  }

  function el(tag, attrs, hijos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
      else e.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) e.appendChild(h); });
    return e;
  }

  function campo(etiqueta, input, clase) {
    var id = 'f' + (claveTemp++);
    input.id = id;
    return el('div', { 'class': 'field' + (clase ? ' ' + clase : '') }, [
      el('label', { 'for': id, text: etiqueta }), input
    ]);
  }

  function inputTexto(valor, alCambiar, extra) {
    var i = el('input', Object.assign({ type: 'text', maxlength: '80' }, extra || {}));
    i.value = valor || '';
    i.addEventListener('input', function () { alCambiar(i.value); marcarSucio(); });
    return i;
  }

  // ---------- render ----------

  function render() {
    renderCategorias();
    renderProductos();
  }

  function renderCategorias() {
    var cont = $('[data-cats]');
    cont.textContent = '';
    data.categorias.forEach(function (c) {
      cont.appendChild(el('div', { 'class': 'cat-row' }, [
        campo('Nombre', inputTexto(c.nombre, function (v) { c.nombre = v; refrescarSelects(); }, { placeholder: 'Ej: Budines' })),
        campo('Etiqueta', inputTexto(c.etiqueta, function (v) { c.etiqueta = v; }, { placeholder: 'Ej: Budín' })),
        el('button', {
          type: 'button', 'class': 'btn btn-danger', text: 'Eliminar',
          on: { click: function () {
            var enUso = data.productos.filter(function (p) { return claveCategoria(p) === c._k; }).length;
            if (enUso) { alert('Esta categoría tiene ' + enUso + ' producto(s). Pasalos a otra categoría o eliminalos primero.'); return; }
            if (!confirm('¿Eliminar la categoría “' + (c.nombre || 'sin nombre') + '”?')) return;
            data.categorias.splice(data.categorias.indexOf(c), 1);
            marcarSucio(); render();
          } }
        })
      ]));
    });
  }

  function opcionesCategorias(select, actual) {
    select.textContent = '';
    data.categorias.forEach(function (c) {
      var o = el('option', { value: c._k, text: c.nombre || '(sin nombre)' });
      if (c._k === actual) o.selected = true;
      select.appendChild(o);
    });
  }

  function claveCategoria(p) {
    var c = data.categorias.filter(function (c) { return c.id && c.id === p.categoria; })[0];
    if (c) return c._k;
    return p._catK || (data.categorias[0] && data.categorias[0]._k);
  }

  function refrescarSelects() {
    document.querySelectorAll('select[data-prod]').forEach(function (s) {
      var p = data.productos.filter(function (p) { return p._k === s.getAttribute('data-prod'); })[0];
      if (p) opcionesCategorias(s, claveCategoria(p));
    });
  }

  function renderProductos() {
    var cont = $('[data-prods]');
    cont.textContent = '';
    data.productos.forEach(function (p, i) {
      var nueva = fotosNuevas[p._k];
      var thumb = nueva || p.imagen
        ? el('img', { 'class': 'thumb', alt: '', src: nueva ? nueva.preview : (p._preview || '../' + IMG_DIR + encodeURIComponent(p.imagen)) })
        : el('div', { 'class': 'thumb thumb-empty', text: 'Sin foto' });

      var file = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Cambiar foto de ' + (p.nombre || 'producto') });
      file.addEventListener('change', function () {
        if (!file.files[0]) return;
        procesarFoto(file.files[0]).then(function (foto) {
          fotosNuevas[p._k] = foto;
          marcarSucio(); renderProductos();
        }).catch(function () { alert('No se pudo leer esa imagen. Probá con una foto JPG o PNG de menos de 25 MB.'); });
      });

      var select = el('select', { 'data-prod': p._k });
      opcionesCategorias(select, claveCategoria(p));
      select.addEventListener('change', function () { p._catK = select.value; p.categoria = null; marcarSucio(); });

      var precio = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'Consultar' });
      precio.value = p.precio === null || p.precio === undefined ? '' : p.precio;
      precio.addEventListener('input', function () {
        var n = parseInt(precio.value, 10);
        p.precio = isNaN(n) || n < 0 ? null : n;
        marcarSucio();
      });

      cont.appendChild(el('div', { 'class': 'prod-card' }, [
        el('div', { 'class': 'prod-photo' }, [
          thumb,
          el('span', { 'class': 'btn btn-light file-btn', text: p.imagen || nueva ? 'Cambiar foto' : 'Subir foto' }, [file])
        ]),
        el('div', { 'class': 'prod-fields' }, [
          campo('Nombre', inputTexto(p.nombre, function (v) { p.nombre = v; }, { placeholder: 'Ej: Budín de naranja' }), 'field-wide'),
          campo('Descripción', inputTexto(p.detalle, function (v) { p.detalle = v; }, { placeholder: 'Ej: 550 g' }), 'field-wide'),
          campo('Categoría', select),
          campo('Precio ($)', precio),
          el('div', { 'class': 'prod-actions' }, [
            p.id ? null : el('span', { 'class': 'badge-new', text: 'Nuevo' }),
            el('button', { type: 'button', 'class': 'btn btn-icon', 'aria-label': 'Subir', text: '↑', on: { click: function () { mover(i, -1); } } }),
            el('button', { type: 'button', 'class': 'btn btn-icon', 'aria-label': 'Bajar', text: '↓', on: { click: function () { mover(i, 1); } } }),
            el('button', { type: 'button', 'class': 'btn btn-danger', text: 'Eliminar', on: { click: function () {
              if (!confirm('¿Eliminar “' + (p.nombre || 'este producto') + '”?')) return;
              data.productos.splice(i, 1);
              delete fotosNuevas[p._k];
              marcarSucio(); render();
            } } })
          ])
        ])
      ]));
    });
  }

  function mover(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= data.productos.length) return;
    var tmp = data.productos[i];
    data.productos[i] = data.productos[j];
    data.productos[j] = tmp;
    marcarSucio(); renderProductos();
  }

  // ---------- guardar ----------

  function validar() {
    if (!data.categorias.length) return 'Tiene que haber al menos una categoría.';
    for (var i = 0; i < data.categorias.length; i++) {
      if (!data.categorias[i].nombre.trim()) return 'Hay una categoría sin nombre.';
    }
    var claves = data.categorias.map(function (c) { return c._k; });
    for (var k = 0; k < data.productos.length; k++) {
      var p = data.productos[k];
      if (!p.nombre.trim()) return 'Hay un producto sin nombre.';
      if (p.precio !== null && p.precio !== undefined && !(Number.isInteger(p.precio) && p.precio <= 100000000)) return 'El precio de “' + p.nombre + '” no es válido.';
      if (p.imagen && !FOTO_OK.test(p.imagen)) return 'La foto de “' + p.nombre + '” tiene un nombre no válido. Subila de nuevo.';
      if (p.id && !ID_OK.test(p.id)) return '“' + p.nombre + '” tiene un id no válido.';
      if (claves.indexOf(claveCategoria(p)) === -1) return '“' + p.nombre + '” no tiene categoría.';
    }
    return null;
  }

  function prepararJson() {
    // Ids para lo nuevo; las categorías y productos existentes conservan el suyo.
    var usadosCat = {};
    data.categorias.forEach(function (c) { if (c.id) usadosCat[c.id] = true; });
    var catPorK = {};
    data.categorias.forEach(function (c) {
      if (!c.id) c.id = idUnico(slug(c.nombre), usadosCat);
      catPorK[c._k] = c.id;
    });
    var usadosProd = {};
    data.productos.forEach(function (p) { if (p.id) usadosProd[p.id] = true; });
    data.productos.forEach(function (p) {
      if (!p.id) p.id = idUnico(slug(p.nombre), usadosProd);
      p.categoria = catPorK[claveCategoria(p)];
      delete p._catK;
    });
    return {
      whatsapp: /^\d{8,15}$/.test(String(data.whatsapp || '')) ? String(data.whatsapp) : '5491132385943',
      categorias: data.categorias.map(function (c) {
        return { id: c.id, nombre: c.nombre.trim(), etiqueta: (c.etiqueta || c.nombre).trim() };
      }),
      productos: data.productos.map(function (p) {
        return { id: p.id, categoria: p.categoria, nombre: p.nombre.trim(), detalle: (p.detalle || '').trim(), precio: p.precio === undefined ? null : p.precio, imagen: p.imagen || '' };
      })
    };
  }

  function guardar() {
    var error = validar();
    if (error) { mensaje('editor', error, 'error'); return; }
    var boton = $('[data-save]');
    boton.disabled = true;
    mensaje('editor', 'Guardando…');

    var json = prepararJson();
    var pendientes = data.productos.filter(function (p) { return fotosNuevas[p._k]; });
    var cadena = Promise.resolve();
    pendientes.forEach(function (p, n) {
      cadena = cadena.then(function () {
        mensaje('editor', 'Subiendo foto ' + (n + 1) + ' de ' + pendientes.length + '…');
        var nombre = p.id + '-' + Date.now() + '.jpg';
        return subirArchivo(IMG_DIR + nombre, fotosNuevas[p._k].base64, 'Admin: foto de ' + p.nombre).then(function () {
          p.imagen = nombre;
          // Hasta que GitHub Pages publique la foto, se sigue mostrando la vista previa.
          p._preview = fotosNuevas[p._k].preview;
          json.productos.filter(function (x) { return x.id === p.id; })[0].imagen = nombre;
          delete fotosNuevas[p._k];
        });
      });
    });
    cadena.then(function () {
      mensaje('editor', 'Guardando productos…');
      return subirArchivo(DATA_PATH, utf8AB64(JSON.stringify(json, null, 2) + '\n'), 'Admin: actualizar productos', dataSha);
    }).then(function (res) {
      dataSha = res.content.sha;
      sucio = false;
      mensaje('editor', '¡Listo! Los cambios se ven en la web en unos minutos.', 'ok');
      render();
    }).catch(function (err) {
      mensaje('editor', textoErrorGitHub(err), 'error');
    }).then(function () {
      boton.disabled = false;
    });
  }

  // ---------- entrar / configurar ----------

  function entrarAlEditor() {
    mostrar('loading');
    return verificarAcceso().then(cargarDatos).then(function () {
      mostrar('editor');
      mensaje('editor', '');
      render();
    });
  }

  $('[data-setup]').addEventListener('click', function () {
    var llave = $('#setup-token').value.trim();
    var p1 = $('#setup-pass').value;
    var p2 = $('#setup-pass2').value;
    if (!llave) { mensaje('setup', 'Pegá la llave de GitHub.', 'error'); return; }
    // Solo llaves "fine-grained": se limitan a este repositorio. Las clásicas (ghp_…)
    // dan acceso a todos los repos de la cuenta y no se aceptan.
    if (!/^github_pat_[A-Za-z0-9_]{20,255}$/.test(llave)) { mensaje('setup', 'La llave tiene que ser “fine-grained” (empieza con github_pat_). Seguí los pasos de la ayuda.', 'error'); return; }
    if (p1.length < MIN_PASS) { mensaje('setup', 'La contraseña tiene que tener al menos ' + MIN_PASS + ' caracteres.', 'error'); return; }
    if (p1 !== p2) { mensaje('setup', 'Las contraseñas no coinciden.', 'error'); return; }
    mensaje('setup', 'Verificando…');
    token = llave;
    verificarAcceso().then(function () {
      return guardarLlave(llave, p1);
    }).then(function () {
      $('#setup-token').value = $('#setup-pass').value = $('#setup-pass2').value = '';
      return entrarAlEditor();
    }).catch(function (err) {
      token = null;
      mostrar('setup');
      mensaje('setup', err.status ? textoErrorGitHub(err) : 'No se pudo guardar. Probá de nuevo.', 'error');
    });
  });

  var entrando = false;

  function login() {
    var pass = $('#login-pass').value;
    if (!pass || entrando) return;
    var espera = segundosDeEspera();
    if (espera) { mensaje('login', 'Demasiados intentos. Esperá ' + espera + ' segundos.', 'error'); return; }
    entrando = true;
    mensaje('login', 'Entrando…');
    abrirLlave(pass).then(function (llave) {
      token = llave;
      limpiarIntentos();
      $('#login-pass').value = '';
      mensaje('login', '');
      return entrarAlEditor().catch(function (err) {
        mostrar('login');
        mensaje('login', textoErrorGitHub(err), 'error');
      });
    }, function () {
      registrarFallo();
      var espera = segundosDeEspera();
      mensaje('login', 'Contraseña incorrecta.' + (espera ? ' Esperá ' + espera + ' segundos para volver a probar.' : ''), 'error');
    }).then(function () { entrando = false; });
  }
  $('[data-login]').addEventListener('click', login);
  $('#login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });

  $('[data-reset]').addEventListener('click', function () {
    if (!confirm('Se va a borrar la configuración de este dispositivo y vas a tener que cargar la llave de GitHub de nuevo. ¿Seguir?')) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(INTENTOS_KEY); } catch (e) { /* nada */ }
    mostrar('setup');
  });

  $('[data-logout]').addEventListener('click', function () {
    if (sucio && !confirm('Tenés cambios sin guardar. ¿Salir igual?')) return;
    salir();
  });

  function salir() {
    token = null; data = null; fotosNuevas = {}; sucio = false;
    mostrar('login');
  }

  // Si el panel queda abierto sin uso, se cierra la sesión (salvo que haya cambios sin guardar).
  var ultimoUso = Date.now();
  ['pointerdown', 'keydown', 'input'].forEach(function (ev) {
    document.addEventListener(ev, function () { ultimoUso = Date.now(); }, true);
  });
  setInterval(function () {
    if (token && !sucio && Date.now() - ultimoUso > INACTIVIDAD_MS) {
      salir();
      mensaje('login', 'Se cerró la sesión por inactividad.');
    }
  }, 30 * 1000);

  $('[data-save]').addEventListener('click', guardar);

  $('[data-add-cat]').addEventListener('click', function () {
    data.categorias.push({ id: '', nombre: '', etiqueta: '', _k: 'c' + (claveTemp++) });
    marcarSucio(); render();
    var inputs = document.querySelectorAll('[data-cats] input');
    inputs[inputs.length - 2].focus();
  });

  $('[data-add-prod]').addEventListener('click', function () {
    var p = { id: '', categoria: null, nombre: '', detalle: '', precio: null, imagen: '', _k: 'p' + (claveTemp++) };
    p._catK = data.categorias[0] && data.categorias[0]._k;
    data.productos.push(p);
    marcarSucio(); renderProductos();
    var cards = document.querySelectorAll('.prod-card');
    cards[cards.length - 1].querySelector('input[type="text"]').focus();
  });

  window.addEventListener('beforeunload', function (e) {
    if (sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  mostrar(hayLlaveGuardada() ? 'login' : 'setup');
})();
