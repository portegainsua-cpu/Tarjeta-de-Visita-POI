# Formularios de la tarjeta: cómo funcionan

Actualizado: 25/09/2026. Sustituye a `docs/brief-formularios.md` (propuesta inicial con Cloudflare Worker + Make, descartada).

## Qué hay

| Pieza | Dónde |
|---|---|
| Formulario "Tu tarjeta digital gratis" | `tarjeta/index.html` → https://founder.airesolutionlabs.com/tarjeta/ |
| Formulario "Automatiza tu negocio" | `automatiza/index.html` → https://founder.airesolutionlabs.com/automatiza/ |
| Formulario de contacto de la web | En www.airesolutionlabs.com (otro repo). Envía `formulario: "contacto"` con `nombre`, `email` y `mensaje` (10-2000 caracteres); se guarda en `Solicitudes` con Formulario = "Contacto" y el mensaje en la columna "Descripción" |
| Política de privacidad | `privacidad/index.html` |
| Estilos y lógica comunes | `assets/formularios.css`, `assets/formularios.js` |
| Hoja de solicitudes | Google Sheets "Solicitudes AI Resolution Labs" (Drive de portegainsprofesional@gmail.com), pestañas `Solicitudes` y `Resumen` |
| Script que recibe los envíos | Apps Script "Formularios AI Resolution Labs", vinculado a esa hoja (Extensiones → Apps Script). Copia del código en `docs/apps-script/Code.gs` |
| URL de la aplicación web | `https://script.google.com/macros/s/AKfycbzCgaigJtDxVea-eIOW5tq_OZKyM_AU4Bv7mUer4SZhgpuEOlUX0wJQLEbWa500PQMFIg/exec` (está en `assets/formularios.js`) |
| Antispam | Cloudflare Turnstile. La clave del sitio (pública) está en `assets/formularios.js`; la secreta, en las propiedades del script |

## Recorrido de un envío

1. La página valida los campos y obtiene un token de Turnstile.
2. Envía un POST (`text/plain`, cuerpo JSON) a la aplicación web.
3. El script comprueba:
   - el campo trampa `web_empresa` y un tiempo mínimo de relleno de 3 s (si falla, responde "ok" sin guardar nada);
   - el token de Turnstile y el dominio de origen;
   - el esquema de cada campo;
   - el límite de envíos: 3 por email y hora y 30 cada 10 minutos en total.
4. Guarda la fila en `Solicitudes` con estado "Nuevo". Neutraliza fórmulas y guarda el teléfono como texto.
5. Envía un aviso a la propia cuenta de Gmail, que llega a la bandeja de entrada, con enlace a WhatsApp y a la hoja.
6. Envía la confirmación al solicitante desde info@airesolutionlabs.com (alias "Enviar como" de Gmail). Si el alias no está disponible, la envía desde la cuenta principal con respuesta a info@.
7. Responde `{ok:true}`. La página muestra el mensaje de éxito. Si algo falla, ofrece escribir a info@.

## Propiedades del script

Configuración del proyecto → Propiedades del script:

| Propiedad | Valor |
|---|---|
| `TURNSTILE_SECRET` | Clave secreta del widget de Turnstile |
| `TEST_MODE` | `false` en producción. Con `true` acepta el token de prueba de Turnstile y marca las filas como PRUEBA |

## Cambiar el código del script

1. Edita `Code.gs` en el editor de Apps Script (y actualiza la copia en `docs/apps-script/`).
2. Guarda.
3. Implementar → Gestionar implementaciones → lápiz → Versión: **Nueva versión** → Implementar. La URL no cambia.

Pruebas automáticas del script (con servicios de Google simulados): `node test.js` en la carpeta de pruebas del proyecto.

## Cambiar las páginas

- Textos de los formularios: `tarjeta/index.html` y `automatiza/index.html`.
- Si cambias `assets/formularios.css` o `assets/formularios.js`, sube el `?v=` en las tres páginas que los cargan.
- Opciones de los desplegables y casillas: están en el HTML **y** en `OPCIONES` de `Code.gs`. Tienen que coincidir o el servidor rechazará el envío.
- Sector "Otro": al elegirlo aparece "¿Cuál es tu sector?" (campo `sector_otro`, obligatorio, de 2 a 60 caracteres). En la hoja se guarda en la columna Sector como `Otro: <lo que escriba>`.

## Límites que conviene conocer

- Gmail gratuito: 100 destinatarios al día desde Apps Script. Cada solicitud usa 2 (aviso y confirmación), así que caben unas 50 solicitudes al día. Si se agota la cuota, la fila se guarda igual y en la columna "Confirmación" pone "No enviada: cuota diaria agotada".
- El envío tarda de 5 a 8 segundos (Apps Script es lento al arrancar). La página muestra "Un momento, lo estoy registrando…".

## Pendiente

- Política de privacidad: responsable = Pablo Ortega Insúa (persona física). Cambiarla cuando exista la sociedad o haya alta de autónomo.
- Aviso legal de la tarjeta (LSSI art. 10): pendiente, igual que en la web.
- Cuenta de Gmail gratuita: Google no actúa como encargado del tratamiento con un contrato RGPD en cuentas personales. Cuando haya volumen, conviene pasar a Google Workspace.
- La web corporativa podría usar este mismo script para su formulario de contacto y dejar de exponer el webhook de Make.
