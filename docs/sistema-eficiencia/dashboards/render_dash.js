const { chromium } = require('playwright');
const path = require('path');
const files = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  for (const f of files) {
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('JS error in', f, e.message));
    await page.goto('file://' + path.resolve(f), { waitUntil: 'networkidle' });
    await page.screenshot({ path: f.replace(/\.html$/, '.png'), clip: { x: 0, y: 0, width: 1600, height: 900 } });
    // overflow check: elements extending past the viewport
    const ov = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.card, .grid').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 902 || r.right > 1602) out.push(el.className + ' bottom=' + Math.round(r.bottom) + ' right=' + Math.round(r.right));
        if (el.classList.contains('card') && el.scrollHeight > el.clientHeight + 2) out.push('card overflow: ' + (el.querySelector('h3')?.textContent || '').slice(0,40) + ' ' + el.scrollHeight + '>' + el.clientHeight);
      });
      return out;
    });
    console.log(f, ov.length ? ov : 'ok');
    await page.close();
  }
  await browser.close();
})();
