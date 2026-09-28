/**
 * Formularios de AI Resolution Labs
 * Recibe los formularios de la tarjeta (founder.airesolutionlabs.com), comprueba el antispam,
 * guarda la solicitud en la hoja "Solicitudes", avisa a Pablo y envía la confirmación desde info@.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   TURNSTILE_SECRET  Clave secreta del widget de Cloudflare Turnstile (obligatoria).
 *   TEST_MODE         "true" solo durante las pruebas: acepta el token de prueba de Turnstile
 *                     y marca las filas como PRUEBA. En producción, "false" o sin definir.
 *
 * Despliegue: Implementar → Nueva implementación → Aplicación web
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 * Después de cambiar el código: Implementar → Gestionar implementaciones → Editar → Nueva versión
 * (así la URL no cambia).
 */

const AJUSTES = {
  VERSION: '1.0.0',
  HOJA: 'Solicitudes',
  HOJA_RESUMEN: 'Resumen',
  AVISO_A: '',                          // vacío = la propia cuenta de Gmail (llega a la bandeja de entrada)
  REMITENTE: 'info@airesolutionlabs.com', // alias configurado en Gmail ("Enviar como")
  NOMBRE_REMITENTE: 'Pablo Ortega · AI Resolution Labs',
  RESPONDER_A: 'info@airesolutionlabs.com',
  URL_CITA: 'https://cal.com/pablo-ortega-insua-wdoysa',
  URL_TARJETA: 'https://founder.airesolutionlabs.com/',
  PLAZO_TARJETA: '48 horas',            // PENDIENTE de confirmar por Pablo
  PLAZO_AUTOMATIZA: '48 horas',         // PENDIENTE de confirmar por Pablo
  HOSTS_PERMITIDOS: ['founder.airesolutionlabs.com', 'www.airesolutionlabs.com'],
  RELLENO_MINIMO_MS: 3000,
  MAX_ENVIOS_POR_EMAIL_HORA: 3,
  MAX_ENVIOS_GLOBAL_10MIN: 30,
  VERSION_TEXTO_LEGAL_ACTUAL: '2026-09-25',
};

const ESTADOS = ['Nuevo', 'Contactado', 'Tarjeta entregada', 'Propuesta enviada', 'Cliente', 'Descartado'];

const CABECERAS = [
  'Fecha', 'ID', 'Formulario', 'Estado', 'Nombre', 'Negocio / Empresa', 'Cargo', 'Sector',
  'WhatsApp', 'Email', 'Instagram', 'Web', 'Botones', 'Qué más mejorar', 'Tamaño',
  'Qué automatizar', 'Descripción', 'Contacto preferido', 'Referido', 'Acepta comunicaciones',
  'Versión texto legal', 'Confirmación', 'Notas',
];

const OPCIONES = {
  sector: ['Salud y bienestar', 'Estética y belleza', 'Abogacía y asesoría', 'Inmobiliaria',
    'Hostelería y restauración', 'Comercio', 'Formación', 'Deporte', 'Reformas y construcción', 'Otro'],
  botones: ['WhatsApp', 'Llamar', 'Email', 'Instagram', 'Web', 'Cómo llegar', 'Reservar cita'],
  mejorar: ['Reservas online', 'Página web', 'Responder WhatsApp/Instagram automáticamente',
    'Conseguir más clientes', 'Nada por ahora'],
  tamano: ['Solo yo', '2–5 personas', '6–20', 'Más de 20'],
  que: ['Citas y reservas', 'Atención por WhatsApp o Instagram', 'Captación y seguimiento de clientes',
    'Facturación y tareas administrativas', 'Informes y datos', 'Otra cosa'],
  contacto: ['Email', 'WhatsApp', 'Llamada'],
};

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function doGet() {
  return respuesta_({ ok: true, servicio: 'formularios-airesolutionlabs', version: AJUSTES.VERSION });
}

