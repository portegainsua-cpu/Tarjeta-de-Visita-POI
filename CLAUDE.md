# Tarjeta de Visita POI

Tarjeta de visita virtual de Pablo Ortega Insúa (AIResolutionLabs), publicada en
https://founder.airesolutionlabs.com. Es una página única tipo "botonera" con enlaces
a formularios, reserva de cita, web corporativa, LinkedIn y email, más botones para
guardar el contacto (vCard) y compartir. Es instalable como app (PWA). Es la base
de la plantilla de tarjetas para clientes: prioriza código limpio y datos centralizados.

Repo: https://github.com/portegainsua-cpu/Tarjeta-de-Visita-POI

## Reglas

- **No hacer commit ni push sin confirmación de Pablo.**
- No tocar `main` directamente: trabajar en ramas y que Pablo decida cuándo subir.
- No tocar las carpetas hermanas `../Gorespro` ni `../Irene Ortega`.
- Mantener funcionando: descarga de vCard, compartir y copiar email.

## Stack

- HTML5 + CSS + JavaScript vanilla. La tarjeta está en `index.html` (estilos en
  `<style>`, lógica en `<script>`). Sin framework, sin `package.json` ni build.
- Formularios: `tarjeta/` y `automatiza/` con `assets/formularios.css` y
  `assets/formularios.js` (cargados con `?v=N`: súbelo si los cambias). Envían a un
  Google Apps Script (copia en `docs/apps-script/Code.gs`) con antispam Cloudflare
  Turnstile. Detalles, URLs y cómo desplegar: `docs/formularios.md`.
- Nunca poner en el repo la clave secreta de Turnstile ni otros secretos: van en
  las propiedades del Apps Script.
- Diseño de la marca AIR (variante E): fondo celeste, cabecera azul noche, bloques
  blancos, paleta cobalto y naranja, textos en "usted" y primera persona.
- Datos del script en el objeto `CONFIG` (inicio del `<script>`, incluye las frases);
  colores en variables `--color-*` de `:root` (inicio del `<style>` y de
  `assets/formularios.css`, que deben coincidir). No añadir colores sueltos.
- Fuente Manrope variable local en `fonts/` (woff2, font-display: swap, preload).
  Sin dependencias externas ni peticiones a terceros (salvo Turnstile en los formularios).
- Iconos SVG inline de la familia Lucide (trazo 1,5) con `aria-hidden="true"`.
- En los formularios no se cambian los `name` de los campos ni el texto de las opciones:
  tienen que coincidir con `OPCIONES` de `docs/apps-script/Code.gs`.
- `docs/herramientas/generar_paginas.py`: OBSOLETO desde el rediseño AIR (06/10/2026): genera el diseño antiguo, no usar.
- PWA: `manifest.webmanifest` + `sw.js` (HTML network-first, estáticos
  cache-first, caché versionada con `CACHE_VERSION`). Si se cambia un recurso
  estático sin renombrarlo, subir `CACHE_VERSION`; si se añade uno, incluirlo
  en `PRECACHE_URLS`.
- Despliegue: GitHub Pages desde `main`, dominio en `CNAME`
  (`founder.airesolutionlabs.com`). Sin Actions, Vercel ni Netlify.

## Criterios de calidad

- Lighthouse móvil: Rendimiento ≥ 95, Accesibilidad ≥ 95, Buenas prácticas ≥ 95, SEO 100.
- Ningún texto por debajo de 13 px; `:focus-visible` visible; respetar
  `prefers-reduced-motion`; enlaces `target="_blank"` con
  `rel="noopener noreferrer"` y aviso `.sr-only`.
- Nada de la animación de entrada debe ocultar la foto ni el nombre en el
  primer pintado.

## Previsualizar en local

No hay build, pero hace falta un servidor (el service worker y el portapapeles
no funcionan en `file://`), por ejemplo la extensión Live Server de VS Code.
En este equipo no hay Git, Node ni Python instalados en el sistema.
