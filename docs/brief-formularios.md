# Brief: formularios propios de la tarjeta digital

- **Fecha:** 25/09/2026
- **Autor:** Claude (Cowork), para ejecutar con Claude Code
- **Estado:** decisiones F1–F4 tomadas por Pablo. Lo marcado `TODO(Pablo)` necesita un dato suyo antes de publicar.
- **Ubicación en el repo:** `docs/brief-formularios.md`
- **Relacionado:** `docs/brief-web.md` (rediseño de la web), apartado 6.7. Este brief implementa ese servicio de formularios y lo estrena en la tarjeta.

---

## 0. Instrucciones para Claude Code

1. Lee este documento entero antes de tocar código.
2. No inventes datos de negocio (plazos, textos legales, NIF, dirección). Usa `TODO(Pablo)` y lístalos al final.
3. Ningún secreto (URL del webhook de Make, clave secreta de Turnstile, token compartido) puede quedar en un repo, en un archivo de configuración versionado ni en el código del navegador.
4. No hagas merge a `main`, no hagas `wrangler deploy` a producción y no toques DNS sin confirmación de Pablo.
5. Cada entrega termina con: lista de cambios, cómo lo has probado, puntuaciones de Lighthouse (móvil) de las páginas nuevas y los `TODO(Pablo)` abiertos.

---

## 1. Objetivo

Sustituir los dos enlaces a Google Forms de la tarjeta (founder.airesolutionlabs.com) por formularios propios con el diseño de la tarjeta:

- **"Automatiza tu negocio"** → `/automatiza/`. Captación de clientes de consultoría.
- **"¿Quieres tu propia tarjeta?"** → `/tarjeta/`. Solicitud de la tarjeta gratuita. Es la entrada de la prueba comercial: tarjetas hechas a mano, regaladas, para abrir conversación y vender otros servicios.

El servicio que recibe los datos se construye una sola vez y servirá después para el formulario de contacto de la web y para los formularios de leads de clientes.

## 2. Decisiones tomadas

| ID | Decisión |
|---|---|
| F1 | Los formularios envían a una **función propia en Cloudflare Workers**, que valida y reenvía a **Make**. |
| F2 | **Páginas propias** (`/tarjeta/` y `/automatiza/`), no ventanas emergentes. Así hay un enlace que se puede pegar en un mensaje de Instagram. |
| F3 | El formulario de la tarjeta es **corto**. La foto, el logo y los detalles se piden después por WhatsApp. |
| F4 | Por cada envío: **fila en Google Sheet**, **email a info@airesolutionlabs.com** y **respuesta automática** al solicitante. |

## 3. Arquitectura

```
Navegador (/tarjeta/ o /automatiza/)
   │  POST JSON + token de Turnstile
   ▼
Worker "formularios" (Cloudflare, dominio workers.dev al principio)
   1. Origen permitido (CORS)
   2. Campo trampa vacío y tiempo mínimo de relleno
   3. Turnstile válido (siteverify)
   4. Esquema del formulario válido
   5. Guarda copia en KV (caducidad 30 días) con estado "pendiente"
   6. Reenvía a Make con cabecera secreta (1 reintento)
   7. Marca "enviado" en KV
   │
   ▼
Make, un solo escenario para todos los formularios
   Webhook → filtro por cabecera secreta → router por "formulario"
      ├─ tarjeta:    Sheet "Tarjetas"    → email a info@ → confirmación al solicitante
      └─ automatiza: Sheet "Automatiza"  → email a info@ → confirmación + enlace a Cal.com
```

Si Make no responde, el envío no se pierde: queda en KV como "pendiente" y un Cron Trigger del Worker lo reintenta cada 15 minutos. Al usuario se le muestra el mensaje de éxito igualmente, porque sus datos están guardados.

**Por qué un solo escenario de Make:** el plan gratuito de Make permite 2 escenarios activos y 1.000 créditos al mes. Cada envío consume unos 4 créditos (webhook, fila, dos emails), así que caben unos 250 envíos al mes. `TODO(Pablo)`: confirmar en qué plan de Make estás.

## 4. Worker `formularios`

**Repo propio y privado** (`formularios-airesolutionlabs`), separado de la tarjeta, porque servirá a varias webs.

### 4.1 Endpoint

