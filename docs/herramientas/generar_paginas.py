# OBSOLETO desde el rediseño AIR (06/10/2026): genera el diseño antiguo, no usar
"""Genera tarjeta/, automatiza/ y privacidad/ con la misma cabecera. Ejecutar: python3 generar_paginas.py"""
from pathlib import Path
from html import escape

BASE = "https://founder.airesolutionlabs.com"
OUT = Path(__file__).parent / "web"
V = "3"  # sube este número si cambias formularios.css o formularios.js

SECTORES = ["Salud y bienestar", "Estética y belleza", "Abogacía y asesoría", "Inmobiliaria",
            "Hostelería y restauración", "Comercio", "Formación", "Deporte", "Reformas y construcción", "Otro"]
BOTONES = ["WhatsApp", "Llamar", "Email", "Instagram", "Web", "Cómo llegar", "Reservar cita"]
MEJORAR = ["Reservas online", "Página web", "Responder WhatsApp/Instagram automáticamente",
           "Conseguir más clientes", "Nada por ahora"]
TAMANO = ["Solo yo", "2–5 personas", "6–20", "Más de 20"]
QUE = ["Citas y reservas", "Atención por WhatsApp o Instagram", "Captación y seguimiento de clientes",
       "Facturación y tareas administrativas", "Informes y datos", "Otra cosa"]
CONTACTO = ["Email", "WhatsApp", "Llamada"]

ICON_BACK = ('<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')
ICON_OK = ('<svg aria-hidden="true" focusable="false" width="26" height="26" viewBox="0 0 24 24" fill="none" '
           'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>')
NUEVA = '<span class="sr-only">(se abre en una pestaña nueva)</span>'


def head(ruta, titulo, descripcion, con_js=True, indexar=True):
    url = f"{BASE}/{ruta}/"
    t, d = escape(titulo), escape(descripcion)
    robots = "" if indexar else '\n    <meta name="robots" content="noindex">'
    js = f'\n    <script src="../assets/formularios.js?v={V}" defer></script>' if con_js else ""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{t}</title>
    <meta name="description" content="{d}">
    <link rel="canonical" href="{url}">{robots}
    <meta property="og:type" content="website">
    <meta property="og:url" content="{url}">
    <meta property="og:site_name" content="AI Resolution Labs">
    <meta property="og:locale" content="es_ES">
    <meta property="og:title" content="{t}">
    <meta property="og:description" content="{d}">
    <meta property="og:image" content="{BASE}/img/og-image.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{t}">
    <meta name="twitter:description" content="{d}">
    <meta name="twitter:image" content="{BASE}/img/og-image.jpg">
    <link rel="icon" type="image/png" sizes="32x32" href="../img/favicon-32.png">
    <link rel="apple-touch-icon" href="../img/apple-touch-icon.png">
    <meta name="theme-color" content="#030712">
    <link rel="preload" href="../fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="../fonts/outfit-600.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="../assets/formularios.css?v={V}">{js}
</head>
<body>
    <main class="card">
        <a class="back" href="../">{ICON_BACK} Volver a la tarjeta</a>
"""


AUTOR = """            <div class="author">
                <img src="../img/perfil-240.webp" width="44" height="44" alt="">
                <div>
                    <div class="author-name">Pablo Ortega Insúa</div>
                    <div class="author-role">AI Resolution Labs</div>
                </div>
            </div>
"""

FIN = """    </main>
</body>
</html>
"""


def texto(nombre, etiqueta, tipo="text", obligatorio=True, auto=None, extra="", placeholder="", hint=""):
    opc = "" if obligatorio else ' <span class="optional">(opcional)</span>'
    desc = f"{nombre}-hint {nombre}-error" if hint else f"{nombre}-error"
    attrs = [f'type="{tipo}"', f'id="{nombre}"', f'name="{nombre}"', f'aria-describedby="{desc}"']
    if auto:
        attrs.append(f'autocomplete="{auto}"')
    if placeholder:
        attrs.append(f'placeholder="{escape(placeholder)}"')
    if obligatorio:
        attrs.append('aria-required="true"')
    if extra:
        attrs.append(extra)
    h = f'\n                <p class="hint" id="{nombre}-hint">{hint}</p>' if hint else ""
    return f"""            <div class="field" data-campo="{nombre}">
                <label class="label" for="{nombre}">{etiqueta}{opc}</label>{h}
                <input {' '.join(attrs)}>
                <p class="error" id="{nombre}-error"></p>
            </div>
