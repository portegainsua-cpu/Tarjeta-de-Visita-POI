// Pruebas del Apps Script con servicios de Google simulados. Ejecutar: node test.js
// Usa Code.gs de esta carpeta si existe; si no, el de docs/apps-script/.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function crearEntorno(opts = {}) {
  const filas = [];
  let cabeceras = null;
  const enviados = [];
  const cache = {};
  const logs = [];
  const llamadas = { alias: 0 };
  const props = Object.assign({ TURNSTILE_SECRET: 'secreto', TEST_MODE: 'false' }, opts.props || {});
  const hoja = {
    getLastColumn: () => (cabeceras ? cabeceras.length : 0),
    getLastRow: () => filas.length + 1,
    getRange: (r, c, nr, nc) => ({
      getValues: () => [cabeceras.slice(c - 1, c - 1 + nc)],
      setValue: (v) => { filas[r - 2][c - 1] = v; },
    }),
    appendRow: (fila) => filas.push(fila),
  };
  const ctx = {
    console: { log: (s) => logs.push(s), error: () => {} },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: {
      fetch: (url, o) => ({
        getContentText: () => JSON.stringify(
          opts.turnstile || { success: o.payload.response === 'ok-token', hostname: 'founder.airesolutionlabs.com' }),
      }),
    },
    CacheService: { getScriptCache: () => ({
      get: (k) => cache[k], put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    Utilities: {
      getUuid: () => 'abcdef12-3456',
      base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64'),
      // Solo el formato 'H' (hora 0-23), que es el que usa el script
      formatDate: (d, zona, formato) => {
        assert.strictEqual(formato, 'H');
        return String(Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hourCycle: 'h23', timeZone: zona }).format(d)));
      },
    },
    LockService: { getScriptLock: () => ({
      waitLock: () => {}, tryLock: () => !opts.bloqueoOcupado, releaseLock: () => {} }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => hoja, getUrl: () => 'https://sheet' }),
    },
    MailApp: { getRemainingDailyQuota: () => (opts.cuota == null ? 100 : opts.cuota) },
    GmailApp: {
      getAliases: () => { llamadas.alias++; return opts.alias === false ? [] : ['info@airesolutionlabs.com']; },
      sendEmail: (to, asunto, texto, o) => {
        if (opts.fallaCorreo) throw new Error('fallo');
        enviados.push({ to, asunto, texto, o });
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'cuenta@gmail.com' }) },
  };
  vm.createContext(ctx);
  const local = __dirname + '/Code.gs';
  const ruta = fs.existsSync(local) ? local : __dirname + '/../apps-script/Code.gs';
  vm.runInContext(fs.readFileSync(ruta, 'utf8'), ctx);
  cabeceras = vm.runInContext('CABECERAS', ctx).slice();
  return { ctx, filas, enviados, cabeceras, cache, logs, llamadas };
}

function post(env, cuerpo) {
  return env.ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).body;
}

const tarjetaOk = () => ({
  formulario: 'tarjeta',
  datos: {
    nombre: ' Lucía  Pérez ', negocio: 'Clínica Sol', cargo: 'Fisioterapeuta', sector: 'Salud y bienestar',
    whatsapp: '600 123 456', email: 'Lucia@Ejemplo.com', instagram: 'https://www.instagram.com/clinicasol/',
    web: 'clinicasol.es', botones: ['WhatsApp', 'Reservar cita'], mejorar: ['Reservas online'],
  },
  consentimientos: { privacidad: true, comunicaciones: false, version_texto: '2026-09-25' },
  turnstile: 'ok-token', web_empresa: '', t_relleno: 8000, referido: 'irene-ortega',
});

const automatizaOk = () => ({
  formulario: 'automatiza',
  datos: {
    nombre: 'Martín', empresa: 'El garbanzo', sector: 'Hostelería y restauración', email: 'm@e.es',
    whatsapp: '', tamano: '2–5 personas', que: ['Citas y reservas'], descripcion: '=HYPERLINK("x")', contacto: 'Email',
  },
  consentimientos: { privacidad: true, comunicaciones: true, version_texto: '2026-09-25' },
  turnstile: 'ok-token', web_empresa: '', t_relleno: 5000,
});

let n = 0;
function prueba(nombre, fn) { fn(); n++; console.log('✓', nombre); }