- `POST /v1/enviar` con `Content-Type: application/json`, cuerpo de 10 KB como máximo.
- `OPTIONS /v1/enviar` para el preflight de CORS.
- Cualquier otra ruta: 404.

### 4.2 Configuración

| Nombre | Tipo | Valor |
|---|---|---|
| `ALLOWED_ORIGINS` | variable | `https://founder.airesolutionlabs.com,https://www.airesolutionlabs.com` (en desarrollo se añade el origen local) |
| `TURNSTILE_SECRET` | secreto | clave secreta del widget de Turnstile |
| `MAKE_WEBHOOK_URL` | secreto | URL del webhook del escenario nuevo |
| `MAKE_SHARED_TOKEN` | secreto | cadena aleatoria larga; se envía en la cabecera `X-Formularios-Token` y Make la comprueba |
| `ENVIOS` | KV | copia de cada envío, con caducidad de 30 días |

Los secretos se cargan con `wrangler secret put`, nunca en el archivo de configuración.

### 4.3 Payload del navegador

```json
{
  "formulario": "tarjeta",
  "datos": { "nombre": "…", "negocio": "…" },
  "consentimientos": {
    "privacidad": true,
    "comunicaciones": false,
    "version_texto": "2026-09-25"
  },
  "turnstile": "<token>",
  "web_empresa": "",
  "t_inicio": 1727260000000
}
```

`web_empresa` es el campo trampa: oculto visualmente, con `tabindex="-1"` y `autocomplete="off"`. `t_inicio` es la hora a la que se cargó la página.

### 4.4 Validación (en este orden)

1. Origen fuera de `ALLOWED_ORIGINS` → 403.
2. `web_empresa` relleno o envío en menos de 3 segundos → responder 200 `{ok:true}` **sin guardar ni reenviar**, para que el bot no aprenda qué falló.
3. Turnstile: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` con `secret` y `response`. Si `success` es falso → 403 `{ok:false, error:"verificacion"}`. El token caduca a los 5 minutos y solo se puede validar una vez.
4. Esquema del formulario (apartado 5). Si falla → 400 `{ok:false, error:"validacion", campos:[…]}`.
5. `consentimientos.privacidad` distinto de `true` → 400.
6. Normalizar: recortar espacios, email en minúsculas, teléfono en formato internacional (`+34…` si no trae prefijo), Instagram sin `@` ni URL.

No guardar la IP ni el user agent. La IP solo se usa, si acaso, como `remoteip` en la llamada a Turnstile.

### 4.5 Payload hacia Make

```json
{
  "id": "uuid",
  "recibido": "2026-09-25T10:00:00Z",
  "formulario": "tarjeta",
  "origen": "https://founder.airesolutionlabs.com",
  "datos": { },
  "consentimientos": { "privacidad": true, "comunicaciones": false, "version_texto": "2026-09-25", "fecha": "2026-09-25T10:00:00Z" }
}
```

Guardar la versión del texto legal y la fecha sirve para poder demostrar el consentimiento (art. 7.1 RGPD).

### 4.6 Respuestas

| Caso | Código | Cuerpo |
|---|---|---|
| Correcto (Make respondió o quedó pendiente en KV) | 200 | `{ok:true, id}` |
| Validación | 400 | `{ok:false, error:"validacion", campos:[…]}` |
| Origen o Turnstile | 403 | `{ok:false, error:"verificacion"}` |
| Fallo interno sin poder guardar en KV | 500 | `{ok:false, error:"interno"}` |

### 4.7 Reintentos

- Reenvío a Make: 1 reintento inmediato con 1 segundo de espera.
- Cron Trigger cada 15 minutos: reenvía los registros "pendiente" de KV. Tras 5 intentos fallidos, marca "fallido" y deja de intentarlo (Pablo lo verá en el informe del apartado 8).
- Limitar peticiones por IP: opcional. Antes de usarlo, verifica en la documentación oficial de Cloudflare si el binding de rate limiting está disponible en el plan gratuito. No lo supongas.

### 4.8 Pruebas mínimas

Tests automáticos (Vitest con el entorno de Workers, o lo que recomiende la documentación actual de Cloudflare) para: origen no permitido, campo trampa, tiempo mínimo, Turnstile falso (mock), cada campo obligatorio de cada formulario, normalización de teléfono e Instagram, fallo de Make → queda pendiente, cron → reenvía.

## 5. Formularios

### 5.1 `/tarjeta/`: "Tu tarjeta de visita digital, gratis"

Subtítulo: "Te la preparo yo. Rellena esto y te escribo por WhatsApp para terminarla."

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | texto | sí | 2–80 caracteres, `autocomplete="name"` |
| `negocio` | texto | sí | 2–80 |
| `cargo` | texto | no | ≤ 60 |
| `sector` | select | sí | Salud y bienestar · Estética y belleza · Abogacía y asesoría · Inmobiliaria · Hostelería y restauración · Comercio · Formación · Deporte · Reformas y construcción · Otro |
| `whatsapp` | tel | sí | `inputmode="tel"`, `autocomplete="tel"`, 9–15 dígitos |
| `email` | email | sí | formato válido, `autocomplete="email"` |
| `instagram` | texto | no | acepta `@usuario` o URL |
| `web` | url | no | `https://` |
| `botones` | casillas | sí, al menos 1 | WhatsApp · Llamar · Email · Instagram · Web · Cómo llegar · Reservar cita |
| `mejorar` | casillas | no | "¿Qué más te gustaría mejorar en tu negocio?": Reservas online · Página web · Responder WhatsApp/Instagram automáticamente · Conseguir más clientes · Nada por ahora |