"""


# Campo que solo se muestra (y se exige) si el sector elegido es "Otro"; lo gestiona formularios.js
SECTOR_OTRO = """            <div class="field" data-campo="sector_otro" hidden>
                <label class="label" for="sector_otro">¿Cuál es tu sector?</label>
                <input type="text" id="sector_otro" name="sector_otro" aria-describedby="sector_otro-error" aria-required="true" maxlength="60" placeholder="Ej.: fotografía, veterinaria, jardinería">
                <p class="error" id="sector_otro-error"></p>
            </div>
"""


def seleccion(nombre, etiqueta, opciones, vacio):
    ops = "\n".join(f'                    <option value="{escape(o)}">{escape(o)}</option>' for o in opciones)
    return f"""            <div class="field" data-campo="{nombre}">
                <label class="label" for="{nombre}">{etiqueta}</label>
                <select id="{nombre}" name="{nombre}" aria-describedby="{nombre}-error" aria-required="true">
                    <option value="">{vacio}</option>
{ops}
                </select>
                <p class="error" id="{nombre}-error"></p>
            </div>
"""


def grupo(nombre, etiqueta, opciones, hint="", tipo="checkbox", marcadas=(), obligatorio=False):
    opc = "" if obligatorio else ' <span class="optional">(opcional)</span>'
    chips = "\n".join(
        f'                    <label class="chip"><input type="{tipo}" id="{nombre}-{i}" name="{nombre}" value="{escape(o)}"'
        f'{" checked" if o in marcadas else ""}><span>{escape(o)}</span></label>'
        for i, o in enumerate(opciones, start=1))
    desc = f"{nombre}-hint {nombre}-error" if hint else f"{nombre}-error"
    h = f'\n                <p class="hint" id="{nombre}-hint">{hint}</p>' if hint else ""
    return f"""            <fieldset class="field" data-campo="{nombre}" aria-describedby="{desc}">
                <legend class="label">{etiqueta}{opc}</legend>{h}
                <div class="chips">
{chips}
                </div>
                <p class="error" id="{nombre}-error"></p>
            </fieldset>
"""


def legal(finalidad):
    return f"""            <div class="legal">
                <strong>Responsable:</strong> Pablo Ortega Insúa (AI Resolution Labs).
                <strong>Finalidad:</strong> {finalidad}
                <strong>Legitimación:</strong> tu propia solicitud y, si marcas la casilla de ofertas, tu consentimiento.
                <strong>Destinatarios:</strong> Google y Cloudflare, que tratan los datos por encargo; no se ceden a nadie más.
                <strong>Derechos:</strong> acceso, rectificación, supresión y los demás que reconoce el RGPD, en
                <a href="mailto:info@airesolutionlabs.com">info@airesolutionlabs.com</a>.
                Más información en la <a href="../privacidad/" target="_blank" rel="noopener">política de privacidad{NUEVA}</a>.
            </div>
            <label class="check" for="privacidad">
                <input type="checkbox" id="privacidad" name="privacidad" aria-required="true">
                <span>He leído la política de privacidad.</span>
            </label>
            <label class="check" for="comunicaciones">
                <input type="checkbox" id="comunicaciones" name="comunicaciones">
                <span>Quiero recibir novedades y ofertas de AI Resolution Labs (opcional).</span>
            </label>
"""


TRAMPA = """            <div class="hp" aria-hidden="true">
                <label for="web_empresa">No rellenes este campo</label>
                <input type="text" id="web_empresa" name="web_empresa" tabindex="-1" autocomplete="off">
            </div>
"""


def envio(texto_boton, clase):
    return f"""            <div id="turnstile" class="ts"></div>
            <button type="submit" class="submit {clase}">{texto_boton}</button>
            <p id="estado" class="status" role="status" aria-live="polite"></p>
            <div id="alternativa" class="fallback" role="alert"></div>
        </form>
