// Скриншоты сайта на телефоне и компьютере + проверка ошибок JS.
// Запуск из корня репозитория: node .claude/skills/site-engineer/screenshots.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'preview');
const PORT = 8125;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

async function scrollTo(page, selector) {
  await page.evaluate(s => {
    document.documentElement.style.scrollBehavior = 'auto';
    const el = document.querySelector(s);
    if (el) el.scrollIntoView();
  }, selector);
  await page.waitForTimeout(300);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const url = `http://localhost:${PORT}/`;
  const browser = await chromium.launch();
  const problems = [];

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  p.on('pageerror', e => problems.push('Ошибка JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/yandex|fonts|ERR_/i.test(m.text())) problems.push('Консоль: ' + m.text()); });
  p.on('response', r => { if (r.status() === 404) problems.push('Не найден файл: ' + r.url().replace(url, '')); });
  await p.goto(url, { waitUntil: 'networkidle' });

  const dishes = await p.locator('.dish').count();
  if (!dishes) problems.push('Меню не отобразилось');
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push('На телефоне есть горизонтальная прокрутка');

  await p.screenshot({ path: path.join(OUT, '1-telefon-glavnaya.png') });
  await scrollTo(p, '#menu');
  await p.screenshot({ path: path.join(OUT, '2-telefon-menu.png') });
  await scrollTo(p, '#how');
  await p.screenshot({ path: path.join(OUT, '3-telefon-kak-zakazat.png') });
  await scrollTo(p, '#contacts');
  await p.screenshot({ path: path.join(OUT, '4-telefon-kontakty.png') });
  await p.locator('.sticky-order button').click();
  await p.waitForTimeout(200);
  if (!(await p.evaluate(() => document.getElementById('order-dialog').open))) problems.push('Окно «Заказать» не открылось');
  await p.screenshot({ path: path.join(OUT, '5-telefon-okno-zakaza.png') });

  const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await d.goto(url, { waitUntil: 'networkidle' });
  await d.screenshot({ path: path.join(OUT, '6-kompyuter-glavnaya.png') });
  await scrollTo(d, '#menu');
  await d.screenshot({ path: path.join(OUT, '7-kompyuter-menu.png') });

  await browser.close();
  server.close();

  console.log(`Блюд на странице: ${dishes}`);
  console.log(`Скриншоты: ${OUT}`);
  if (problems.length) {
    problems.forEach(x => console.log('ПРОБЛЕМА:', x));
    process.exit(1);
  }
  console.log('Проблем не найдено');
})().catch(e => { console.error(e); server.close(); process.exit(1); });
