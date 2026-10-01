/* Formularios de la tarjeta: validación, antispam (Cloudflare Turnstile) y envío al Apps Script.
   La validación de verdad la hace el servidor; esta es para ayudar a quien rellena. */
(function () {
    'use strict';

    var AJUSTES = {
        // URL de la aplicación web de Apps Script (Implementar → Gestionar implementaciones).
        ENDPOINT: 'https://script.google.com/macros/s/AKfycbzCgaigJtDxVea-eIOW5tq_OZKyM_AU4Bv7mUer4SZhgpuEOlUX0wJQLEbWa500PQMFIg/exec',
        // Clave del sitio de Turnstile (es pública). Clave de prueba: 1x00000000000000000000AA
        TURNSTILE_SITEKEY: '0x4AAAAAAFIFiqOfy6ts7wC6',
        VERSION_TEXTO_LEGAL: '2026-09-25',
        TIEMPO_MAXIMO_MS: 25000,
        EMAIL_CONTACTO: 'info@airesolutionlabs.com'
    };
    // Permite probar en local con ?endpoint=...&sitekey=... sin tocar el código publicado.
    var qs = new URLSearchParams(location.search);
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        if (qs.get('endpoint')) AJUSTES.ENDPOINT = qs.get('endpoint');
        if (qs.get('sitekey')) AJUSTES.TURNSTILE_SITEKEY = qs.get('sitekey');
    }

    var form = document.querySelector('form[data-formulario]');
    if (!form) return;
    var tipo = form.getAttribute('data-formulario');
    var tInicio = Date.now();

    var REGLAS = {
        tarjeta: {
            nombre: { obligatorio: true, min: 2, max: 80, msg: 'Escribe tu nombre (mínimo 2 letras).' },
            negocio: { obligatorio: true, min: 2, max: 80, msg: 'Escribe el nombre de tu negocio.' },
            cargo: { max: 60, msg: 'Máximo 60 caracteres.' },
            sector: { obligatorio: true, msg: 'Elige un sector.' },
            sector_otro: { obligatorio: true, min: 2, max: 60, soloSiOtro: true, msg: 'Escribe tu sector (mínimo 2 letras).' },
            whatsapp: { obligatorio: true, tipo: 'tel', msg: 'Escribe un número de WhatsApp válido, por ejemplo 600 123 456.' },
            email: { obligatorio: true, tipo: 'email', msg: 'Escribe un email válido.' },
            instagram: { tipo: 'instagram', msg: 'Escribe tu usuario de Instagram, por ejemplo @minegocio.' },
            web: { tipo: 'web', msg: 'Escribe una dirección web válida, por ejemplo minegocio.es.' },
            botones: { grupo: true, min: 1, msg: 'Elige al menos un botón.' },
            mejorar: { grupo: true }
        },
        automatiza: {
            nombre: { obligatorio: true, min: 2, max: 80, msg: 'Escribe tu nombre (mínimo 2 letras).' },
            empresa: { obligatorio: true, min: 2, max: 80, msg: 'Escribe el nombre de tu empresa.' },
            sector: { obligatorio: true, msg: 'Elige un sector.' },
            sector_otro: { obligatorio: true, min: 2, max: 60, soloSiOtro: true, msg: 'Escribe tu sector (mínimo 2 letras).' },
            email: { obligatorio: true, tipo: 'email', msg: 'Escribe un email válido.' },
            whatsapp: { tipo: 'tel', msg: 'Escribe un teléfono válido, por ejemplo 600 123 456.' },
            tamano: { obligatorio: true, msg: 'Elige el tamaño de tu equipo.' },
            que: { grupo: true, min: 1, msg: 'Elige al menos una opción.' },
            descripcion: { max: 1000, msg: 'Máximo 1.000 caracteres.' },
            contacto: { radio: true, obligatorio: true, msg: 'Elige cómo prefieres que te contacte.' }
        }
    }[tipo];

    var MSG_PRIVACIDAD = 'Tienes que aceptar la política de privacidad para enviar el formulario.';

    /* ---------- utilidades ---------- */
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
    function limpiar(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

    function valorCampo(nombre) {
        var r = REGLAS[nombre];
        if (r && r.grupo) return $all('input[name="' + nombre + '"]:checked', form).map(function (i) { return i.value; });
        if (r && r.radio) { var c = $('input[name="' + nombre + '"]:checked', form); return c ? c.value : ''; }
        if (r && r.soloSiOtro && valorCampo('sector') !== 'Otro') return '';
        var el = form.elements[nombre];
        return el ? limpiar(el.value) : '';
    }

    function comprobarTipo(tipoCampo, v) {
        if (tipoCampo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
        if (tipoCampo === 'tel') {
            var t = v.replace(/[\s().-]/g, '');
            if (t.indexOf('00') === 0) t = '+' + t.slice(2);
            return /^\+?\d{9,15}$/.test(t);
        }
        if (tipoCampo === 'instagram') {
            var u = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
            return /^[A-Za-z0-9._]{1,30}$/.test(u);
        }
        if (tipoCampo === 'web') {
            var w = /^https?:\/\//i.test(v) ? v : 'https://' + v;
            return w.length <= 200 && /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(w);
        }
        return true;
    }

    function error(nombre) {
        var r = REGLAS[nombre];
        if (!r) return '';
        if (r.soloSiOtro && valorCampo('sector') !== 'Otro') return '';
        var v = valorCampo(nombre);
        if (r.grupo) return v.length < (r.min || 0) ? r.msg : '';
        if (!v) {
            if (nombre === 'whatsapp' && tipo === 'automatiza' && valorCampo('contacto') && valorCampo('contacto') !== 'Email') {
                return 'Escribe un teléfono para poder contactarte por ' + valorCampo('contacto') + '.';
            }
            return r.obligatorio ? r.msg : '';
        }
        if (r.min && v.length < r.min) return r.msg;
        if (r.max && v.length > r.max) return r.msg;
        if (r.tipo && !comprobarTipo(r.tipo, v)) return r.msg;
        return '';
    }

    function contenedor(nombre) { return $('[data-campo="' + nombre + '"]', form); }

    function marcar(nombre, msg) {
        var cont = contenedor(nombre);
        if (!cont) return;
        var err = $('.error', cont);
        var objetivo = cont.tagName === 'FIELDSET' ? cont : $('input, select, textarea', cont);
        if (msg) {
            objetivo.setAttribute('aria-invalid', 'true');
            if (err) { err.textContent = msg; err.classList.add('visible'); }
        } else {
            objetivo.removeAttribute('aria-invalid');
            if (err) { err.textContent = ''; err.classList.remove('visible'); }
        }
    }

    function primerFoco(nombre) {
        var cont = contenedor(nombre);
        return cont ? $('input, select, textarea', cont) : null;
    }

    /* ---------- validación al salir del campo ---------- */
    var tocados = {};
    Object.keys(REGLAS).forEach(function (nombre) {
        var cont = contenedor(nombre);
        if (!cont) return;
        $all('input, select, textarea', cont).forEach(function (el) {
            el.addEventListener('blur', function () { tocados[nombre] = true; marcar(nombre, error(nombre)); });
            el.addEventListener('change', function () {
                if (tocados[nombre] || REGLAS[nombre].grupo || REGLAS[nombre].radio) marcar(nombre, error(nombre));
                if (nombre === 'contacto' && tocados.whatsapp) marcar('whatsapp', error('whatsapp'));
            });
            el.addEventListener('input', function () { if (tocados[nombre]) marcar(nombre, error(nombre)); });
        });
    });

    // "¿Cuál es tu sector?" solo aparece (y es obligatorio) si se elige "Otro"
    function actualizarSectorOtro() {
        var cont = contenedor('sector_otro');
        if (!cont) return;
        var mostrar = valorCampo('sector') === 'Otro';
        cont.hidden = !mostrar;
        if (!mostrar) { tocados.sector_otro = false; marcar('sector_otro', ''); }
    }
    if (form.elements.sector) form.elements.sector.addEventListener('change', actualizarSectorOtro);
    actualizarSectorOtro();

    // Contador de caracteres
    $all('textarea[maxlength]', form).forEach(function (ta) {
        var contador = document.getElementById(ta.getAttribute('aria-describedby').split(' ').filter(function (id) {
            return /-contador$/.test(id);
        })[0]);
        if (!contador) return;
        var actualizar = function () { contador.textContent = ta.value.length + ' / ' + ta.getAttribute('maxlength'); };
        ta.addEventListener('input', actualizar);
        actualizar();
    });

    /* ---------- Turnstile ---------- */
    var ts = { id: null, token: '', esperando: [], fallo: false };
    function resolverToken(tok) {
        ts.token = tok || '';
        var cola = ts.esperando; ts.esperando = [];
        cola.forEach(function (fn) { fn(ts.token); });
    }
    window.onTurnstileCargado = function () {
        try {
            ts.id = window.turnstile.render('#turnstile', {
                sitekey: AJUSTES.TURNSTILE_SITEKEY,
                theme: 'dark',
                language: 'es',
                appearance: 'interaction-only',
                callback: function (tok) { ts.fallo = false; resolverToken(tok); },
                'expired-callback': function () { ts.token = ''; },
                'error-callback': function () { ts.fallo = true; resolverToken(''); return true; }
            });
        } catch (e) {
            ts.fallo = true;
            resolverToken('');
        }
    };
    (function cargarTurnstile() {
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileCargado';
        s.async = true;
        s.defer = true;
        s.onerror = function () { ts.fallo = true; resolverToken(''); };
        document.head.appendChild(s);
    })();

    function obtenerToken(msMax) {
        if (ts.token) return Promise.resolve(ts.token);
        if (ts.fallo) return Promise.resolve('');
        return new Promise(function (resolve) {
            var hecho = false;
            ts.esperando.push(function (t) { if (!hecho) { hecho = true; resolve(t); } });
            setTimeout(function () { if (!hecho) { hecho = true; resolve(''); } }, msMax);
        });
    }

    function reiniciarTurnstile() {
        ts.token = '';
        if (window.turnstile && ts.id !== null) {
            try { window.turnstile.reset(ts.id); } catch (e) { /* sin efecto */ }
        }
    }

    /* ---------- envío ---------- */
    var boton = $('button[type="submit"]', form);
    var textoBoton = boton.textContent;
    var estado = $('#estado');
    var resumen = $('#resumen-errores');
    var alternativa = $('#alternativa');

    function mostrarResumen(lista) {
        if (!lista.length) { resumen.classList.remove('visible'); resumen.innerHTML = ''; return; }
        resumen.innerHTML = '<strong>Revisa ' + (lista.length === 1 ? 'este campo' : 'estos ' + lista.length + ' campos') + ':</strong><ul>' +
            lista.map(function (e) { return '<li><a href="#' + e.id + '">' + e.msg + '</a></li>'; }).join('') + '</ul>';
        resumen.classList.add('visible');
        resumen.focus();
    }

    function ocupado(si, texto) {
        boton.disabled = si;
        boton.textContent = si ? (texto || 'Enviando…') : textoBoton;
        form.setAttribute('aria-busy', si ? 'true' : 'false');
    }

    function mostrarAlternativa(motivo) {
        alternativa.innerHTML = motivo + ' Escríbeme a <a href="mailto:' + AJUSTES.EMAIL_CONTACTO + '">' +
            AJUSTES.EMAIL_CONTACTO + '</a> y lo vemos directamente.';
        alternativa.classList.add('visible');
    }

    function exito(datos) {
        var panel = $('#exito');
        $all('[data-nombre]', panel).forEach(function (n) { n.textContent = datos.nombre.split(' ')[0]; });
        form.hidden = true;
        var intro = $('#intro');
        if (intro) intro.hidden = true;
        panel.classList.add('visible');
        var h = $('h2', panel);
        h.setAttribute('tabindex', '-1');
        h.focus();
        window.scrollTo({ top: 0 });
    }

    form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        alternativa.classList.remove('visible');
        estado.textContent = '';

        var errores = [];
        Object.keys(REGLAS).forEach(function (nombre) {
            tocados[nombre] = true;
            var msg = error(nombre);
            marcar(nombre, msg);
            if (msg) { var f = primerFoco(nombre); errores.push({ id: f ? f.id : '', msg: msg }); }
        });
        var priv = form.elements.privacidad;
        if (!priv.checked) {
            errores.push({ id: priv.id, msg: MSG_PRIVACIDAD });
            priv.setAttribute('aria-invalid', 'true');
        } else {
            priv.removeAttribute('aria-invalid');
        }
        if (errores.length) { mostrarResumen(errores); return; }
        mostrarResumen([]);

        if (AJUSTES.ENDPOINT.indexOf('PENDIENTE') === 0 || AJUSTES.TURNSTILE_SITEKEY.indexOf('PENDIENTE') === 0) {
            mostrarAlternativa('El formulario todavía no está conectado.');
            return;
        }

        ocupado(true, 'Comprobando…');
        obtenerToken(12000).then(function (token) {
            if (!token) {
                ocupado(false);
                mostrarAlternativa('No se ha podido completar la verificación antispam (puede que un bloqueador la esté impidiendo).');
                return null;
            }
            ocupado(true, 'Enviando…');
            // Apps Script tarda unos segundos en responder: se avisa para que nadie pulse dos veces
            var aviso = setTimeout(function () { estado.textContent = 'Un momento, lo estoy registrando…'; }, 3000);
            var datos = {};
            Object.keys(REGLAS).forEach(function (n) { datos[n] = valorCampo(n); });
            var cuerpo = {
                formulario: tipo,
                datos: datos,
                consentimientos: {
                    privacidad: true,
                    comunicaciones: !!(form.elements.comunicaciones && form.elements.comunicaciones.checked),
                    version_texto: AJUSTES.VERSION_TEXTO_LEGAL
                },
                turnstile: token,
                web_empresa: form.elements.web_empresa ? form.elements.web_empresa.value : '',
                t_relleno: Date.now() - tInicio,
                referido: qs.get('ref') || ''
            };
            var ctrl = 'AbortController' in window ? new AbortController() : null;
            var temporizador = setTimeout(function () { if (ctrl) ctrl.abort(); }, AJUSTES.TIEMPO_MAXIMO_MS);
            return fetch(AJUSTES.ENDPOINT, {
                method: 'POST',
                // text/plain evita la petición previa de CORS que Apps Script no admite
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(cuerpo),
                redirect: 'follow',
                signal: ctrl ? ctrl.signal : undefined
            }).then(function (res) {
                clearTimeout(temporizador);
                clearTimeout(aviso);
                estado.textContent = '';
                return res.json();
            }).then(function (r) {
                if (r && r.ok) { exito(datos); return; }
                ocupado(false);
                reiniciarTurnstile();
                if (r && r.error === 'validacion' && r.campos) {
                    var lista = r.campos.map(function (c) {
                        if (c === 'privacidad') return { id: 'privacidad', msg: MSG_PRIVACIDAD };
                        var msg = (REGLAS[c] && REGLAS[c].msg) || 'Revisa este campo.';
                        marcar(c, msg);
                        var f = primerFoco(c);
                        return { id: f ? f.id : '', msg: msg };
                    });
                    mostrarResumen(lista);
                } else if (r && r.error === 'limite') {
                    mostrarAlternativa('Has enviado varias solicitudes seguidas. Espera un rato antes de volver a intentarlo.');
                } else if (r && r.error === 'verificacion') {
                    estado.textContent = 'No se ha podido verificar el envío. Vuelve a pulsar el botón.';
                } else {
                    mostrarAlternativa('No se ha podido enviar el formulario.');
                }
            });
        }).catch(function () {
            estado.textContent = '';
            ocupado(false);
            reiniciarTurnstile();
            mostrarAlternativa('No se ha podido enviar el formulario por un problema de conexión.');
        });
    });
})();
