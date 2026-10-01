// Pruebas de navegador de los formularios con Turnstile y Apps Script simulados.
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = 'http://localhost:8080';
const Q = '?endpoint=' + encodeURIComponent('http://localhost:8081/') + '&sitekey=1x00000000000000000000AA';
const TURNSTILE_FALSO = `
  window.turnstile = {
    render: function (sel, o) { window.__ts = o; setTimeout(function () { o.callback('XXXX.DUMMY.TOKEN.XXXX'); }, 200); return 'w1'; },
    reset: function () { var o = window.__ts; setTimeout(function () { o.callback('XXXX.DUMMY.TOKEN.XXXX'); }, 200); },
    getResponse: function () { return ''; }
  };
  var cb = new URL(document.currentScript.src).searchParams.get('onload');
  if (cb && window[cb]) window[cb]();
`;

async function registro() {
  return (await fetch('http://localhost:8081/registro')).json();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' });
  let turnstileRoto = false;
  await ctx.route('https://challenges.cloudflare.com/**', (route) =>
    turnstileRoto ? route.abort() : route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_FALSO }));
  const page = await ctx.newPage();
  const erroresConsola = [];
  page.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()); });
  page.on('pageerror', (e) => erroresConsola.push(e.message));

  let n = 0;
  const ok = (t) => { n++; console.log('✓', t); };

  // 1. La tarjeta enlaza a las páginas nuevas
  await page.goto(BASE + '/');
  assert.strictEqual(await page.getAttribute('a.featured-item >> nth=0', 'href'), 'automatiza/');
  assert.strictEqual(await page.getAttribute('a.amber-item', 'href'), 'tarjeta/');
  assert.strictEqual(await page.locator('a[href*="docs.google.com"]').count(), 0);
  await page.screenshot({ path: 'capturas/1-tarjeta.png', fullPage: true });
  ok('la tarjeta apunta a /tarjeta/ y /automatiza/');

  // 2. Tarjeta: enviar vacío muestra errores
  await page.goto(BASE + '/tarjeta/' + Q + '&ref=irene-ortega');
  await page.screenshot({ path: 'capturas/2-form-tarjeta.png', fullPage: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('#resumen-errores.visible');
  const invalidos = await page.locator('[aria-invalid="true"]').count();
  assert.ok(invalidos >= 6, 'campos inválidos: ' + invalidos);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'resumen-errores');
  await page.screenshot({ path: 'capturas/3-form-tarjeta-errores.png', fullPage: true });
  ok('envío vacío: resumen de errores con foco y campos marcados');

  // 3. Validación al salir del campo
  await page.fill('#email', 'no-es-email');
  await page.locator('#email').blur();
  assert.ok((await page.textContent('#email-error')).includes('email válido'));
  ok('validación al salir del campo');

  // 4. Envío correcto
  await page.fill('#nombre', 'Lucía Pérez');
  await page.fill('#negocio', 'Clínica Sol');
  await page.fill('#cargo', 'Fisioterapeuta');
  await page.selectOption('#sector', 'Salud y bienestar');
  await page.fill('#whatsapp', '600 123 456');
  await page.fill('#email', 'lucia@ejemplo.com');
  await page.fill('#instagram', '@clinicasol');
  await page.fill('#web', 'clinicasol.es');
  await page.check('input[name=botones][value="Reservar cita"]');
  await page.check('input[name=mejorar][value="Reservas online"]');
  await page.check('#privacidad');
  await page.waitForTimeout(3100);
  await page.click('button[type=submit]');
  await page.waitForSelector('#exito.visible', { timeout: 10000 });
  assert.ok((await page.textContent('#exito h2')).includes('Lucía'));
  assert.strictEqual(await page.isHidden('form'), true);
  await page.screenshot({ path: 'capturas/4-tarjeta-exito.png', fullPage: true });
  let reg = await registro();
  const fila = Object.fromEntries(reg.cabeceras.map((h, i) => [h, reg.filas[0][i]]));
  assert.strictEqual(fila['WhatsApp'], "'+34600123456");
  assert.strictEqual(fila['Botones'], 'WhatsApp, Reservar cita');
  assert.strictEqual(fila['Referido'], 'irene-ortega');
  assert.strictEqual(fila['Instagram'], 'clinicasol');
  assert.strictEqual(reg.enviados.length, 2);
  ok('envío correcto: fila guardada, referido registrado y dos correos');

  // 5. Automatiza: WhatsApp obligatorio si se elige ese contacto
  await page.goto(BASE + '/automatiza/' + Q);
  await page.fill('#nombre', 'Martín Oliveira');
  await page.fill('#empresa', 'El garbanzo de oro');
  await page.selectOption('#sector', 'Hostelería y restauración');
  await page.fill('#email', 'martin@ejemplo.com');
  await page.selectOption('#tamano', '2–5 personas');
  await page.check('input[name=que][value="Citas y reservas"]');
  await page.fill('#descripcion', 'Las reservas de mesa por teléfono nos quitan mucho tiempo.');
  assert.ok((await page.textContent('#descripcion-contador')).startsWith('58 / 1000'));
  await page.check('input[name=contacto][value="WhatsApp"]');
  await page.check('#privacidad');
  await page.check('#comunicaciones');
  await page.click('button[type=submit]');
  await page.waitForSelector('#resumen-errores.visible');
  assert.ok((await page.textContent('#whatsapp-error')).includes('teléfono'));
  ok('automatiza: pide teléfono si el contacto es por WhatsApp');
  await page.fill('#whatsapp', '+34 955 123 456');
  await page.waitForTimeout(3100);
  await page.click('button[type=submit]');
  await page.waitForSelector('#exito.visible', { timeout: 10000 });
  assert.ok(await page.locator('#exito a[href*="cal.com"]').isVisible());
  await page.screenshot({ path: 'capturas/5-automatiza-exito.png', fullPage: true });
  reg = await registro();
  assert.strictEqual(reg.filas.length, 2);
  ok('automatiza: envío correcto y enlace a Cal.com');

  // 6. Error de validación devuelto por el servidor
  await fetch('http://localhost:8081/forzar?r=' + encodeURIComponent(JSON.stringify({ ok: false, error: 'validacion', campos: ['email'] })));
  await page.goto(BASE + '/automatiza/' + Q);
  await page.fill('#nombre', 'Ana');
  await page.fill('#empresa', 'Ana SL');
  await page.selectOption('#sector', 'Comercio');
  await page.fill('#email', 'ana@ejemplo.com');
  await page.selectOption('#tamano', 'Solo yo');
  await page.check('input[name=que][value="Informes y datos"]');
  await page.check('#privacidad');
  await page.waitForTimeout(3100);
  await page.click('button[type=submit]');
  await page.waitForSelector('#resumen-errores.visible');
  assert.strictEqual(await page.getAttribute('#email', 'aria-invalid'), 'true');
  assert.strictEqual(await page.isEnabled('button[type=submit]'), true);
  ok('error del servidor: se marca el campo y el botón vuelve a estar activo');

  // 7. Servidor caído / error interno → alternativa por email
  await fetch('http://localhost:8081/forzar?r=' + encodeURIComponent(JSON.stringify({ ok: false, error: 'interno' })));
  await page.click('button[type=submit]');
  await page.waitForSelector('#alternativa.visible');
  assert.ok((await page.textContent('#alternativa')).includes('info@airesolutionlabs.com'));
  await page.screenshot({ path: 'capturas/6-alternativa.png', fullPage: true });
  await fetch('http://localhost:8081/forzar');
  ok('error interno: muestra el email como alternativa');

  // 7b. Sector "Otro": aparece "¿Cuál es tu sector?", es obligatorio y se guarda
  await page.goto(BASE + '/tarjeta/' + Q);
  assert.strictEqual(await page.isHidden('#sector_otro'), true);
  await page.selectOption('#sector', 'Otro');
  assert.strictEqual(await page.isVisible('#sector_otro'), true);
  await page.fill('#nombre', 'Ana Gil'); await page.fill('#negocio', 'Estudio Ana');
  await page.fill('#whatsapp', '622333444'); await page.fill('#email', 'ana@ejemplo.com'); await page.check('#privacidad');
  await page.click('button[type=submit]');
  await page.waitForSelector('#resumen-errores.visible');
  assert.ok((await page.textContent('#resumen-errores')).includes('Escribe tu sector'));
  assert.strictEqual(await page.getAttribute('#sector_otro', 'aria-invalid'), 'true');
  await page.screenshot({ path: 'capturas/7b-sector-otro.png', fullPage: true });
  await page.selectOption('#sector', 'Comercio');
  assert.strictEqual(await page.isHidden('#sector_otro'), true);
  await page.selectOption('#sector', 'Otro');
  await page.fill('#sector_otro', 'Fotografía de bodas');
  await page.waitForTimeout(3100);
  await page.click('button[type=submit]');
  await page.waitForSelector('#exito.visible', { timeout: 10000 });
  reg = await registro();
  const filaOtro = Object.fromEntries(reg.cabeceras.map((h, i) => [h, reg.filas[reg.filas.length - 1][i]]));
  assert.strictEqual(filaOtro['Sector'], 'Otro: Fotografía de bodas');
  ok('sector "Otro": pide cuál, lo exige y lo guarda como "Otro: …"');

  // 8. Turnstile bloqueado → alternativa
  turnstileRoto = true;
  await page.goto(BASE + '/tarjeta/' + Q);
  await page.fill('#nombre', 'Luis'); await page.fill('#negocio', 'Taller Luis');
  await page.selectOption('#sector', 'Otro'); await page.fill('#sector_otro', 'Taller mecánico'); await page.fill('#whatsapp', '611222333');
  await page.fill('#email', 'luis@ejemplo.com'); await page.check('#privacidad');
  await page.click('button[type=submit]');
  await page.waitForSelector('#alternativa.visible', { timeout: 15000 });
  assert.ok((await page.textContent('#alternativa')).includes('verificación antispam'));
  turnstileRoto = false;
  ok('Turnstile bloqueado: explica el motivo y ofrece el email');

  // 9. Configuración de producción: URL del Apps Script y clave de Turnstile reales
  const js = await (await fetch(BASE + '/assets/formularios.js')).text();
  assert.ok(!/ENDPOINT: 'PENDIENTE|TURNSTILE_SITEKEY: 'PENDIENTE/.test(js));
  assert.ok(/TURNSTILE_SITEKEY: '0x[0-9A-Za-z_-]+'/.test(js));
  ok('producción: URL del Apps Script y clave de Turnstile configuradas');

  // 10. Privacidad y escritorio
  await page.goto(BASE + '/privacidad/');
  await page.screenshot({ path: 'capturas/7-privacidad.png', fullPage: true });
  const escritorio = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await escritorio.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_FALSO }));
  await escritorio.goto(BASE + '/automatiza/' + Q);
  await escritorio.screenshot({ path: 'capturas/8-automatiza-escritorio.png', fullPage: true });
  ok('capturas de privacidad y escritorio');

  // Sin errores de JS (se ignoran los recursos que no existen en local y el fallo forzado de Turnstile)
  const reales = erroresConsola.filter((e) => !/Failed to load resource|ERR_FAILED|net::/.test(e));
  assert.deepStrictEqual(reales, []);
  ok('sin errores de JavaScript en consola');

  await browser.close();
  console.log(`\n${n} pruebas de navegador superadas`);
})().catch((e) => { console.error(e); process.exit(1); });