function doPost(e) {
  try {
    const cuerpo = e && e.postData && e.postData.contents;
    if (!cuerpo || cuerpo.length > 10000) return respuesta_({ ok: false, error: 'validacion', campos: ['cuerpo'] });

    let entrada;
    try {
      entrada = JSON.parse(cuerpo);
    } catch (err) {
      return respuesta_({ ok: false, error: 'validacion', campos: ['json'] });
    }

    const props = PropertiesService.getScriptProperties();
    const modoPrueba = props.getProperty('TEST_MODE') === 'true';

    // 1. Trampas para bots: se responde "ok" sin guardar nada, para que el bot no aprenda qué falló.
    if (esBot_(entrada)) return respuesta_({ ok: true, id: 'ok' });

    // 2. Turnstile
    const verificacion = verificarTurnstile_(entrada.turnstile, props.getProperty('TURNSTILE_SECRET'), modoPrueba);
    if (!verificacion.ok) return respuesta_({ ok: false, error: 'verificacion' });

    // 3. Esquema y normalización
    const resultado = validar_(entrada);
    if (!resultado.ok) return respuesta_({ ok: false, error: 'validacion', campos: resultado.campos });
    const reg = resultado.registro;

    // 4. Límite de envíos
    if (!dentroDelLimite_(reg.email)) return respuesta_({ ok: false, error: 'limite' });

    // 5. Guardar
    reg.id = Utilities.getUuid().slice(0, 8);
    reg.fecha = new Date();
    reg.notas = modoPrueba ? 'PRUEBA' : '';
    reg.confirmacion = 'Pendiente';
    const fila = guardar_(reg);

    // 6. Correos. Un fallo aquí no invalida la solicitud: ya está guardada.
    reg.confirmacion = enviarCorreos_(reg);
    actualizarCelda_(fila, 'Confirmación', reg.confirmacion);

    return respuesta_({ ok: true, id: reg.id });
  } catch (err) {
    console.error('doPost', err && err.stack ? err.stack : err);
    return respuesta_({ ok: false, error: 'interno' });
  }
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Antispam                                                            */
/* ------------------------------------------------------------------ */

function esBot_(entrada) {
  if (!entrada || typeof entrada !== 'object') return true;
  if (entrada.web_empresa) return true;
  const ms = Number(entrada.t_relleno);
  if (!isFinite(ms) || ms < AJUSTES.RELLENO_MINIMO_MS) return true;
  return false;
}

function verificarTurnstile_(token, secreto, modoPrueba) {
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false };
  const secretoUsado = modoPrueba ? '1x0000000000000000000000000000000AA' : secreto;
  if (!secretoUsado) {
    console.error('Falta la propiedad TURNSTILE_SECRET');
    return { ok: false };
  }
  const res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: { secret: secretoUsado, response: token },
    muteHttpExceptions: true,
  });
  let datos = {};
  try {
    datos = JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false };
  }
  if (!datos.success) return { ok: false, codigos: datos['error-codes'] };
  if (!modoPrueba && AJUSTES.HOSTS_PERMITIDOS.indexOf(datos.hostname) === -1) return { ok: false };
  return { ok: true };
}

function dentroDelLimite_(email) {
  const cache = CacheService.getScriptCache();
  const claveEmail = 'rl:e:' + Utilities.base64EncodeWebSafe(email).slice(0, 200);
  const claveGlobal = 'rl:g:' + Math.floor(Date.now() / 600000);
  const nEmail = Number(cache.get(claveEmail) || 0);
  const nGlobal = Number(cache.get(claveGlobal) || 0);
  if (nEmail >= AJUSTES.MAX_ENVIOS_POR_EMAIL_HORA || nGlobal >= AJUSTES.MAX_ENVIOS_GLOBAL_10MIN) return false;
  cache.put(claveEmail, String(nEmail + 1), 3600);
  cache.put(claveGlobal, String(nGlobal + 1), 600);
  return true;
}

/* ------------------------------------------------------------------ */
/* Validación y normalización (funciones puras, probadas fuera)        */
/* ------------------------------------------------------------------ */