"""


def pagina_tarjeta():
    h = head("tarjeta", "Tu tarjeta de visita digital, gratis | AI Resolution Labs",
             "Pide tu tarjeta de visita digital gratis: botones de WhatsApp, llamada, reservas y redes, "
             "con guardar contacto y QR. Te la preparo yo.")
    cuerpo = f"""        <div id="intro">
{AUTOR}            <span class="badge">Gratis</span>
            <h1>Tu tarjeta de visita digital</h1>
            <p class="lead">Te la preparo yo. Rellena esto y te escribo por WhatsApp para pedirte la foto o el logo y terminarla.</p>
        </div>
        <form data-formulario="tarjeta" novalidate>
            <div id="resumen-errores" class="summary" tabindex="-1" role="alert"></div>
{texto("nombre", "Nombre y apellidos", auto="name", extra='maxlength="80"')}{texto("negocio", "Nombre de tu negocio", auto="organization", extra='maxlength="80"')}{texto("cargo", "Cargo o profesión", obligatorio=False, auto="organization-title", extra='maxlength="60"', placeholder="Ej.: fisioterapeuta, abogada, gerente")}{seleccion("sector", "Sector", SECTORES, "Elige tu sector")}{SECTOR_OTRO}{texto("whatsapp", "WhatsApp", tipo="tel", auto="tel", extra='inputmode="tel" maxlength="20"', placeholder="600 123 456", hint="Te escribiré aquí para terminar tu tarjeta.")}{texto("email", "Email", tipo="email", auto="email", extra='maxlength="254" autocapitalize="off" spellcheck="false"')}{texto("instagram", "Instagram del negocio", obligatorio=False, extra='maxlength="60" autocapitalize="off" spellcheck="false"', placeholder="@minegocio")}{texto("web", "Página web", tipo="url", obligatorio=False, auto="url", extra='inputmode="url" maxlength="200" autocapitalize="off" spellcheck="false"', placeholder="minegocio.es")}{grupo("botones", "¿Qué botones quieres en tu tarjeta?", BOTONES, hint="Elige al menos uno. Después podemos cambiarlos.", marcadas=("WhatsApp",), obligatorio=True)}{grupo("mejorar", "¿Qué más te gustaría mejorar en tu negocio?", MEJORAR)}{TRAMPA}{legal("preparar tu tarjeta y contactarte por WhatsApp o email para terminarla.")}{envio("Pedir mi tarjeta gratis", "amber")}        <section id="exito" class="success" aria-labelledby="exito-titulo">
            <div class="success-icon">{ICON_OK}</div>
            <h2 id="exito-titulo">Recibido, <span data-nombre></span></h2>
            <p>Te escribo por WhatsApp en las próximas 48 horas para pedirte la foto o el logo y terminar tu tarjeta.
               También te he enviado un email de confirmación.</p>
            <a class="link-muted" href="../">Volver a la tarjeta</a>
        </section>
"""
    return h + cuerpo + FIN


def pagina_automatiza():
    h = head("automatiza", "Cuéntame qué quieres automatizar | AI Resolution Labs",
             "Cuéntame qué tareas te quitan tiempo en tu negocio y te propongo cómo automatizarlas con IA y herramientas No-Code.")
    cuerpo = f"""        <div id="intro">
{AUTOR}            <span class="badge blue">Automatiza tu negocio</span>
            <h1>Cuéntame qué quieres automatizar</h1>
            <p class="lead">Con esto preparo la primera conversación. Te respondo yo, sin compromiso.</p>
        </div>
        <form data-formulario="automatiza" novalidate>
            <div id="resumen-errores" class="summary" tabindex="-1" role="alert"></div>
{texto("nombre", "Nombre y apellidos", auto="name", extra='maxlength="80"')}{texto("empresa", "Empresa", auto="organization", extra='maxlength="80"')}{seleccion("sector", "Sector", SECTORES, "Elige tu sector")}{SECTOR_OTRO}{texto("email", "Email", tipo="email", auto="email", extra='maxlength="254" autocapitalize="off" spellcheck="false"')}{texto("whatsapp", "Teléfono o WhatsApp", tipo="tel", obligatorio=False, auto="tel", extra='inputmode="tel" maxlength="20"', placeholder="600 123 456")}{seleccion("tamano", "¿Cuántas personas sois?", TAMANO, "Elige una opción")}{grupo("que", "¿Qué te gustaría automatizar?", QUE, hint="Puedes elegir varias.", obligatorio=True)}            <div class="field" data-campo="descripcion">
                <label class="label" for="descripcion">Cuéntame un poco más <span class="optional">(opcional)</span></label>
                <p class="hint" id="descripcion-hint">Qué tarea te quita más tiempo y qué herramientas usáis (WhatsApp, Gmail, Excel, un programa de gestión…).</p>
                <textarea id="descripcion" name="descripcion" maxlength="1000" aria-describedby="descripcion-hint descripcion-contador descripcion-error"></textarea>
                <p class="counter" id="descripcion-contador" aria-live="off"></p>
                <p class="error" id="descripcion-error"></p>
            </div>
{grupo("contacto", "¿Cómo prefieres que te contacte?", CONTACTO, tipo="radio", marcadas=("Email",), obligatorio=True)}{TRAMPA}{legal("responder a tu consulta y, si lo pides, prepararte una propuesta.")}{envio("Enviar consulta", "")}        <section id="exito" class="success" aria-labelledby="exito-titulo">
            <div class="success-icon">{ICON_OK}</div>
            <h2 id="exito-titulo">Recibido, <span data-nombre></span></h2>
            <p>Te respondo en las próximas 48 horas. Si quieres adelantarlo, reserva una videollamada conmigo:</p>
            <a class="button-link" href="https://cal.com/pablo-ortega-insua-wdoysa" target="_blank" rel="noopener noreferrer">Reservar videollamada{NUEVA}</a>
            <br>
            <a class="link-muted" href="../">Volver a la tarjeta</a>
        </section>
