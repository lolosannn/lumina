// Datos de la tienda. Editá este archivo para cambiar productos, precios o fotos.
//
// - precio: número sin puntos (6000 = $6.000). Usá null si el precio se consulta.
// - imagen: nombre del archivo dentro de img/productos/. Si la foto no existe,
//   la tarjeta muestra "Foto próximamente".
// - categoria: tiene que coincidir con el id de alguna de las CATEGORIAS.

window.LUMINA = {
  // Número de WhatsApp en formato internacional, sin "+" ni espacios.
  whatsapp: '5491132385943',

  categorias: [
    { id: 'budines', nombre: 'Budines', etiqueta: 'Budín' },
    { id: 'cookies', nombre: 'Cookies', etiqueta: 'Cookies' },
    { id: 'tortas', nombre: 'Tortas materas', etiqueta: 'Torta' }
  ],

  productos: [
    { id: 'budin-limon', categoria: 'budines', nombre: 'Budín de limón', detalle: '550 g', precio: 6000, imagen: 'budin-limon.jpg' },
    { id: 'budin-limon-glaseado', categoria: 'budines', nombre: 'Budín de limón glaseado', detalle: '550 g · con glaseado', precio: 6500, imagen: 'budin-limon-glaseado.jpg' },
    { id: 'budin-vainilla-chips', categoria: 'budines', nombre: 'Budín de vainilla con chips', detalle: '550 g · chips de chocolate', precio: 6500, imagen: 'budin-vainilla-chips.jpg' },
    { id: 'budin-chocolate', categoria: 'budines', nombre: 'Budín de chocolate', detalle: '550 g', precio: 6000, imagen: 'budin-chocolate.jpg' },
    { id: 'budin-marmolado', categoria: 'budines', nombre: 'Budín marmolado', detalle: '550 g', precio: 6000, imagen: 'budin-marmolado.jpg' },
    { id: 'budin-integral', categoria: 'budines', nombre: 'Budín integral', detalle: 'Consultar sabores', precio: null, imagen: 'budin-integral.jpg' },
    { id: 'cookies-clasicas', categoria: 'cookies', nombre: 'Cookies clásicas', detalle: 'Paquete x 3 unidades', precio: 4000, imagen: 'cookies-clasicas.jpg' },
    { id: 'torta-matera', categoria: 'tortas', nombre: 'Torta matera', detalle: '', precio: 10000, imagen: 'torta-matera.jpg' }
  ]
};