function validar_(entrada) {
  const errores = [];
  const formulario = entrada.formulario;
  if (formulario !== 'tarjeta' && formulario !== 'automatiza') return { ok: false, campos: ['formulario'] };
  const d = entrada.datos && typeof entrada.datos === 'object' ? entrada.datos : {};
  const c = entrada.consentimientos && typeof entrada.consentimientos === 'object' ? entrada.consentimientos : {};
  if (c.privacidad !== true) errores.push('privacidad');

  const reg = {
    formulario: formulario,
    nombre: texto_(d.nombre, 2, 80, true, 'nombre', errores),
    sector: opcion_(d.sector, OPCIONES.sector, true, 'sector', errores),
    email: email_(d.email, true, errores),
    whatsapp: '', negocio: '', cargo: '', instagram: '', web: '', botones: '', mejorar: '',
    tamano: '', que: '', descripcion: '', contacto: '',
    referido: slug_(entrada.referido),
    comunicaciones: c.comunicaciones === true ? 'Sí' : 'No',
    versionTexto: texto_(c.version_texto, 0, 20, false, 'version_texto', errores) || '',
  };

  if (formulario === 'tarjeta') {
    reg.negocio = texto_(d.negocio, 2, 80, true, 'negocio', errores);
    reg.cargo = texto_(d.cargo, 0, 60, false, 'cargo', errores);
    reg.whatsapp = telefono_(d.whatsapp, true, 'whatsapp', errores);
    reg.instagram = instagram_(d.instagram, 'instagram', errores);
    reg.web = web_(d.web, 'web', errores);
    reg.botones = lista_(d.botones, OPCIONES.botones, 1, 'botones', errores);
    reg.mejorar = lista_(d.mejorar, OPCIONES.mejorar, 0, 'mejorar', errores);
  } else {
    reg.negocio = texto_(d.empresa, 2, 80, true, 'empresa', errores);
    reg.whatsapp = telefono_(d.whatsapp, false, 'whatsapp', errores);
    reg.tamano = opcion_(d.tamano, OPCIONES.tamano, true, 'tamano', errores);
    reg.que = lista_(d.que, OPCIONES.que, 1, 'que', errores);
    reg.descripcion = texto_(d.descripcion, 0, 1000, false, 'descripcion', errores);
    reg.contacto = opcion_(d.contacto, OPCIONES.contacto, true, 'contacto', errores);
    if (reg.contacto && reg.contacto !== 'Email' && !reg.whatsapp) errores.push('whatsapp');
  }

  if (errores.length) return { ok: false, campos: unicos_(errores) };
  return { ok: true, registro: reg };
}

function limpiar_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function texto_(v, min, max, obligatorio, campo, errores) {
  const s = limpiar_(v);
  if (!s) {
    if (obligatorio) errores.push(campo);
    return '';
  }
  if (s.length < min || s.length > max) errores.push(campo);
  return s;
}

function opcion_(v, permitidas, obligatorio, campo, errores) {
  const s = limpiar_(v);
  if (!s) {
    if (obligatorio) errores.push(campo);
    return '';
  }
  if (permitidas.indexOf(s) === -1) errores.push(campo);
  return s;
}

function lista_(v, permitidas, minimo, campo, errores) {
  const arr = Array.isArray(v) ? v.map(limpiar_).filter(Boolean) : [];
  const validas = unicos_(arr.filter(function (x) { return permitidas.indexOf(x) !== -1; }));
  if (validas.length !== arr.length || validas.length < minimo) errores.push(campo);
  return validas.join(', ');
}

function email_(v, obligatorio, errores) {
  const s = limpiar_(v).toLowerCase();
  if (!s) {
    if (obligatorio) errores.push('email');
    return '';
  }
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) errores.push('email');
  return s;
}

function telefono_(v, obligatorio, campo, errores) {
  let s = limpiar_(v).replace(/[\s().-]/g, '');
  if (!s) {
    if (obligatorio) errores.push(campo);
    return '';
  }
  if (s.indexOf('00') === 0) s = '+' + s.slice(2);
  if (s.charAt(0) !== '+') {
    if (/^[6789]\d{8}$/.test(s)) s = '+34' + s;
    else s = '+' + s;
  }
  if (!/^\+\d{9,15}$/.test(s)) errores.push(campo);
  return s;
}

function instagram_(v, campo, errores) {
  let s = limpiar_(v);
  if (!s) return '';
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) errores.push(campo);
  return s;
}

function web_(v, campo, errores) {
  let s = limpiar_(v);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  if (s.length > 200 || !/^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(s)) errores.push(campo);
  return s;
}

function slug_(v) {
  const s = limpiar_(v).toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(s) ? s : '';
}

function unicos_(arr) {
  return arr.filter(function (x, i) { return arr.indexOf(x) === i; });
}

/** Evita que Sheets interprete un texto como fórmula o número (inyección de fórmulas y teléfonos con +). */
function celda_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ------------------------------------------------------------------ */
/* Hoja                                                                */
/* ------------------------------------------------------------------ */

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(AJUSTES.HOJA);
  if (!hoja) throw new Error('No existe la pestaña "' + AJUSTES.HOJA + '". Ejecuta configurarHoja().');
  return hoja;
}