"""
    return h + cuerpo + FIN


def pagina_privacidad():
    h = head("privacidad", "Política de privacidad | AI Resolution Labs",
             "Cómo trato los datos que envías en los formularios de founder.airesolutionlabs.com.", con_js=False)
    cuerpo = """        <article class="prose">
            <h1>Política de privacidad</h1>
            <p class="lead">Formularios de founder.airesolutionlabs.com. Versión del 25 de septiembre de 2026.</p>

            <h2>Quién trata tus datos</h2>
            <p>Pablo Ortega Insúa, que trabaja con la marca AI Resolution Labs. Contacto:
               <a href="mailto:info@airesolutionlabs.com">info@airesolutionlabs.com</a>.</p>

            <h2>Qué datos trato y para qué</h2>
            <table>
                <tr><th>Formulario</th><th>Datos</th><th>Para qué</th></tr>
                <tr><td>Tu tarjeta digital</td><td>Nombre, negocio, cargo, sector, WhatsApp, email, Instagram, web y preferencias sobre la tarjeta.</td><td>Preparar tu tarjeta y contactarte por WhatsApp o email para terminarla.</td></tr>
                <tr><td>Automatiza tu negocio</td><td>Nombre, empresa, sector, email, teléfono (opcional), tamaño del equipo, necesidades, descripción y forma de contacto.</td><td>Responder a tu consulta y, si lo pides, prepararte una propuesta.</td></tr>
            </table>
            <p>Si marcas la casilla de ofertas, también usaré tu email para enviarte novedades y ofertas de AI Resolution Labs.
               Puedes darte de baja en cualquier momento respondiendo a cualquier correo o escribiendo a info@airesolutionlabs.com.</p>
            <p>Para frenar el spam, el formulario usa Cloudflare Turnstile, que analiza datos técnicos de tu navegador y tu dirección IP
               con el único fin de distinguir personas de programas automáticos.</p>

            <h2>Base legal</h2>
            <ul>
                <li><strong>Atender tu solicitud:</strong> la aplicación de medidas precontractuales a petición tuya (art. 6.1.b del RGPD).</li>
                <li><strong>Enviarte ofertas:</strong> tu consentimiento (art. 6.1.a del RGPD), que puedes retirar cuando quieras.</li>
                <li><strong>Antispam:</strong> el interés legítimo en proteger el formulario frente a abusos (art. 6.1.f del RGPD).</li>
            </ul>
            <p>Los campos marcados como obligatorios son necesarios para atender tu solicitud. No tomo decisiones automatizadas sobre ti.</p>

            <h2>Cuánto tiempo los guardo</h2>
            <p>Mientras gestiono tu solicitud. Si no llegamos a trabajar juntos, los borro como máximo 12 meses después del último contacto.
               Si llegamos a un acuerdo, los guardo durante la relación y los plazos que exija la ley.
               Los datos para enviarte ofertas, hasta que retires el consentimiento.</p>

            <h2>Quién más accede</h2>
            <p>No cedo tus datos a nadie. Los tratan, por encargo y solo para prestarme su servicio:</p>
            <ul>
                <li><strong>Google</strong> (Gmail y Google Sheets): donde recibo y guardo las solicitudes.</li>
                <li><strong>Cloudflare</strong> (Turnstile): verificación antispam.</li>
                <li><strong>GitHub</strong> (GitHub Pages): alojamiento de esta web, que registra datos técnicos de las visitas.</li>
            </ul>
            <p>Son empresas de Estados Unidos. Las transferencias se amparan en el Marco de Privacidad de Datos UE-EE. UU.
               (decisión de adecuación de la Comisión Europea de 10 de julio de 2023) o en las cláusulas contractuales tipo aprobadas por la Comisión.</p>

            <h2>Tus derechos</h2>
            <p>Puedes pedir acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad de tus datos,
               y retirar tu consentimiento, escribiendo a <a href="mailto:info@airesolutionlabs.com">info@airesolutionlabs.com</a>.
               Si crees que no he atendido bien tu petición, puedes reclamar ante la
               <a href="https://www.aepd.es/" target="_blank" rel="noopener noreferrer">Agencia Española de Protección de Datos<span class="sr-only"> (se abre en una pestaña nueva)</span></a>.</p>
        </article>
"""
    return h + cuerpo + FIN


for ruta, contenido in (("tarjeta", pagina_tarjeta()), ("automatiza", pagina_automatiza()), ("privacidad", pagina_privacidad())):
    p = OUT / ruta / "index.html"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(contenido, encoding="utf-8")
    print("escrito", p)
