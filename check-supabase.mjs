import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://supabase.com/dashboard/projects');
// Attends que tu te connectes manuellement si besoin
await page.waitForTimeout(30000);
await page.screenshot({ path: 'supabase-status.png', fullPage: true });
console.log('Screenshot saved: supabase-status.png');
await browser.close();
