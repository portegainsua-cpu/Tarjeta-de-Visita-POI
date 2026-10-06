/**
 * Formularios de AI Resolution Labs
 * Recibe los formularios de la tarjeta (founder.airesolutionlabs.com) y el de contacto de la web
 * (www.airesolutionlabs.com), comprueba el antispam,
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
 *
 * Tiempos: cada envío deja en el registro de ejecuciones una línea "tiempos" con los milisegundos de
 * cada fase (ver docs/formularios.md, "Medir cuánto tarda un envío").
 */

// Momento en que Google carga el script para esta ejecución. Sirve para medir el arranque.
const INICIO_CARGA_ = Date.now();

const AJUSTES = {
  VERSION: '1.3.0',
  HOJA: 'Solicitudes',
  HOJA_RESUMEN: 'Resumen',
  AVISO_A: '',                          // vacío = la propia cuenta de Gmail (llega a la bandeja de entrada)
  REMITENTE: 'info@airesolutionlabs.com', // alias configurado en Gmail ("Enviar como")
  NOMBRE_REMITENTE: 'Pablo Ortega · AI Resolution Labs',
  RESPONDER_A: 'info@airesolutionlabs.com',
  URL_CITA: 'https://cal.com/pablo-ortega-insua-wdoysa',
  URL_TARJETA: 'https://founder.airesolutionlabs.com/',
  URL_WEB: 'https://www.airesolutionlabs.com/',
  PLAZO_TARJETA: '48 horas',            // PENDIENTE de confirmar por Pablo
  PLAZO_AUTOMATIZA: '72 horas',
  PLAZO_CONTACTO: '72 horas',
  HOSTS_PERMITIDOS: ['founder.airesolutionlabs.com', 'www.airesolutionlabs.com'],
  RELLENO_MINIMO_MS: 3000,
  MAX_ENVIOS_POR_EMAIL_HORA: 3,
  MAX_ENVIOS_GLOBAL_10MIN: 30,
  VERSION_TEXTO_LEGAL_ACTUAL: '2026-09-25',
  ZONA_HORARIA: 'Europe/Madrid',        // para el saludo según la hora
  ESPERA_BLOQUEO_MS: 10000,             // espera máxima para el contador de envíos
  CACHE_ALIAS_S: 21600,                 // 6 h: cuánto se recuerda que el alias info@ existe
};

// Únicas direcciones que pueden ir enlazadas en la confirmación. Nada de lo que escribe el usuario se enlaza.
const URLS_FIJAS = [AJUSTES.URL_CITA, AJUSTES.URL_TARJETA, AJUSTES.URL_WEB];

const ESTADOS = ['Nuevo', 'Contactado', 'Tarjeta entregada', 'Propuesta enviada', 'Cliente', 'Descartado'];

const CABECERAS = [
  'Fecha', 'ID', 'Formulario', 'Estado', 'Nombre', 'Negocio / Empresa', 'Cargo', 'Sector',
  'WhatsApp', 'Email', 'Instagram', 'Web', 'Botones', 'Qué más mejorar', 'Tamaño',
  'Qué automatizar', 'Descripción', 'Contacto preferido', 'Referido', 'Acepta comunicaciones',
  'Versión texto legal', 'Confirmación', 'Notas',
];

// Formularios admitidos y cómo aparecen en la columna "Formulario" de la hoja
const NOMBRES_FORMULARIO = { tarjeta: 'Tarjeta', automatiza: 'Automatiza', contacto: 'Contacto' };

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
  const t = cronometro_();
  let salida;
  try {
    salida = procesar_(e, t);
  } catch (err) {
    console.error('doPost', err && err.stack ? err.stack : err);
    salida = { ok: false, error: 'interno' };
  }
  t.registrar(salida);
  return respuesta_(salida);
}