function guardar_(reg) {
  const valores = {
    'Fecha': reg.fecha,
    'ID': reg.id,
    'Formulario': reg.formulario === 'tarjeta' ? 'Tarjeta' : 'Automatiza',
    'Estado': 'Nuevo',
    'Nombre': reg.nombre,
    'Negocio / Empresa': reg.negocio,
    'Cargo': reg.cargo,
    'Sector': reg.sector,
    'WhatsApp': reg.whatsapp,
    'Email': reg.email,
    'Instagram': reg.instagram,
    'Web': reg.web,
    'Botones': reg.botones,
    'Qué más mejorar': reg.mejorar,
    'Tamaño': reg.tamano,
    'Qué automatizar': reg.que,
    'Descripción': reg.descripcion,
    'Contacto preferido': reg.contacto,
    'Referido': reg.referido,
    'Acepta comunicaciones': reg.comunicaciones,
    'Versión texto legal': reg.versionTexto,
    'Confirmación': reg.confirmacion,
    'Notas': reg.notas,
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hoja = hoja_();
    const cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const fila = cabeceras.map(function (h) {
      if (!(h in valores)) return '';
      return h === 'Fecha' ? valores[h] : celda_(valores[h]);
    });
    hoja.appendRow(fila);
    return hoja.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function actualizarCelda_(fila, cabecera, valor) {
  const hoja = hoja_();
  const cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const col = cabeceras.indexOf(cabecera) + 1;
  if (col > 0) hoja.getRange(fila, col).setValue(celda_(valor));
}

/* ------------------------------------------------------------------ */
/* Correos                                                             */
/* ------------------------------------------------------------------ */

function enviarCorreos_(reg) {
  const cuota = MailApp.getRemainingDailyQuota();
  const remitente = remitente_();
  try {
    if (cuota >= 1) enviarAviso_(reg, remitente);
  } catch (err) {
    console.error('Aviso', err);
  }
  if (cuota < 2) return 'No enviada: cuota diaria agotada';
  try {
    enviarConfirmacion_(reg, remitente);
    return remitente.alias ? 'Enviada desde ' + AJUSTES.REMITENTE : 'Enviada desde la cuenta principal';
  } catch (err) {
    console.error('Confirmación', err);
    return 'Error al enviar';
  }
}

function remitente_() {
  let alias = false;
  try {
    alias = GmailApp.getAliases().indexOf(AJUSTES.REMITENTE) !== -1;
  } catch (err) {
    console.error('Alias', err);
  }
  const opciones = { name: AJUSTES.NOMBRE_REMITENTE, replyTo: AJUSTES.RESPONDER_A };
  if (alias) opciones.from = AJUSTES.REMITENTE;
  return { alias: alias, opciones: opciones };
}

function enviarAviso_(reg, remitente) {
  const destino = AJUSTES.AVISO_A || Session.getEffectiveUser().getEmail();
  const tipo = reg.formulario === 'tarjeta' ? 'Tarjeta gratis' : 'Automatiza';
  const asunto = sinSaltos_((reg.notas ? '[PRUEBA] ' : '') + '[' + tipo + '] ' + reg.negocio + ' — ' + reg.nombre);
  const filas = [
    ['Nombre', reg.nombre], ['Negocio / empresa', reg.negocio], ['Cargo', reg.cargo], ['Sector', reg.sector],
    ['WhatsApp', reg.whatsapp], ['Email', reg.email], ['Instagram', reg.instagram ? '@' + reg.instagram : ''],
    ['Web', reg.web], ['Botones', reg.botones], ['Qué más mejorar', reg.mejorar], ['Tamaño', reg.tamano],
    ['Qué automatizar', reg.que], ['Descripción', reg.descripcion], ['Contacto preferido', reg.contacto],
    ['Referido', reg.referido], ['Acepta comunicaciones', reg.comunicaciones], ['ID', reg.id],
  ].filter(function (f) { return f[1]; });

  const wa = reg.whatsapp ? 'https://wa.me/' + reg.whatsapp.replace('+', '') : '';
  const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#0B1B3D">' +
    '<p><strong>Nueva solicitud: ' + esc_(tipo) + '</strong></p>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    filas.map(function (f) {
      return '<tr><td style="color:#555;border-bottom:1px solid #eee">' + esc_(f[0]) +
        '</td><td style="border-bottom:1px solid #eee">' + esc_(f[1]) + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p>' + (wa ? '<a href="' + wa + '">Abrir WhatsApp</a> · ' : '') +
    '<a href="' + url + '">Ver la hoja de solicitudes</a></p></div>';
  const texto = filas.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n') +
    (wa ? '\n\nWhatsApp: ' + wa : '') + '\nHoja: ' + url;

  const opciones = Object.assign({}, remitente.opciones, { htmlBody: html, replyTo: reg.email });
  GmailApp.sendEmail(destino, asunto, texto, opciones);
}

function enviarConfirmacion_(reg, remitente) {
  const nombre = reg.nombre.split(' ')[0];
  let asunto, parrafos;
  if (reg.formulario === 'tarjeta') {
    asunto = 'Tu tarjeta digital: solicitud recibida';
    parrafos = [
      'Hola, ' + nombre + ':',
      'He recibido tu solicitud de tarjeta de visita digital para ' + reg.negocio + '.',
      'En las próximas ' + AJUSTES.PLAZO_TARJETA + ' te escribo por WhatsApp al ' + reg.whatsapp +
        ' para pedirte la foto o el logo y terminarla. Si quieres adelantar, responde a este correo con tu logo o tu foto.',
      'Un saludo,',
    ];
  } else {
    asunto = 'He recibido tu consulta';
    parrafos = [
      'Hola, ' + nombre + ':',
      'He recibido tu consulta sobre ' + reg.que.toLowerCase() + '. Te respondo en las próximas ' +
        AJUSTES.PLAZO_AUTOMATIZA + '.',
      'Si prefieres adelantarlo, puedes reservar una videollamada conmigo aquí: ' + AJUSTES.URL_CITA,
      'Un saludo,',
    ];
  }
  const firma = ['Pablo Ortega Insúa', 'AI Resolution Labs', AJUSTES.URL_TARJETA];
  const pie = 'Recibes este correo porque se ha enviado un formulario en ' + AJUSTES.URL_TARJETA +
    ' con esta dirección. Si no has sido tú, ignóralo o respóndenos y borraremos los datos.';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B1B3D;max-width:560px">' +
    parrafos.map(function (p) { return '<p>' + enlazar_(esc_(p)) + '</p>'; }).join('') +
    '<p style="margin-top:0"><strong>' + esc_(firma[0]) + '</strong><br>' + esc_(firma[1]) + '<br>' +
    '<a href="' + firma[2] + '">' + firma[2].replace('https://', '').replace(/\/$/, '') + '</a></p>' +
    '<p style="font-size:12px;color:#667">' + esc_(pie) + '</p></div>';
  const texto = parrafos.join('\n\n') + '\n' + firma.join('\n') + '\n\n' + pie;

  GmailApp.sendEmail(reg.email, asunto, texto, Object.assign({}, remitente.opciones, { htmlBody: html }));
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enlazar_(s) {
  return s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

function sinSaltos_(s) {
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, 180);
}

/* ------------------------------------------------------------------ */
/* Puesta en marcha (ejecutar a mano desde el editor)                  */
/* ------------------------------------------------------------------ */

/** Crea o repara las pestañas "Solicitudes" y "Resumen". Se puede ejecutar varias veces. */
function configurarHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Madrid');
  let hoja = ss.getSheetByName(AJUSTES.HOJA);
  if (!hoja) {
    hoja = ss.getSheets()[0];
    hoja.setName(AJUSTES.HOJA);
  }
  const actuales = hoja.getLastColumn() ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0] : [];
  const faltan = CABECERAS.filter(function (h) { return actuales.indexOf(h) === -1; });
  if (actuales.filter(String).length === 0) {
    hoja.getRange(1, 1, 1, CABECERAS.length).setValues([CABECERAS]);
  } else if (faltan.length) {
    hoja.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]);
  }
  const ncol = hoja.getLastColumn();
  hoja.getRange(1, 1, 1, ncol)
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0B1B3D').setWrap(true)
    .setVerticalAlignment('middle');
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(4);
  const cab = hoja.getRange(1, 1, 1, ncol).getValues()[0];
  const col = function (h) { return cab.indexOf(h) + 1; };

  const reglaEstado = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).setAllowInvalid(false).build();
  hoja.getRange(2, col('Estado'), hoja.getMaxRows() - 1, 1).setDataValidation(reglaEstado);
  hoja.getRange(2, col('Fecha'), hoja.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  hoja.getRange(2, col('WhatsApp'), hoja.getMaxRows() - 1, 1).setNumberFormat('@');

  const anchos = { 'Fecha': 120, 'ID': 80, 'Formulario': 95, 'Estado': 140, 'Nombre': 160, 'Negocio / Empresa': 180,
    'Email': 210, 'WhatsApp': 120, 'Botones': 220, 'Qué más mejorar': 240, 'Qué automatizar': 240,
    'Descripción': 320, 'Notas': 260, 'Confirmación': 190 };
  Object.keys(anchos).forEach(function (h) { if (col(h)) hoja.setColumnWidth(col(h), anchos[h]); });

  // Colores por estado
  const rango = hoja.getRange(2, col('Estado'), hoja.getMaxRows() - 1, 1);
  const colores = { 'Nuevo': '#DBEAFE', 'Contactado': '#FEF3C7', 'Tarjeta entregada': '#E0E7FF',
    'Propuesta enviada': '#FCE7F3', 'Cliente': '#D1FAE5', 'Descartado': '#F3F4F6' };
  const reglas = Object.keys(colores).map(function (estado) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(estado).setBackground(colores[estado])
      .setRanges([rango]).build();
  });
  hoja.setConditionalFormatRules(reglas);

  configurarResumen_(ss, cab);
  return 'Hoja configurada';
}