prueba('tarjeta válida: guarda, normaliza y envía dos correos', () => {
  const env = crearEntorno();
  const r = post(env, tarjetaOk());
  assert.deepStrictEqual(r, { ok: true, id: 'abcdef12' });
  assert.strictEqual(env.filas.length, 1);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Nombre'], 'Lucía Pérez');
  assert.strictEqual(f['Email'], 'lucia@ejemplo.com');
  assert.strictEqual(f['WhatsApp'], "'+34600123456");
  assert.strictEqual(f['Instagram'], 'clinicasol');
  assert.strictEqual(f['Web'], 'https://clinicasol.es');
  assert.strictEqual(f['Formulario'], 'Tarjeta');
  assert.strictEqual(f['Estado'], 'Nuevo');
  assert.strictEqual(f['Referido'], 'irene-ortega');
  assert.strictEqual(f['Confirmación'], 'Enviada desde info@airesolutionlabs.com');
  assert.strictEqual(env.enviados.length, 2);
  assert.strictEqual(env.enviados[0].to, 'cuenta@gmail.com');
  assert.strictEqual(env.enviados[0].o.replyTo, 'lucia@ejemplo.com');
  assert.strictEqual(env.enviados[1].to, 'lucia@ejemplo.com');
  assert.strictEqual(env.enviados[1].o.from, 'info@airesolutionlabs.com');
  assert.ok(env.enviados[1].texto.includes('+34600123456'));
  assert.ok(env.enviados[0].o.htmlBody.includes('https://wa.me/34600123456'));
});

prueba('automatiza válida: neutraliza fórmulas y ofrece Cal.com', () => {
  const env = crearEntorno();
  const r = post(env, automatizaOk());
  assert.strictEqual(r.ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Descripción'], '\'=HYPERLINK("x")');
  assert.strictEqual(f['Acepta comunicaciones'], 'Sí');
  assert.ok(env.enviados[1].texto.includes('cal.com'));
  // Compromiso de plazo en la confirmación
  assert.ok(env.enviados[1].texto.includes(
    'He recibido su consulta sobre citas y reservas y le responderé lo antes posible, como máximo en 72 horas.'));
  assert.ok(env.enviados[1].o.htmlBody.includes('como máximo en 72 horas.'));
  assert.ok(!env.enviados[1].texto.includes('próximas'));
});

prueba('campo trampa relleno: responde ok sin guardar ni enviar', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.web_empresa = 'spam';
  assert.deepStrictEqual(post(env, e), { ok: true, id: 'ok' });
  assert.strictEqual(env.filas.length, 0);
  assert.strictEqual(env.enviados.length, 0);
});

prueba('relleno demasiado rápido: igual que el campo trampa', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.t_relleno = 900;
  assert.deepStrictEqual(post(env, e), { ok: true, id: 'ok' });
  assert.strictEqual(env.filas.length, 0);
});

prueba('Turnstile inválido: 403 lógico', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.turnstile = 'malo';
  assert.deepStrictEqual(post(env, e), { ok: false, error: 'verificacion' });
  assert.strictEqual(env.filas.length, 0);
});

prueba('Turnstile de otro dominio: rechazado', () => {
  const env = crearEntorno({ turnstile: { success: true, hostname: 'evil.com' } });
  assert.deepStrictEqual(post(env, tarjetaOk()), { ok: false, error: 'verificacion' });
});

