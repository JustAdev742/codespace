// Films the "Built for school" proof on a phone: an 11-year-old's privacy defaults, and the accessibility
// settings changing the app live (text size, high contrast).
import { mkdirSync } from 'node:fs';
import { startCast } from './cast.mts';
import { launch, pause, PHONE, BASE } from './rig.mts';

const OUT = process.argv[2]!;
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: PHONE, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
// The local server is a development build, so the header carries a "Dev" badge that production does not show.
await ctx.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = 'span[title^="Test environment"] { display: none !important; }';
    document.head.appendChild(style);
  });
});
const page = await ctx.newPage();
await page.goto('/');
const username = `zara${Date.now().toString(36).slice(-6)}`;
console.log(
  'register',
  await page.evaluate(async (u) => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ludora-csrf': '1' }, body: JSON.stringify({ username: u, password: 'a long trailer passphrase', displayName: 'Zara', accountType: 'student', birthYear: 2015 }) });
    return r.status;
  }, username),
);
await page.goto('/settings');
await page.getByRole('heading', { name: 'Privacy' }).waitFor();
await pause(1200);
await page.screenshot({ path: `${OUT}/settings-full-phone.png`, fullPage: true });
await page.getByRole('heading', { name: 'Privacy' }).scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -80));
await pause(600);
await page.screenshot({ path: `${OUT}/privacy-phone.png` });
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('heading', { name: /Appearance and accessibility/ }).scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -60));
await pause(800);
await page.screenshot({ path: `${OUT}/access-before.png` });
const cast = await startCast(page, `${OUT}/access`);
await pause(700);
await page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Larger' }).click();
await pause(1300);
await page.getByRole('switch', { name: 'High contrast' }).click();
await pause(1500);
console.log('access', await cast.stop());
await page.screenshot({ path: `${OUT}/access-after.png` });
await page.goto('/');
await pause(1500);
await page.screenshot({ path: `${OUT}/home-a11y-phone.png` });
await browser.close();