function procesar_(e, t) {
  const cuerpo = e && e.postData && e.postData.contents;
  if (!cuerpo || cuerpo.length > 10000) return { ok: false, error: 'validacion', campos: ['cuerpo'] };

  let entrada;
  try {
    entrada = JSON.parse(cuerpo);
  } catch (err) {
    return { ok: false, error: 'validacion', campos: ['json'] };
  }

  const props = PropertiesService.getScriptProperties();
  const modoPrueba = props.getProperty('TEST_MODE') === 'true';

  // 1. Trampas para bots: se responde "ok" sin guardar nada, para que el bot no aprenda qué falló.
  if (esBot_(entrada)) return { ok: true, id: 'ok' };

  // 2. Turnstile
  const verificacion = verificarTurnstile_(entrada.turnstile, props.getProperty('TURNSTILE_SECRET'), modoPrueba);
  t.marca('turnstile');
  if (!verificacion.ok) return { ok: false, error: 'verificacion' };

  // 3. Esquema y normalización
  const resultado = validar_(entrada);
  if (!resultado.ok) return { ok: false, error: 'validacion', campos: resultado.campos };
  const reg = resultado.registro;

  // 4. Límite de envíos (con bloqueo, para que dos envíos simultáneos no lean el mismo contador)
  const limite = dentroDelLimite_(reg.email);
  t.marca('limite');
  if (limite === 'ocupado') return { ok: false, error: 'interno' };
  if (limite !== 'ok') return { ok: false, error: 'limite' };

  // 5. Guardar
  reg.id = Utilities.getUuid().slice(0, 8);
  reg.fecha = new Date();
  reg.notas = modoPrueba ? 'PRUEBA' : '';
  reg.confirmacion = 'Pendiente';
  const guardado = guardar_(reg);
  t.reg = reg;
  t.marca('hoja');

  // 6. Correos. Un fallo aquí no invalida la solicitud: ya está guardada.
  reg.confirmacion = enviarCorreos_(reg, t);
  if (guardado.colConfirmacion > 0) {
    guardado.hoja.getRange(guardado.fila, guardado.colConfirmacion).setValue(celda_(reg.confirmacion));
  }
  t.marca('celda');

  return { ok: true, id: reg.id };
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mide cuánto tarda cada fase y lo deja en el registro de ejecuciones (una línea JSON con "tiempos").
 * "arranque" es lo que pasa desde que Google carga el script hasta que empieza doPost. El tiempo
 * que Google tarda antes de cargarlo (arranque en frío) no se ve aquí: es la diferencia entre lo
 * que espera el navegador y el "total" de esta línea.
 */
function cronometro_() {
  const inicio = Date.now();
  let anterior = inicio;
  const ms = { arranque: inicio - INICIO_CARGA_ };
  return {
    reg: null, // la solicitud, una vez guardada
    marca: function (fase) {
      const ahora = Date.now();
      ms[fase] = ahora - anterior;
      anterior = ahora;
    },
    registrar: function (salida) {
      console.log(JSON.stringify({
        evento: 'tiempos',
        version: AJUSTES.VERSION,
        id: this.reg ? this.reg.id : '',
        formulario: this.reg ? this.reg.formulario : '',
        resultado: salida.ok ? 'ok' : salida.error,
        ms: ms,
        total: Date.now() - inicio,
      }));
    },
  };
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

/**
 * Cuenta el envío y dice si cabe: 'ok', 'limite' (se ha pasado) u 'ocupado' (no se pudo bloquear a tiempo).
 * El bloqueo evita que dos envíos simultáneos lean el mismo valor y ambos pasen.
 */
function dentroDelLimite_(email) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(AJUSTES.ESPERA_BLOQUEO_MS)) return 'ocupado';
  try {
    const cache = CacheService.getScriptCache();
    const claveEmail = 'rl:e:' + Utilities.base64EncodeWebSafe(email).slice(0, 200);
    const claveGlobal = 'rl:g:' + Math.floor(Date.now() / 600000);
    const nEmail = Number(cache.get(claveEmail) || 0);
    const nGlobal = Number(cache.get(claveGlobal) || 0);
    if (nEmail >= AJUSTES.MAX_ENVIOS_POR_EMAIL_HORA || nGlobal >= AJUSTES.MAX_ENVIOS_GLOBAL_10MIN) return 'limite';
    cache.put(claveEmail, String(nEmail + 1), 3600);
    cache.put(claveGlobal, String(nGlobal + 1), 600);
    return 'ok';
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Validación y normalización (funciones puras, probadas fuera)        */
/* ------------------------------------------------------------------ */

function validar_(entrada) {
  const errores = [];
  const formulario = entrada.formulario;
  if (NOMBRES_FORMULARIO[formulario] === undefined) return { ok: false, campos: ['formulario'] };
  const d = entrada.datos && typeof entrada.datos === 'object' ? entrada.datos : {};
  const c = entrada.consentimientos && typeof entrada.consentimientos === 'object' ? entrada.consentimientos : {};
  if (c.privacidad !== true) errores.push('privacidad');

  const reg = {
    formulario: formulario,
    nombre: texto_(d.nombre, 2, 80, true, 'nombre', errores),
    sector: '',
    email: email_(d.email, true, errores),
    whatsapp: '', negocio: '', cargo: '', instagram: '', web: '', botones: '', mejorar: '',
    tamano: '', que: '', descripcion: '', contacto: '', mensaje: '',
    referido: slug_(entrada.referido),
    comunicaciones: c.comunicaciones === true ? 'Sí' : 'No',
    versionTexto: texto_(c.version_texto, 0, 20, false, 'version_texto', errores) || '',
  };

  // El formulario de contacto de la web solo pide nombre, email y mensaje
  if (formulario === 'contacto') {
    reg.mensaje = textoLargo_(d.mensaje, 10, 2000, true, 'mensaje', errores);
    if (errores.length) return { ok: false, campos: unicos_(errores) };
    return { ok: true, registro: reg };
  }

  reg.sector = opcion_(d.sector, OPCIONES.sector, true, 'sector', errores);

  // Si el sector es "Otro", el cliente escribe el suyo: se guarda como "Otro: <sector>"
  if (reg.sector === 'Otro') {
    const cual = texto_(d.sector_otro, 2, 60, true, 'sector_otro', errores);
    if (cual) reg.sector = 'Otro: ' + cual;
  }

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

/** Como texto_, pero conserva los saltos de línea (máximo dos seguidos). Para el mensaje de contacto. */
function textoLargo_(v, min, max, obligatorio, campo, errores) {
  const s = String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    'Formulario': NOMBRES_FORMULARIO[reg.formulario],
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
    'Descripción': reg.descripcion || reg.mensaje,
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
    // Se devuelve la columna de "Confirmación" para no volver a leer las cabeceras después de los correos.
    return { hoja: hoja, fila: hoja.getLastRow(), colConfirmacion: cabeceras.indexOf('Confirmación') + 1 };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Correos                                                             */
/* ------------------------------------------------------------------ */

function enviarCorreos_(reg, t) {
  const cuota = MailApp.getRemainingDailyQuota();
  const remitente = remitente_();
  t.marca('alias');
  try {
    if (cuota >= 1) enviarAviso_(reg, remitente);
  } catch (err) {
    console.error('Aviso', err);
  }
  t.marca('aviso');
  if (cuota < 2) return 'No enviada: cuota diaria agotada';
  try {
    enviarConfirmacion_(reg, remitente);
    return remitente.alias ? 'Enviada desde ' + AJUSTES.REMITENTE : 'Enviada desde la cuenta principal';
  } catch (err) {
    console.error('Confirmación', err);
    // Si el alias ha dejado de existir, que el siguiente envío lo vuelva a comprobar.
    if (remitente.alias) olvidarAlias_();
    return 'Error al enviar';
  } finally {
    t.marca('confirmacion');
  }
}

const CLAVE_ALIAS_ = 'alias:' + AJUSTES.REMITENTE;

/** Consultar los alias de Gmail es lento: el resultado se guarda 6 h (10 min si no existe). */
function remitente_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(CLAVE_ALIAS_);
  let alias = guardado === 'si';
  if (!guardado) {
    try {
      alias = GmailApp.getAliases().indexOf(AJUSTES.REMITENTE) !== -1;
      cache.put(CLAVE_ALIAS_, alias ? 'si' : 'no', alias ? AJUSTES.CACHE_ALIAS_S : 600);
    } catch (err) {
      console.error('Alias', err);
    }
  }
  const opciones = { name: AJUSTES.NOMBRE_REMITENTE, replyTo: AJUSTES.RESPONDER_A };
  if (alias) opciones.from = AJUSTES.REMITENTE;
  return { alias: alias, opciones: opciones };
}

function olvidarAlias_() {
  try {
    CacheService.getScriptCache().remove(CLAVE_ALIAS_);
  } catch (err) {
    console.error('Alias', err);
  }
}

function enviarAviso_(reg, remitente) {
  const destino = AJUSTES.AVISO_A || Session.getEffectiveUser().getEmail();
  const tipo = { tarjeta: 'Tarjeta gratis', automatiza: 'Automatiza', contacto: 'Contacto web' }[reg.formulario];
  const asunto = sinSaltos_((reg.notas ? '[PRUEBA] ' : '') + '[' + tipo + '] ' +
    (reg.negocio ? reg.negocio + ' — ' : '') + reg.nombre);
  const filas = [
    ['Nombre', reg.nombre], ['Negocio / empresa', reg.negocio], ['Cargo', reg.cargo], ['Sector', reg.sector],
    ['WhatsApp', reg.whatsapp], ['Email', reg.email], ['Instagram', reg.instagram ? '@' + reg.instagram : ''],
    ['Web', reg.web], ['Botones', reg.botones], ['Qué más mejorar', reg.mejorar], ['Tamaño', reg.tamano],
    ['Qué automatizar', reg.que], ['Descripción', reg.descripcion], ['Mensaje', reg.mensaje],
    ['Contacto preferido', reg.contacto],
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
        '</td><td style="border-bottom:1px solid #eee">' + esc_(f[1]).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p>' + (wa ? '<a href="' + wa + '">Abrir WhatsApp</a> · ' : '') +
    '<a href="' + url + '">Ver la hoja de solicitudes</a></p></div>';
  const texto = filas.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n') +
    (wa ? '\n\nWhatsApp: ' + wa : '') + '\nHoja: ' + url;

  const opciones = Object.assign({}, remitente.opciones, { htmlBody: html, replyTo: reg.email });
  GmailApp.sendEmail(destino, asunto, texto, opciones);
}

/**
 * Confirmación al solicitante, en "usted" y en primera persona.
 * No repite texto libre del usuario (negocio, mensaje…) para que nadie pueda usar el formulario para
 * mandar contenido o enlaces a terceros desde info@. Solo se usan su nombre de pila si es un nombre
 * (letras), su WhatsApp ya validado y las opciones de la lista. Los únicos enlaces son los de URLS_FIJAS.
 */
function enviarConfirmacion_(reg, remitente) {
  const cita = ['Si prefiere adelantarlo, puede ', enlace_('reservar una videollamada conmigo', AJUSTES.URL_CITA), '.'];
  let asunto, parrafos;
  if (reg.formulario === 'tarjeta') {
    asunto = 'Su tarjeta digital: solicitud recibida';
    parrafos = [
      ['He recibido su solicitud de tarjeta de visita digital.'],
      ['En las próximas ' + AJUSTES.PLAZO_TARJETA + ' le escribiré por WhatsApp al ' + reg.whatsapp +
        ' para pedirle la foto o el logo y terminarla. Si quiere adelantarlo, responda a este correo con su logo o su foto.'],
    ];
  } else if (reg.formulario === 'contacto') {
    asunto = 'He recibido su mensaje';
    parrafos = [
      ['Gracias por escribir a AI Resolution Labs. He recibido su mensaje y le responderé lo antes posible, ' +
        'como máximo en ' + AJUSTES.PLAZO_CONTACTO + '.'],
      cita,
    ];
  } else {
    asunto = 'He recibido su consulta';
    parrafos = [
      ['He recibido su consulta sobre ' + reg.que.toLowerCase() + ' y le responderé lo antes posible, ' +
        'como máximo en ' + AJUSTES.PLAZO_AUTOMATIZA + '.'],
      cita,
    ];
  }
  parrafos.unshift([saludo_(reg.nombre, reg.fecha || new Date())]);
  parrafos.push(['Un saludo,']);

  const origen = reg.formulario === 'contacto' ? AJUSTES.URL_WEB : AJUSTES.URL_TARJETA;
  const dominio = origen.replace('https://', '').replace(/\/$/, '');
  const pie = 'Recibe este correo porque se ha enviado un formulario en ' + dominio +
    ' con esta dirección. Si no ha sido usted, ignórelo o responda a este correo y borraré los datos.';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B1B3D;max-width:560px">' +
    parrafos.map(function (p) { return '<p>' + partesHtml_(p) + '</p>'; }).join('') +
    '<p style="margin-top:0"><strong>Pablo Ortega Insúa</strong><br>AI Resolution Labs<br>' +
    partesHtml_([enlace_(dominio, origen)]) + '</p>' +
    '<p style="font-size:12px;color:#667">' + esc_(pie) + '</p></div>';
  const texto = parrafos.map(partesTexto_).join('\n\n') +
    '\nPablo Ortega Insúa\nAI Resolution Labs\n' + origen + '\n\n' + pie;

  GmailApp.sendEmail(reg.email, asunto, texto, Object.assign({}, remitente.opciones, { htmlBody: html }));
}

/** "Buenos días" hasta las 14:00, "Buenas tardes" hasta las 21:00 y "Buenas noches" el resto (hora de Madrid). */
function saludo_(nombreCompleto, fecha) {
  const hora = Number(Utilities.formatDate(fecha, AJUSTES.ZONA_HORARIA, 'H'));
  const base = hora >= 6 && hora < 14 ? 'Buenos días' : (hora >= 14 && hora < 21 ? 'Buenas tardes' : 'Buenas noches');
  const nombre = nombrePila_(nombreCompleto);
  return base + (nombre ? ', ' + nombre : '') + ':';
}

/**
 * Primera palabra del nombre, solo si es un nombre: letras, con apóstrofo o guion entre letras y un punto
 * final opcional (O'Neill, María-José, J.). Un punto en medio no: "www.algo.com" se convertiría en enlace.
 */
function nombrePila_(nombreCompleto) {
  const primero = String(nombreCompleto || '').split(' ')[0];
  return primero.length <= 30 && NOMBRE_PILA_.test(primero) ? primero : '';
}
// Letras latinas con tildes y diéresis (rangos explícitos en vez de \p{L}, por compatibilidad).
const NOMBRE_PILA_ = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žªº]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿĀ-žªº]+)*\.?$/;

/** Enlace a una dirección fija. Si la dirección no está en URLS_FIJAS, se queda en texto sin enlace. */
function enlace_(texto, url) {
  return { texto: texto, url: URLS_FIJAS.indexOf(url) !== -1 ? url : '' };
}

function partesHtml_(partes) {
  return partes.map(function (p) {
    if (typeof p === 'string') return esc_(p);
    return p.url ? '<a href="' + esc_(p.url) + '">' + esc_(p.texto) + '</a>' : esc_(p.texto);
  }).join('');
}

function partesTexto_(partes) {
  return partes.map(function (p) {
    if (typeof p === 'string') return p;
    return p.url && p.url.replace('https://', '').replace(/\/$/, '') !== p.texto ? p.texto + ' (' + p.url + ')' : p.texto;
  }).join('');
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/** Comprueba la configuración y lo escribe en el registro de ejecución. Ejecútalo también si cambias el alias de info@. */
function comprobarConfiguracion() {
  const props = PropertiesService.getScriptProperties();
  olvidarAlias_(); // vuelve a comprobar el alias en el siguiente envío
  const info = {
    version: AJUSTES.VERSION,
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
