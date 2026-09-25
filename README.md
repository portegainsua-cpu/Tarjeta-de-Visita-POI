# Tarjeta de visita digital — Pablo Ortega Insúa

Tarjeta de visita virtual de [AI Resolution Labs](https://www.airesolutionlabs.com/),
publicada en **https://founder.airesolutionlabs.com**.

Una sola página con accesos directos para contactar: formulario de automatización,
reserva de cita, solicitud de tarjeta propia, web corporativa, LinkedIn y email.
Incluye botones para **guardar el contacto** (descarga una vCard `.vcf`) y
**compartir** la tarjeta (menú nativo del móvil o copia del enlace). Se puede
**instalar como app** (PWA) y funciona sin conexión.

Es también la base de la plantilla de tarjetas para clientes.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La tarjeta: HTML, estilos (`<style>`) y script (`<script>`). |
| `manifest.webmanifest` | Datos de la app instalable: nombre, colores e iconos. |
| `sw.js` | Service worker: caché y funcionamiento sin conexión. |
| `img/` | Foto (`perfil-240/480.webp`), respaldo con iniciales (`perfil-fallback.svg`), imagen para redes (`og-image.jpg`) e iconos. |
| `fonts/` | Fuente Outfit en woff2 (pesos 400, 500, 600 y 700) y su licencia OFL. |
| `robots.txt`, `sitemap.xml` | Indicaciones para buscadores. |
| `CNAME` | Dominio propio de GitHub Pages. |

## Adaptar la tarjeta a otra persona

1. **Datos del script** (vCard, compartir, email): objeto `CONFIG` al principio
   del `<script>` en `index.html`.
2. **Textos visibles**: nombre, especialidad, descripción y botones en el HTML
   de `index.html`.
3. **SEO y vista previa al compartir**: `<title>`, `description`, `canonical`,
   etiquetas `og:*` y `twitter:*` y el bloque JSON-LD del `<head>`. Las URL
   de `og:image`, `og:url` y `canonical` deben ser absolutas y apuntar al
   dominio nuevo.
4. **Colores**: variables de `:root` al principio del `<style>`.
5. **Imágenes**: sustituye los archivos de `img/` respetando nombres y tamaños
   (foto cuadrada de 240 y 480 px en WebP, `og-image.jpg` de 1200×630, iconos
   de 32, 180, 192 y 512 px; el maskable con el logo dentro del 80 % central).
6. **App**: `name`, `short_name`, `description` y colores en
   `manifest.webmanifest`; `apple-mobile-web-app-title` en `index.html`.
7. **Dominio**: `CNAME`, `robots.txt` y `sitemap.xml`.

## Publicación

GitHub Pages sirve la rama `main` tal cual, sin proceso de build.

**Al cambiar una imagen, una fuente o el manifest sin cambiarle el nombre**,
sube `CACHE_VERSION` en `sw.js` (`v1` → `v2`). Si no, quien ya tenga la tarjeta
abierta o instalada seguirá viendo la versión anterior de ese archivo. Los
cambios en `index.html` no lo necesitan: el HTML siempre se pide primero a la red.

## Previsualizar en local

El service worker y los botones de copiar necesitan un servidor (no funcionan
abriendo el archivo con doble clic). Cualquier servidor estático sirve, por
ejemplo la extensión Live Server de VS Code, y después abrir `http://localhost:<puerto>/`.
