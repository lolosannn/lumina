# Lúmina Bakery — sitio web

Tienda web de Lúmina Bakery: catálogo de budines, cookies y tortas materas, con un carrito que arma el pedido y lo envía por WhatsApp.

Es un sitio estático (HTML, CSS y JavaScript, sin dependencias ni compilación), así que se puede publicar gratis en GitHub Pages, Netlify o Vercel.

## Estructura

```
index.html            Página principal
css/styles.css        Estilos (colores de la marca en :root)
css/fonts.css         Tipografías alojadas en el sitio (archivos en fonts/)
data/productos.json   Productos, precios, categorías y número de WhatsApp (se edita desde /admin)
js/app.js             Lógica de filtros, carrito y mensaje de WhatsApp
img/                  Logo e imágenes de la portada
img/productos/        Fotos de los productos
admin/                Panel de administración
```

## Panel de administración (/admin)

Entrando a `/admin` (por ejemplo `https://lolosannn.github.io/lumina/admin`) se pueden cambiar precios y fotos, agregar o quitar productos y crear o quitar categorías. Al tocar **Guardar cambios**, el panel guarda todo en este repositorio y GitHub Pages publica la nueva versión en unos minutos.

**Primera vez en cada dispositivo** (celular, compu):

1. Crear una llave de GitHub en https://github.com/settings/personal-access-tokens/new con la cuenta dueña del repo:
   - Repository access: *Only select repositories* → `lumina`.
   - Permissions → Repository permissions → **Contents: Read and write**.
2. En `/admin`, pegar la llave y elegir una contraseña (mínimo 10 caracteres). Solo se aceptan llaves *fine-grained* (`github_pat_…`): las clásicas dan acceso a todos los repos de la cuenta.

Después, para entrar, solo se pide la contraseña. La llave queda guardada **cifrada con esa contraseña** solo en ese dispositivo; nunca se sube a la web. Si se olvida la contraseña, “Olvidé mi contraseña” borra la configuración y se vuelve a cargar la llave.

Los datos quedan en `data/productos.json`: `precio` es un número sin puntos (`6500` = $6.500) o `null` para “Consultar”, e `imagen` es el nombre del archivo en `img/productos/`.

## Ver la página en la compu

Levantá un servidor local (abriendo `index.html` directo no cargan los productos):

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

## Seguridad

El sitio no tiene servidor, base de datos, formularios ni pagos: el pedido viaja por WhatsApp, así que no guarda datos de clientes. Aun así tiene estas protecciones:

- **Política de seguridad de contenido (CSP)** en `index.html`: el navegador solo ejecuta scripts, estilos, fuentes e imágenes del propio sitio. Bloquea código inyectado y cualquier recurso externo.
- **Sin recursos de terceros**: las tipografías están en `fonts/` (antes venían de Google Fonts), así que ninguna visita se comparte con otros servicios.
- **Todo el texto que se muestra se escapa** antes de insertarse en la página, y el carrito guardado en el navegador se valida al leerlo (solo productos existentes y cantidades de 1 a 50).
- **Límites** en nombre (60 caracteres) y aclaraciones (300).
- **Links externos** con `rel="noopener noreferrer"` y referrer limitado.
- **Anti-clickjacking**: la página no se deja mostrar dentro de un iframe de otro sitio.
- **Datos de productos validados**: lo que llega de `data/productos.json` se filtra antes de usarse (ids simples, fotos solo de `img/productos/` con extensión de imagen, precios enteros, WhatsApp de 8 a 15 dígitos). Un dato con forma rara se descarta.
- **`/.well-known/security.txt`**: indica dónde reportar un problema de seguridad (avisos privados del repo). Vence cada año: actualizar la fecha `Expires`.

### Panel de administración

- La llave de GitHub se guarda cifrada (AES-GCM, clave derivada con PBKDF2-SHA256 de 600.000 iteraciones). Las guardadas con la versión anterior se vuelven a cifrar solas al entrar.
- Después de 3 contraseñas incorrectas hay que esperar, cada vez el doble (hasta 15 minutos).
- La sesión se cierra sola tras 20 minutos sin uso, si no hay cambios sin guardar.
- Las fotos se vuelven a dibujar antes de subirse, así no llevan la ubicación GPS ni otros datos del celular; se rechazan archivos que no son imágenes o pesan más de 25 MB.
- Antes de guardar se validan precios, ids y nombres de fotos.
- CSP propia: solo puede conectarse al propio sitio y a `api.github.com`; `noindex` para que no aparezca en buscadores.

Si se agregan scripts o estilos nuevos, tienen que ir en archivos propios (no en línea ni desde otro dominio), o la CSP los va a bloquear.

### Recomendado en GitHub (lo hace la dueña de la cuenta)

1. **Settings → Pages → Enforce HTTPS** activado.
2. **Autenticación en dos pasos** en la cuenta de GitHub (Settings → Password and authentication).
3. Si se usa un dominio propio, **verificarlo** en Settings → Pages para que nadie más pueda usarlo.
4. **Proteger la rama principal** (Settings → Branches/Rules): impedir force-push y borrado.
5. **Llave del admin con vencimiento** y solo con acceso a `lumina` → Contents: Read and write. Si un celular se pierde, revocarla en https://github.com/settings/personal-access-tokens.
6. Activar **Private vulnerability reporting** (Settings → Security) para que funcione el link de `security.txt`.
