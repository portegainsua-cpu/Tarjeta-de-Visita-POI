// Simula la aplicación web de Apps Script ejecutando el Code.gs real con servicios de Google falsos.
// POST / → doPost ; GET /registro → lo que se ha guardado y enviado.
const http = require('http');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filas = [];
const enviados = [];
const cache = {};
let cabeceras;
let forzar = null; // respuesta forzada para probar errores

const hoja = {
  getLastColumn: () => cabeceras.length,
  getLastRow: () => filas.length + 1,
  getRange: (r, c, nr, nc) => ({
    getValues: () => [cabeceras.slice(c - 1, c - 1 + nc)],
    setValue: (v) => { filas[r - 2][c - 1] = v; },
  }),
  appendRow: (f) => filas.push(f),
};
const ctx = {
  console,
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => s }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ TURNSTILE_SECRET: 's', TEST_MODE: 'false' })[k] }) },
  UrlFetchApp: {
    fetch: (u, o) => ({
      getContentText: () => JSON.stringify({
        success: o.payload.response === 'XXXX.DUMMY.TOKEN.XXXX',
        hostname: 'founder.airesolutionlabs.com',
      }),
    }),
  },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k], put: (k, v) => { cache[k] = v; } }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2, 10) + '-x', base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64') },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => hoja, getUrl: () => 'https://sheet' }) },
  MailApp: { getRemainingDailyQuota: () => 100 },
  GmailApp: { getAliases: () => ['info@airesolutionlabs.com'], sendEmail: (to, asunto, texto, o) => enviados.push({ to, asunto, texto, o }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'cuenta@gmail.com' }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
cabeceras = vm.runInContext('CABECERAS', ctx).slice();

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'GET' && req.url === '/registro') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({ cabeceras, filas, enviados }));
  }
  if (req.method === 'GET' && req.url.startsWith('/forzar')) {
    const q = new URL(req.url, 'http://x').searchParams.get('r');
    forzar = q ? JSON.parse(q) : null;
    res.writeHead(200, cors);
    return res.end('{}');
  }
  if (req.method === 'OPTIONS') {
    // Apps Script NO responde a OPTIONS: si el navegador hiciera preflight, fallaría. Lo simulamos igual.
    res.writeHead(405);
    return res.end();
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.writeHead(200, cors);
    if (forzar) return res.end(JSON.stringify(forzar));
    res.end(ctx.doPost({ postData: { contents: body } }));
  });
}).listen(8081, () => console.log('simulador en :8081'));