Éxito: "Recibido, {nombre}. Te escribo por WhatsApp en `TODO(Pablo): plazo` para pedirte la foto o el logo y terminar tu tarjeta."

### 5.2 `/automatiza/`: "Cuéntame qué quieres automatizar"

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | texto | sí | 2–80 |
| `empresa` | texto | sí | 2–80 |
| `sector` | select | sí | mismas opciones que 5.1 |
| `email` | email | sí | |
| `whatsapp` | tel | no | |
| `tamano` | select | sí | Solo yo · 2–5 personas · 6–20 · Más de 20 |
| `que` | casillas | sí, al menos 1 | Citas y reservas · Atención por WhatsApp o Instagram · Captación y seguimiento de clientes · Facturación y tareas administrativas · Informes y datos · Otra cosa |
| `descripcion` | área de texto | no | ≤ 1.000 caracteres, con contador |
| `contacto` | radio | sí | Email · WhatsApp · Llamada |

Éxito: "Recibido, {nombre}. Te respondo en `TODO(Pablo): plazo`. Si quieres adelantar, reserva ya 30 minutos:" + botón a Cal.com.

### 5.3 Común a los dos

- **Primera capa de información (encima del botón):** "Responsable: `TODO(Pablo): nombre completo del responsable` (AI Resolution Labs). Finalidad: responder a tu solicitud. Legitimación: tu consentimiento. Destinatarios: Cloudflare, Make y Google, que tratan los datos por encargo. Derechos: acceso, rectificación, supresión y los demás que reconoce el RGPD, en info@airesolutionlabs.com. Más información en la política de privacidad."
- Casilla obligatoria: "He leído la política de privacidad". Casilla opcional y separada: "Quiero recibir novedades y ofertas de AI Resolution Labs".
- Enlace a la política de privacidad: `TODO(Pablo)`. La de la web está incompleta (brief de la web, L4). **No publicar los formularios hasta que exista una política completa.**
- Etiquetas visibles, errores en línea con `aria-describedby` y resumen con `aria-live`. Se valida al salir de cada campo y al enviar.
- Botón con estados: normal, "Enviando…" (desactivado) y éxito. Si hay error, se conservan los datos escritos.
- Si falla el envío: "No se ha podido enviar. Escríbeme por WhatsApp o a info@airesolutionlabs.com", con los dos enlaces.
- Sin `alert()`. Sin dependencias de frameworks.
- Turnstile: el script `https://challenges.cloudflare.com/turnstile/v0/api.js` se carga solo en estas dos páginas. Modo gestionado, en español.
- Mismos tokens de diseño que la tarjeta (colores, tipografía local, radios). Extraer el CSS común a `styles.css` para no duplicarlo.
- Enlace "← Volver a la tarjeta".
- Metadatos propios por página (`title`, `description`, `og:*`) con URL absoluta.
- Service worker: las páginas de formulario siguen la estrategia network-first del HTML. Nunca cachear las peticiones POST.

## 6. Cambios en la tarjeta

