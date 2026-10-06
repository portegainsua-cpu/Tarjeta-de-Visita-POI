# Formularios de la tarjeta: cómo funcionan

Actualizado: 06/10/2026 (script 1.3.0). Sustituye a `docs/brief-formularios.md` (propuesta inicial con Cloudflare Worker + Make, descartada).

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
   - el límite de envíos: 3 por email y hora y 30 cada 10 minutos en total. El contador se lee y se suma con un bloqueo (`LockService`), para que dos envíos simultáneos no pasen con el mismo valor. Si no consigue el bloqueo en 10 s, responde `interno` y la página ofrece escribir a info@.
4. Guarda la fila en `Solicitudes` con estado "Nuevo". Neutraliza fórmulas y guarda el teléfono como texto.
5. Envía un aviso a la propia cuenta de Gmail, que llega a la bandeja de entrada, con enlace a WhatsApp y a la hoja.
6. Envía la confirmación al solicitante desde info@airesolutionlabs.com (alias "Enviar como" de Gmail). Si el alias no está disponible, la envía desde la cuenta principal con respuesta a info@. La comprobación del alias se guarda 6 horas (10 minutos si no existe); `comprobarConfiguracion()` la borra.
   - Tratamiento de **usted** y primera persona. Saludo según la hora de Madrid: "Buenos días" hasta las 14:00, "Buenas tardes" hasta las 21:00 y "Buenas noches" el resto.
   - No repite texto libre del solicitante: ni el negocio ni el mensaje. El nombre de pila solo aparece si son letras (si no, el saludo va sin nombre). Así nadie puede usar el formulario para enviar texto o enlaces a otra persona desde info@.
   - Los únicos enlaces son direcciones fijas del script (`URLS_FIJAS`: Cal.com, la tarjeta y la web).
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

Pruebas automáticas del script (con servicios de Google simulados): `node docs/herramientas/test.js`.

## Medir cuánto tarda un envío

Cada envío deja una línea en el registro: editor de Apps Script → **Ejecuciones** → la ejecución de `doPost` → registro. Ejemplo:

```
{"evento":"tiempos","version":"1.3.0","id":"3f2a1b9c","formulario":"contacto","resultado":"ok",
 "ms":{"arranque":40,"turnstile":420,"limite":60,"hoja":1300,"alias":20,"aviso":1900,"confirmacion":2100,"celda":350},
 "total":6200}
```

| Fase | Qué mide |
|---|---|
| `arranque` | Desde que Google carga el script hasta que empieza `doPost` |
| `turnstile` | Verificación con Cloudflare |
| `limite` | Bloqueo y contador de envíos |
| `hoja` | Abrir la hoja y añadir la fila (incluye esperar el bloqueo) |
| `alias` | Cuota de Gmail y comprobación del alias (casi 0 cuando está en caché) |
| `aviso` | Correo a Pablo |
| `confirmacion` | Correo al solicitante |
| `celda` | Escribir el resultado en la columna "Confirmación" |

El arranque en frío de Google (antes de cargar el script) no sale aquí: es la diferencia entre lo que espera el navegador (pestaña Red de las herramientas de desarrollo) y `total`.

## Cambiar las páginas

- Textos de los formularios: `tarjeta/index.html` y `automatiza/index.html`.
- Si cambias `assets/formularios.css` o `assets/formularios.js`, sube el `?v=` en las tres páginas que los cargan.
- Opciones de los desplegables y casillas: están en el HTML **y** en `OPCIONES` de `Code.gs`. Tienen que coincidir o el servidor rechazará el envío.
- Sector "Otro": al elegirlo aparece "¿Cuál es tu sector?" (campo `sector_otro`, obligatorio, de 2 a 60 caracteres). En la hoja se guarda en la columna Sector como `Otro: <lo que escriba>`.

## Límites que conviene conocer

- Gmail gratuito: 100 destinatarios al día desde Apps Script. Cada solicitud usa 2 (aviso y confirmación), así que caben unas 50 solicitudes al día. Si se agota la cuota, la fila se guarda igual y en la columna "Confirmación" pone "No enviada: cuota diaria agotada".
- El envío suele tardar de 5 a 8 segundos (Apps Script es lento al arrancar), pero se han visto envíos de más de 25 s desde la web. La página muestra "Un momento, lo estoy registrando…". Para saber qué fase tarda, mira la línea `tiempos` del registro (sección anterior). Los formularios de la tarjeta esperan 25 s (`TIEMPO_MAXIMO_MS` en `assets/formularios.js`); la web, 45 s.

## Pendiente

- Política de privacidad: responsable = Pablo Ortega Insúa (persona física). Cambiarla cuando exista la sociedad o haya alta de autónomo.
- Aviso legal de la tarjeta (LSSI art. 10): pendiente, igual que en la web.
- Cuenta de Gmail gratuita: Google no actúa como encargado del tratamiento con un contrato RGPD en cuentas personales. Cuando haya volumen, conviene pasar a Google Workspace.
- Las páginas de los formularios de la tarjeta (`tarjeta/`, `automatiza/`, `privacidad/`) siguen en "tú"; los correos ya van en "usted". Se cambian con la nueva marca de la tarjeta.
- Si la línea `tiempos` muestra que los correos son la parte lenta: sacarlos de la petición (cola con un disparador cada minuto).