prueba('modo prueba: acepta el token de prueba y marca PRUEBA', () => {
  const env = crearEntorno({ props: { TEST_MODE: 'true' }, turnstile: { success: true, hostname: 'example.com' } });
  const e = tarjetaOk(); e.turnstile = 'XXXX.DUMMY.TOKEN.XXXX';
  assert.strictEqual(post(env, e).ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Notas'], 'PRUEBA');
  assert.ok(env.enviados[0].asunto.startsWith('[PRUEBA]'));
});

prueba('sin TURNSTILE_SECRET: rechaza', () => {
  const env = crearEntorno({ props: { TURNSTILE_SECRET: '' } });
  assert.deepStrictEqual(post(env, tarjetaOk()), { ok: false, error: 'verificacion' });
});

prueba('campos obligatorios vacíos y valores fuera de lista', () => {
  const env = crearEntorno();
  const e = tarjetaOk();
  e.datos.nombre = ''; e.datos.whatsapp = '12'; e.datos.botones = []; e.datos.sector = 'Inventado';
  e.consentimientos.privacidad = false;
  const r = post(env, e);
  assert.strictEqual(r.error, 'validacion');
  for (const c of ['nombre', 'whatsapp', 'botones', 'sector', 'privacidad']) assert.ok(r.campos.includes(c), c);
  assert.strictEqual(env.filas.length, 0);
});

prueba('sector "Otro": guarda el sector escrito y lo exige', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.datos.sector = 'Otro'; e.datos.sector_otro = '  Fotografía   de bodas ';
  assert.strictEqual(post(env, e).ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Sector'], 'Otro: Fotografía de bodas');
  assert.ok(env.enviados[0].texto.includes('Otro: Fotografía de bodas'));

  const sinTexto = tarjetaOk(); sinTexto.datos.sector = 'Otro'; sinTexto.datos.email = 'otra@ejemplo.com';
  assert.deepStrictEqual(post(env, sinTexto).campos, ['sector_otro']);

  const a = automatizaOk(); a.datos.sector = 'Otro'; a.datos.sector_otro = 'X';
  assert.deepStrictEqual(post(env, a).campos, ['sector_otro']);
});

prueba('sector de la lista: ignora el texto de "Otro"', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.datos.sector_otro = 'lo que sea';
  assert.strictEqual(post(env, e).ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Sector'], 'Salud y bienestar');
});

prueba('automatiza: pide WhatsApp si el contacto preferido no es email', () => {
  const env = crearEntorno();
  const e = automatizaOk(); e.datos.contacto = 'WhatsApp';
  const r = post(env, e);
  assert.deepStrictEqual(r.campos, ['whatsapp']);
});

const contactoOk = () => ({
  formulario: 'contacto',
  datos: { nombre: ' Marta  Ruiz ', email: 'Marta@Ejemplo.com', mensaje: 'Hola:\r\n\r\n\r\n\r\nQuiero  automatizar las citas.\nPeluquería Marta' },
  consentimientos: { privacidad: true, comunicaciones: false, version_texto: '2026-09-25' },
  turnstile: 'ok-token', web_empresa: '', t_relleno: 6000,
});
const deLaWeb = { turnstile: { success: true, hostname: 'www.airesolutionlabs.com' } };
const filaDe = (env, i = 0) => Object.fromEntries(env.cabeceras.map((h, j) => [h, env.filas[i][j]]));

prueba('contacto válido desde la web: guarda en Solicitudes y envía aviso y confirmación', () => {
  const env = crearEntorno(deLaWeb);
  assert.deepStrictEqual(post(env, contactoOk()), { ok: true, id: 'abcdef12' });
  const f = filaDe(env);
  assert.strictEqual(f['Formulario'], 'Contacto');
  assert.strictEqual(f['Estado'], 'Nuevo');
  assert.strictEqual(f['Nombre'], 'Marta Ruiz');
  assert.strictEqual(f['Email'], 'marta@ejemplo.com');
  assert.strictEqual(f['Descripción'], 'Hola:\n\nQuiero automatizar las citas.\nPeluquería Marta');
  for (const h of ['Sector', 'Negocio / Empresa', 'WhatsApp']) assert.strictEqual(f[h], '', h);

  assert.strictEqual(env.enviados.length, 2);
  const [aviso, conf] = env.enviados;
  assert.strictEqual(aviso.to, 'cuenta@gmail.com');
  assert.strictEqual(aviso.asunto, '[Contacto web] Marta Ruiz');
  assert.strictEqual(aviso.o.replyTo, 'marta@ejemplo.com');
  assert.ok(aviso.texto.includes('Mensaje: Hola:\n\nQuiero automatizar las citas.'));
  assert.ok(aviso.o.htmlBody.includes('Hola:<br><br>Quiero automatizar las citas.<br>Peluquería Marta'));

  assert.strictEqual(conf.to, 'marta@ejemplo.com');
  assert.strictEqual(conf.o.from, 'info@airesolutionlabs.com');
  assert.strictEqual(conf.asunto, 'He recibido su mensaje');
  assert.ok(/^(Buenos días|Buenas tardes|Buenas noches), Marta:/.test(conf.texto), conf.texto);
  // Compromiso de plazo
  assert.ok(conf.texto.includes('Gracias por escribir a AI Resolution Labs. He recibido su mensaje y ' +
    'le responderé lo antes posible, como máximo en 72 horas.'));
  assert.ok(conf.o.htmlBody.includes('como máximo en 72 horas.'));
  assert.ok(!conf.texto.includes('próximas'));
  assert.ok(conf.texto.includes('www.airesolutionlabs.com'));
  assert.ok(!conf.texto.includes('founder.airesolutionlabs.com'));
  // Texto fijo: no repite nada de lo que ha escrito
  for (const trozo of ['automatizar', 'citas', 'Peluquería']) {
    assert.ok(!conf.texto.includes(trozo), trozo);
    assert.ok(!conf.o.htmlBody.includes(trozo), trozo);
  }
});

// Envía un contacto modificado y devuelve la respuesta y el entorno (para ver si se guardó o se envió algo)
function contactoCon(cambiar, opts = deLaWeb) {
  const env = crearEntorno(opts);
  const e = contactoOk();
  cambiar(e);
  return { r: post(env, e), env };
}
const nadaGuardado = (env) => { assert.strictEqual(env.filas.length, 0); assert.strictEqual(env.enviados.length, 0); };

prueba('contacto: mensaje corto (menos de 10 caracteres) → rechazado', () => {
  const { r, env } = contactoCon((e) => { e.datos.mensaje = '  Hola   ya '; });
  assert.deepStrictEqual(r, { ok: false, error: 'validacion', campos: ['mensaje'] });
  nadaGuardado(env);
  assert.strictEqual(contactoCon((e) => { e.datos.mensaje = '1234567890'; }).r.ok, true);
});

prueba('contacto: mensaje largo (más de 2000 caracteres) → rechazado', () => {
  const { r, env } = contactoCon((e) => { e.datos.mensaje = 'x'.repeat(2001); });
  assert.deepStrictEqual(r, { ok: false, error: 'validacion', campos: ['mensaje'] });
  nadaGuardado(env);
  assert.strictEqual(contactoCon((e) => { e.datos.mensaje = 'x'.repeat(2000); }).r.ok, true);
});

prueba('contacto: sin mensaje → rechazado', () => {
  const { r, env } = contactoCon((e) => { delete e.datos.mensaje; });
  assert.deepStrictEqual(r.campos, ['mensaje']);
  nadaGuardado(env);
});

prueba('contacto: sin email o con email mal escrito → rechazado', () => {
  let { r, env } = contactoCon((e) => { delete e.datos.email; });
  assert.deepStrictEqual(r, { ok: false, error: 'validacion', campos: ['email'] });
  nadaGuardado(env);
  ({ r, env } = contactoCon((e) => { e.datos.email = 'marta@ejemplo'; }));
  assert.deepStrictEqual(r.campos, ['email']);
  nadaGuardado(env);
});

prueba('contacto: sin aceptar la privacidad → rechazado', () => {
  let { r, env } = contactoCon((e) => { e.consentimientos.privacidad = false; });
  assert.deepStrictEqual(r, { ok: false, error: 'validacion', campos: ['privacidad'] });
  nadaGuardado(env);
  ({ r, env } = contactoCon((e) => { delete e.consentimientos; }));
  assert.deepStrictEqual(r.campos, ['privacidad']);
  nadaGuardado(env);
});

prueba('contacto: nombre vacío o de 1 letra → rechazado', () => {
  for (const nombre of [undefined, ' ', 'M', 'x'.repeat(81)]) {
    const { r, env } = contactoCon((e) => { e.datos.nombre = nombre; });
    assert.deepStrictEqual(r.campos, ['nombre'], String(nombre));
    nadaGuardado(env);
  }
});

prueba('contacto: no exige campos de la tarjeta ni de automatiza', () => {
  // Solo nombre, email y mensaje: sin sector, negocio, WhatsApp, botones, tamaño, etc.
  const { r, env } = contactoCon((e) => { e.datos = { nombre: 'Marta', email: 'm@e.es', mensaje: 'Quiero información.' }; });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(env.filas.length, 1);
});

prueba('contacto: campo trampa relleno → responde ok sin guardar ni enviar', () => {
  const { r, env } = contactoCon((e) => { e.web_empresa = 'spam.com'; });
  assert.deepStrictEqual(r, { ok: true, id: 'ok' });
  nadaGuardado(env);
});

prueba('contacto: rellenado en menos de 3 s → responde ok sin guardar ni enviar', () => {
  const { r, env } = contactoCon((e) => { e.t_relleno = 1200; });
  assert.deepStrictEqual(r, { ok: true, id: 'ok' });
  nadaGuardado(env);
});

prueba('contacto: Turnstile sin token, inválido o de otro dominio → rechazado', () => {
  let { r, env } = contactoCon((e) => { e.turnstile = ''; });
  assert.deepStrictEqual(r, { ok: false, error: 'verificacion' });
  nadaGuardado(env);
  ({ r, env } = contactoCon((e) => { e.turnstile = 'token-falso'; }, {}));
  assert.deepStrictEqual(r, { ok: false, error: 'verificacion' });
  ({ r, env } = contactoCon(() => {}, { turnstile: { success: true, hostname: 'airesolutionlabs.evil.com' } }));
  assert.deepStrictEqual(r, { ok: false, error: 'verificacion' });
  nadaGuardado(env);
});

prueba('contacto: límite de 3 envíos por email y hora', () => {
  const env = crearEntorno(deLaWeb);
  for (let i = 0; i < 3; i++) assert.strictEqual(post(env, contactoOk()).ok, true);
  assert.deepStrictEqual(post(env, contactoOk()), { ok: false, error: 'limite' });
  assert.strictEqual(env.filas.length, 3);
});

prueba('contacto: neutraliza fórmulas en Nombre y en Descripción (mensaje)', () => {
  const { r, env } = contactoCon((e) => {
    e.datos.nombre = '=IMPORTXML("x")';
    e.datos.mensaje = '=HYPERLINK("http://x","clic aquí")';
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(filaDe(env)['Nombre'], '\'=IMPORTXML("x")');
  assert.strictEqual(filaDe(env)['Descripción'], '\'=HYPERLINK("http://x","clic aquí")');
  for (const inicio of ['+', '-', '@']) {
    const o = contactoCon((e) => { e.datos.mensaje = inicio + 'SUM(A1:A9) mensaje'; e.datos.email = 'x' + inicio.charCodeAt(0) + '@e.es'; });
    assert.strictEqual(filaDe(o.env)['Descripción'], "'" + inicio + 'SUM(A1:A9) mensaje', inicio);
  }
});

prueba('contacto también se acepta desde founder (dominios permitidos)', () => {
  const env = crearEntorno();
  assert.strictEqual(post(env, contactoOk()).ok, true);
  assert.strictEqual(post(crearEntorno(deLaWeb), tarjetaOk()).ok, true);
});

prueba('formulario desconocido y JSON roto', () => {
  const env = crearEntorno();
  const e = tarjetaOk(); e.formulario = 'otro';
  assert.deepStrictEqual(post(env, e), { ok: false, error: 'validacion', campos: ['formulario'] });
  assert.strictEqual(env.ctx.doPost({ postData: { contents: '{roto' } }).body.error, 'validacion');
  assert.strictEqual(env.ctx.doPost({}).body.error, 'validacion');
});

prueba('límite: 3 envíos por email y hora', () => {
  const env = crearEntorno();
  for (let i = 0; i < 3; i++) assert.strictEqual(post(env, tarjetaOk()).ok, true);
  assert.deepStrictEqual(post(env, tarjetaOk()), { ok: false, error: 'limite' });
});

prueba('cuota de correo agotada: guarda y lo anota', () => {
  const env = crearEntorno({ cuota: 1 });
  assert.strictEqual(post(env, tarjetaOk()).ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Confirmación'], 'No enviada: cuota diaria agotada');
  assert.strictEqual(env.enviados.length, 1);
});

prueba('fallo de Gmail: la solicitud queda guardada', () => {
  const env = crearEntorno({ fallaCorreo: true });
  assert.strictEqual(post(env, tarjetaOk()).ok, true);
  const f = Object.fromEntries(env.cabeceras.map((h, i) => [h, env.filas[0][i]]));
  assert.strictEqual(f['Confirmación'], 'Error al enviar');
});

prueba('sin alias info@: envía desde la cuenta con respuesta a info@', () => {
  const env = crearEntorno({ alias: false });
  post(env, tarjetaOk());
  assert.strictEqual(env.enviados[1].o.from, undefined);
  assert.strictEqual(env.enviados[1].o.replyTo, 'info@airesolutionlabs.com');
});

prueba('normalizaciones sueltas', () => {
  const env = crearEntorno();
  const run = (s) => vm.runInContext(s, env.ctx);
  assert.strictEqual(run("telefono_('0034 612-345-678', true, 'w', [])"), '+34612345678');
  assert.strictEqual(run("telefono_('+44 7700 900123', true, 'w', [])"), '+447700900123');
  assert.strictEqual(run("instagram_('@mi.negocio_', 'i', [])"), 'mi.negocio_');
  assert.strictEqual(run("columnaALetra_(28)"), 'AB');
  assert.strictEqual(run("slug_('Bad Slug!')"), '');
  assert.strictEqual(run("celda_('-5')"), "'-5");
  assert.strictEqual(run("esc_('<b>&\"')"), '&lt;b&gt;&amp;&quot;');
});

/* ---- v1.3.0: enlaces fijos, usted, saludo, bloqueo del contador, alias en caché y tiempos ---- */

// Todos los href de un HTML
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const URLS_OK = ['https://cal.com/pablo-ortega-insua-wdoysa', 'https://founder.airesolutionlabs.com/', 'https://www.airesolutionlabs.com/'];

prueba('confirmación: solo enlaza direcciones fijas, aunque el usuario escriba URLs', () => {
  const env = crearEntorno();
  const e = tarjetaOk();
  e.datos.nombre = 'https://malo.example/x Pérez';
  e.datos.negocio = 'Visite https://malo.example ya';
  assert.strictEqual(post(env, e).ok, true);
  const conf = env.enviados[1];
  for (const h of hrefs(conf.o.htmlBody)) assert.ok(URLS_OK.includes(h), h);
  assert.ok(!conf.o.htmlBody.includes('malo.example'));
  assert.ok(!conf.texto.includes('malo.example'));
  // Sin nombre válido, saluda sin nombre
  assert.ok(/^(Buenos días|Buenas tardes|Buenas noches):/.test(conf.texto), conf.texto);
  // El aviso a Pablo sí lleva los datos, escapados
  assert.ok(env.enviados[0].texto.includes('Visite https://malo.example ya'));
});

prueba('confirmación de tarjeta: no repite el nombre del negocio', () => {
  const env = crearEntorno();
  post(env, tarjetaOk());
  assert.ok(!env.enviados[1].texto.includes('Clínica Sol'));
  assert.ok(env.enviados[1].texto.includes('He recibido su solicitud de tarjeta de visita digital.'));
});

prueba('confirmación: cita enlazada solo en contacto y automatiza, con la URL en el texto plano', () => {
  for (const [formulario, opts] of [[contactoOk(), deLaWeb], [automatizaOk(), {}]]) {
    const env = crearEntorno(opts);
    post(env, formulario);
    const conf = env.enviados[1];
    assert.ok(conf.o.htmlBody.includes('<a href="https://cal.com/pablo-ortega-insua-wdoysa">reservar una videollamada conmigo</a>'));
    assert.ok(conf.texto.includes('puede reservar una videollamada conmigo (https://cal.com/pablo-ortega-insua-wdoysa).'));
  }
  const env = crearEntorno();
  post(env, tarjetaOk());
  assert.ok(!env.enviados[1].o.htmlBody.includes('cal.com'));
});

prueba('confirmación: los tres formularios en "usted"', () => {
  const tuteo = /\b(tu|tus|te|ti|tú|contigo|quieres|prefieres|puedes|has|eres|responde|ignóralo|escríbeme)\b/i;
  for (const [formulario, opts] of [[tarjetaOk(), {}], [automatizaOk(), {}], [contactoOk(), deLaWeb]]) {
    const env = crearEntorno(opts);
    post(env, formulario);
    const conf = env.enviados[1];
    assert.ok(!tuteo.test(conf.texto), formulario.formulario + ': ' + (conf.texto.match(tuteo) || [])[0]);
    assert.ok(!tuteo.test(conf.asunto), conf.asunto);
    assert.ok(conf.texto.includes('Si no ha sido usted, ignórelo o responda a este correo y borraré los datos.'));
  }
});

prueba('saludo según la hora de Madrid', () => {
  const env = crearEntorno();
  const saludo = (iso, nombre = 'Lucía Pérez') => env.ctx.saludo_(nombre, new Date(iso));
  // Octubre: Madrid = UTC+2
  assert.strictEqual(saludo('2026-10-06T03:59:00Z'), 'Buenas noches, Lucía:');  // 05:59
  assert.strictEqual(saludo('2026-10-06T04:00:00Z'), 'Buenos días, Lucía:');    // 06:00
  assert.strictEqual(saludo('2026-10-06T11:59:00Z'), 'Buenos días, Lucía:');    // 13:59
  assert.strictEqual(saludo('2026-10-06T12:00:00Z'), 'Buenas tardes, Lucía:');  // 14:00
  assert.strictEqual(saludo('2026-10-06T18:59:00Z'), 'Buenas tardes, Lucía:');  // 20:59
  assert.strictEqual(saludo('2026-10-06T19:00:00Z'), 'Buenas noches, Lucía:');  // 21:00
  // Enero: Madrid = UTC+1
  assert.strictEqual(saludo('2027-01-15T12:59:00Z'), 'Buenos días, Lucía:');    // 13:59
  assert.strictEqual(saludo('2027-01-15T13:00:00Z'), 'Buenas tardes, Lucía:');  // 14:00
  // Sin nombre válido
  assert.strictEqual(saludo('2026-10-06T08:00:00Z', 'www.malo.com'), 'Buenos días:');
});

prueba('nombre de pila: solo si son letras', () => {
  const env = crearEntorno();
  const np = (s) => env.ctx.nombrePila_(s);
  assert.strictEqual(np('José Luis García'), 'José');
  assert.strictEqual(np("O'Neill"), "O'Neill");
  assert.strictEqual(np('María-José'), 'María-José');
  assert.strictEqual(np('Ángel'), 'Ángel');
  assert.strictEqual(np('J. Pérez'), 'J.');
  assert.strictEqual(np('Ñuño'), 'Ñuño');
  assert.strictEqual(np('Zoë'), 'Zoë');
  assert.strictEqual(np('Łukasz'), 'Łukasz');
  assert.strictEqual(np('Mª'), 'Mª');
  for (const malo of ['12345', 'http://x', 'www.malo.com', 'malo.com', 'a@b.es', '=SUM(A1)', 'Ana--', '', 'x'.repeat(31)]) {
    assert.strictEqual(np(malo), '', malo);
  }
});

prueba('contador ocupado (no se consigue el bloqueo): error interno, sin guardar ni enviar', () => {
  const env = crearEntorno({ bloqueoOcupado: true });
  assert.deepStrictEqual(post(env, tarjetaOk()), { ok: false, error: 'interno' });
  assert.strictEqual(env.filas.length, 0);
  assert.strictEqual(env.enviados.length, 0);
});

prueba('alias: se consulta una vez y se recuerda; si falla el envío, se vuelve a consultar', () => {
  const env = crearEntorno();
  post(env, tarjetaOk());
  const e2 = tarjetaOk(); e2.datos.email = 'otra@ejemplo.com';
  post(env, e2);
  assert.strictEqual(env.llamadas.alias, 1);
  assert.strictEqual(env.cache['alias:info@airesolutionlabs.com'], 'si');

  const malo = crearEntorno({ fallaCorreo: true });
  post(malo, tarjetaOk());
  assert.strictEqual(malo.cache['alias:info@airesolutionlabs.com'], undefined);
});

prueba('tiempos: una línea por envío con cada fase', () => {
  const env = crearEntorno();
  post(env, tarjetaOk());
  const linea = JSON.parse(env.logs.find((l) => l.includes('"tiempos"')));
  assert.strictEqual(linea.resultado, 'ok');
  assert.strictEqual(linea.id, 'abcdef12');
  assert.strictEqual(linea.formulario, 'tarjeta');
  for (const fase of ['arranque', 'turnstile', 'limite', 'hoja', 'alias', 'aviso', 'confirmacion', 'celda']) {
    assert.strictEqual(typeof linea.ms[fase], 'number', fase);
  }
  assert.strictEqual(typeof linea.total, 'number');

  // También se registra cuando se rechaza
  const env2 = crearEntorno();
  const e = tarjetaOk(); e.turnstile = 'malo';
  post(env2, e);
  const l2 = JSON.parse(env2.logs.find((l) => l.includes('"tiempos"')));
  assert.strictEqual(l2.resultado, 'verificacion');
  assert.strictEqual(l2.id, '');
});

prueba('la columna Confirmación se rellena sin volver a leer las cabeceras', () => {
  const env = crearEntorno();
  post(env, tarjetaOk());
  assert.strictEqual(filaDe(env)['Confirmación'], 'Enviada desde info@airesolutionlabs.com');
});

console.log(`\n${n} pruebas superadas`);