- "Automatiza tu negocio" → `/automatiza/`
- "¿Quieres tu propia tarjeta?" → `/tarjeta/`
- Quitar cualquier referencia a Google Forms.
- Añadir los orígenes necesarios a la Content-Security-Policy, si existe (`challenges.cloudflare.com` y el dominio del Worker).

## 7. Escenario de Make (lo configura Pablo)

Nombre: **"Formularios AI Resolution Labs"**. Un solo escenario para todos los formularios.

1. **Webhooks → Custom webhook.** Activar "Get request headers".
2. **Filtro:** la cabecera `x-formularios-token` es igual al valor de `MAKE_SHARED_TOKEN`. Si no coincide, el escenario se detiene.
3. **Router** por `formulario`:
   - **tarjeta:** Google Sheets → Add a row (hoja "Tarjetas") → email a info@ con todos los datos → email de confirmación al solicitante.
   - **automatiza:** Google Sheets → Add a row (hoja "Automatiza") → email a info@ → email de confirmación con el enlace a Cal.com.
4. Los emails al solicitante se envían **desde info@airesolutionlabs.com**, no desde Gmail. `TODO(Pablo)`: qué proveedor aloja info@ (Google Workspace, Microsoft 365 u otro), para elegir el módulo de Make correcto.

**Columnas de la hoja** (las dos hojas comparten las comunes):
`fecha · id · formulario · nombre · negocio/empresa · sector · whatsapp · email · instagram · web · botones · mejorar · tamano · que · descripcion · contacto · comunicaciones · estado · notas`

`estado` (lista desplegable): Nuevo · Contactado · Tarjeta entregada · Propuesta enviada · Cliente · Descartado. Es la columna que mide la prueba comercial.

**Plantillas de email:** `TODO`. Se redactan en Cowork cuando esté el escenario.

## 8. Medición de la prueba comercial

La hoja "Tarjetas" es el registro de la prueba. Indicadores:

- Solicitudes recibidas por semana.
- Tarjetas entregadas.
- Conversaciones de venta abiertas (estado "Propuesta enviada").
- Ventas (estado "Cliente") y de qué servicio.

**Criterio para pasar al sistema semiautomático:** `TODO(Pablo)`. Propuesta de Claude (opinión, no dato): revisar al llegar a 20 tarjetas entregadas o a los 60 días, lo que ocurra antes. Si al menos 2 de esas tarjetas han acabado en una venta de pago, compensa construir el autoservicio.

## 9. Criterios de aceptación

- [ ] Un envío real de cada formulario crea la fila en su hoja, llega el email a info@ y el solicitante recibe la confirmación.
- [ ] Origen no permitido → 403. Turnstile inválido → 403. Campo trampa o menos de 3 s → 200 sin reenvío. Campo obligatorio vacío → 400 con la lista de campos.
- [ ] Con Make caído, el envío queda "pendiente" en KV y el cron lo reenvía cuando Make vuelve.
- [ ] `grep` en los dos repos: ninguna URL de `hook.*.make.com`, ninguna clave de Turnstile, ningún token.
- [ ] Lighthouse móvil ≥ 95 en Rendimiento, Accesibilidad, Buenas prácticas y SEO en `/tarjeta/` y `/automatiza/`.
- [ ] Formularios usables solo con teclado; errores anunciados por lector de pantalla.
- [ ] Tests del Worker en verde.

## 10. TODO(Pablo)

1. Crear la cuenta de Cloudflare (gratis).
2. En Cloudflare → Turnstile: crear un widget con los hostnames `founder.airesolutionlabs.com` y `www.airesolutionlabs.com`. Guardar la clave del sitio y la secreta.
3. Crear el escenario de Make del apartado 7 y la hoja de Google Sheets.
4. Proveedor de correo de info@airesolutionlabs.com.
5. Plazos de respuesta que aparecen en los mensajes de éxito.
6. Nombre del responsable del tratamiento y política de privacidad completa.
7. Plan de Make actual.
8. Criterio de la prueba (apartado 8).
9. Cuando la web use este Worker: regenerar el webhook antiguo de Make, que está publicado en `index.js`.

## 11. Fuentes

- Cloudflare Turnstile, validación en servidor: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare Workers, precios y límites del plan gratuito: https://developers.cloudflare.com/workers/platform/pricing/
- Make, precios: https://www.make.com/en/pricing