function configurarResumen_(ss, cab) {
  let rs = ss.getSheetByName(AJUSTES.HOJA_RESUMEN);
  if (!rs) rs = ss.insertSheet(AJUSTES.HOJA_RESUMEN);
  rs.clear();
  // Las fórmulas se interpretan con la configuración regional de la hoja: en español el separador es ';'.
  const S = separador_(ss);
  const letra = function (h) { return columnaALetra_(cab.indexOf(h) + 1); };
  const F = letra('Formulario'), E = letra('Estado'), D = letra('Fecha'), N = letra('Notas');
  const h = "'" + AJUSTES.HOJA + "'!";
  const sinPruebas = S + h + N + ':' + N + S + '"<>PRUEBA"';
  const etiquetas = [['Indicador', 'Tarjeta', 'Automatiza', 'Total']];
  const formulas = [];
  const add = function (etiqueta, extra) {
    const r = etiquetas.length + 4;
    etiquetas.push([etiqueta, '', '', '']);
    formulas.push([
      '=COUNTIFS(' + h + F + ':' + F + S + '"Tarjeta"' + extra + sinPruebas + ')',
      '=COUNTIFS(' + h + F + ':' + F + S + '"Automatiza"' + extra + sinPruebas + ')',
      '=B' + r + '+C' + r]);
  };
  add('Solicitudes recibidas', '');
  ESTADOS.forEach(function (e) { add('Estado: ' + e, S + h + E + ':' + E + S + '"' + e + '"'); });
  add('Últimos 7 días', S + h + D + ':' + D + S + '">="&(TODAY()-7)');
  add('Últimos 30 días', S + h + D + ':' + D + S + '">="&(TODAY()-30)');

  rs.getRange('A1').setValue('Resumen de solicitudes').setFontWeight('bold').setFontSize(14);
  rs.getRange('A2').setValue('Se calcula a partir de la pestaña Solicitudes. No cuenta las filas marcadas como PRUEBA.')
    .setFontStyle('italic').setFontColor('#666666');
  rs.getRange(4, 1, etiquetas.length, 4).setValues(etiquetas);
  rs.getRange(5, 2, formulas.length, 3).setFormulas(formulas);
  rs.getRange(4, 1, 1, 4).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0B1B3D');
  const r = etiquetas.length + 5;
  rs.getRange(r, 1).setValue('Criterio para pasar al sistema semiautomático').setFontWeight('bold');
  rs.getRange(r + 1, 1).setValue('Pendiente de definir. Propuesta: revisar al llegar a 20 tarjetas entregadas o a los 60 días; si 2 o más acaban en una venta de pago, construir el autoservicio.').setWrap(true);
  rs.setColumnWidth(1, 330);
  rs.setColumnWidths(2, 3, 100);
}

/** Separador de argumentos de las fórmulas según la configuración regional de la hoja. */
function separador_(ss) {
  return /^(en|ja|zh|ko|he|th|hi)(_|$)/.test(ss.getSpreadsheetLocale()) ? ',' : ';';
}

function columnaALetra_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Comprueba la configuración y lo escribe en el registro de ejecución. */
function comprobarConfiguracion() {
  const props = PropertiesService.getScriptProperties();
  const info = {
    hoja: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AJUSTES.HOJA),
    turnstileSecret: !!props.getProperty('TURNSTILE_SECRET'),
    modoPrueba: props.getProperty('TEST_MODE') === 'true',
    aliasInfo: GmailApp.getAliases().indexOf(AJUSTES.REMITENTE) !== -1,
    cuotaCorreoRestante: MailApp.getRemainingDailyQuota(),
    cuenta: Session.getEffectiveUser().getEmail(),
  };
  console.log(JSON.stringify(info, null, 2));
  return info;
}
