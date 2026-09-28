// Accesibilidad con axe-core (WCAG 2.2 A/AA) en las páginas nuevas, en estado normal y con errores.
const { chromium } = require('playwright');
const fs = require('fs');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const Q = '?endpoint=' + encodeURIComponent('http://localhost:8081/') + '&sitekey=1x00000000000000000000AA';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.turnstile={render(){return 1},reset(){}};' }));
  let total = 0;
  for (const [ruta, conErrores] of [['/tarjeta/', false], ['/tarjeta/', true], ['/automatiza/', false], ['/automatiza/', true], ['/privacidad/', false], ['/', false]]) {
    await page.goto('http://localhost:8080' + ruta + Q);
    if (conErrores) { await page.click('button[type=submit]'); await page.waitForSelector('#resumen-errores.visible'); }
    await page.addScriptTag({ content: axe });
    const r = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations);
    total += r.length;
    console.log(ruta + (conErrores ? ' (con errores)' : ''), r.length ? '' : '✓ sin incidencias');
    r.forEach((v) => console.log('  ✗', v.id, v.impact, '-', v.help, '→', v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')));
  }
  await browser.close();
  process.exit(total ? 1 : 0);
})();
