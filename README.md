# Lúmina Bakery — sitio web

Tienda web de Lúmina Bakery: catálogo de budines, cookies y tortas materas, con un carrito que arma el pedido y lo envía por WhatsApp.

Es un sitio estático (HTML, CSS y JavaScript, sin dependencias ni compilación), así que se puede publicar gratis en GitHub Pages, Netlify o Vercel.

## Estructura

```
index.html            Página principal
css/styles.css        Estilos (colores de la marca en :root)
js/productos.js       Productos, precios, categorías y número de WhatsApp  ← lo que más se edita
js/app.js             Lógica de filtros, carrito y mensaje de WhatsApp
img/                  Logo e imágenes de la portada
img/productos/        Fotos de los productos (ver img/productos/LEEME.md)
```

## Cambiar productos o precios

Todo está en `js/productos.js`. Cada producto tiene:

- `nombre`, `detalle` (texto chico debajo del nombre) y `categoria` (`budines`, `cookies` o `tortas`).
- `precio`: número sin puntos (`6500` = $6.500). Con `null` aparece "Consultar" y en el pedido sale "precio a confirmar".
- `imagen`: nombre del archivo dentro de `img/productos/`.

## Ver la página en la compu

Abrí `index.html` en el navegador, o levantá un servidor local:

```
python3 -m http.server 8000
```

y entrá a http://localhost:8000.

## Cómo funciona el pedido

El carrito se guarda en el navegador del cliente. Al tocar "Enviar pedido por WhatsApp" se abre WhatsApp al 11-3238-5943 con un mensaje así:

```
¡Hola Lúmina Bakery! Quiero hacer este pedido:

• 2 x Budín marmolado — $12.000
• 1 x Cookies clásicas — $4.000

Total: $16.000
Nombre: Sofía
Aclaraciones: Retiro el sábado
```
