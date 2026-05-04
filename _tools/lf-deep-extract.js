const { chromium } = require('playwright');
const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '_research', 'raw', 'lightfield-extraction', 'deep');
const LF_BASE = 'https://crm.lightfield.app';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function save(filename, data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), content);
  console.log(`  [saved] ${filename}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: true });
  console.log(`  [screenshot] ${name}`);
}

async function login(page) {
  await page.goto(`${LF_BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const emailInput = await page.$('input[type="email"], input[placeholder*="email"], input[placeholder*="work email"]');
  if (emailInput) {
    await emailInput.fill('lf-signup@elevay.dev');
    await page.waitForTimeout(300);
    const btn = await page.$('button[type="submit"], form button');
    if (btn) await btn.click(); else await emailInput.press('Enter');
    console.log('[AUTH] Magic link requested...');
    await page.waitForTimeout(3000);
  }

  const conn = await imapSimple.connect({
    imap: { user: 'martin@elevay.dev', password: '1EjU7nGru2Ve', host: 'imappro.zoho.com', port: 993, tls: true, authTimeout: 10000, tlsOptions: { rejectUnauthorized: false } }
  });
  await conn.openBox('INBOX');

  for (let i = 0; i < 60; i++) {
    const msgs = await conn.search([['SINCE', new Date().toISOString().split('T')[0]]], { bodies: ['HEADER', ''], markSeen: false });
    msgs.sort((a, b) => (b.attributes?.uid || 0) - (a.attributes?.uid || 0));
    for (const msg of msgs.slice(0, 5)) {
      const hdr = msg.parts.find(p => p.which === 'HEADER')?.body;
      const from = (hdr?.from?.[0] || '').toLowerCase();
      const subj = (hdr?.subject?.[0] || '').toLowerCase();
      if (from.includes('lightfield') || subj.includes('login link')) {
        const body = msg.parts.find(p => p.which === '')?.body;
        if (!body) continue;
        const parsed = await simpleParser(body);
        const allText = (parsed.html || '') + '\n' + (parsed.text || '');
        const urls = [...allText.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(m => m[0].replace(/[)"'>]+$/, '').replace(/&amp;/g, '&'));
        const magicLink = urls.filter(l => l.length > 40 && (l.includes('stytch') || l.includes('lightfield'))).sort((a,b) => b.length - a.length)[0];
        if (magicLink) {
          console.log(`[AUTH] Found magic link`);
          conn.end();
          await page.goto(magicLink, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          if (!page.url().includes('/crm/')) {
            await page.goto(`${LF_BASE}/crm/up-next`, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(2000);
          }
          console.log(`[AUTH] Logged in: ${page.url()}`);
          return true;
        }
      }
    }
    if (i % 5 === 0) console.log(`[AUTH] Waiting for email... (${i*2}s)`);
    await new Promise(r => setTimeout(r, 2000));
  }
  conn.end();
  return false;
}

async function main() {
  console.log('=== LIGHTFIELD DEEP EXTRACTION ===\n');

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  if (!await login(page)) { console.log('LOGIN FAILED'); await browser.close(); process.exit(1); }

  // ===== 1. SKILLS (top-level nav) =====
  console.log('\n--- 1. SKILLS ---');
  for (const url of ['/crm/skills', '/crm/knowledge/skills', '/crm/settings/agent/skills']) {
    await page.goto(`${LF_BASE}${url}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    if (!content.includes('not found') && !content.includes('404') && content.length > 200) {
      console.log(`  [found] Skills at ${url}`);
      await screenshot(page, 'skills-main');
      save('skills-main.html', await page.content());
      break;
    }
  }
  // Try clicking Skills in sidebar
  const skillsLink = await page.$('a:has-text("Skills"), [href*="skill"]');
  if (skillsLink) {
    await skillsLink.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'skills-clicked');
    save('skills-clicked.html', await page.content());
    console.log(`  [url] ${page.url()}`);
  }

  // Capture all visible skill names
  const skillItems = await page.$$eval('[class*="skill"], [data-testid*="skill"], li, [role="listitem"], .card, [class*="card"]', els =>
    els.map(el => el.textContent?.trim()).filter(t => t && t.length > 5 && t.length < 300)
  ).catch(() => []);
  if (skillItems.length > 0) {
    save('skills-list.json', skillItems);
    console.log(`  [skills] ${skillItems.length} items found`);
  }

  // ===== 2. KNOWLEDGE (top-level nav) =====
  console.log('\n--- 2. KNOWLEDGE ---');
  for (const url of ['/crm/knowledge', '/crm/knowledge/files', '/crm/settings/knowledge']) {
    await page.goto(`${LF_BASE}${url}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    if (!content.includes('not found') && content.length > 200) {
      console.log(`  [found] Knowledge at ${url}`);
      await screenshot(page, 'knowledge-main');
      save('knowledge-main.html', await page.content());
      break;
    }
  }
  const knowledgeLink = await page.$('a:has-text("Knowledge"), [href*="knowledge"]');
  if (knowledgeLink) {
    await knowledgeLink.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'knowledge-clicked');
    save('knowledge-clicked.html', await page.content());
    console.log(`  [url] ${page.url()}`);
  }

  // ===== 3. SETTINGS — correct pages =====
  console.log('\n--- 3. SETTINGS PAGES ---');
  const settingsPages = [
    'general', 'mail-and-calendar', 'notifications', 'recording', 'agent',
    'connectors', 'security', 'members', 'meetings', 'data-model',
    'opportunity-stages', 'tasks', 'workflows', 'import-history',
    'billing', 'integrations', 'api-keys'
  ];
  for (const pg of settingsPages) {
    try {
      await page.goto(`${LF_BASE}/crm/settings/${pg}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1500);
      const content = await page.textContent('body');
      if (content.includes('not found')) {
        console.log(`  [404] settings/${pg}`);
        continue;
      }
      await screenshot(page, `settings-${pg}`);
      save(`settings-${pg}.html`, await page.content());
      console.log(`  [ok] settings/${pg}`);
    } catch (e) {
      console.log(`  [err] settings/${pg}: ${e.message.substring(0, 60)}`);
    }
  }

  // ===== 4. CHAT — test Skills invocation + Knowledge =====
  console.log('\n--- 4. CHAT TESTS ---');
  const chatQueries = [
    'List all available skills you can run for me',
    'What knowledge do you have about my business?',
    'Run the "Find Next Best Action" skill for my deals',
    'Show me the data model — what fields exist on accounts?',
  ];

  for (let i = 0; i < chatQueries.length; i++) {
    try {
      await page.goto(`${LF_BASE}/crm/agent`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const input = await page.$('textarea, input[placeholder*="Ask"], [contenteditable="true"]');
      if (!input) { console.log('  [skip] No chat input found'); break; }

      await input.fill(chatQueries[i]);
      await page.waitForTimeout(500);

      // Find send button — try multiple selectors
      const sendBtn = await page.$('button[type="submit"]')
        || await page.$('button[aria-label*="send" i]')
        || await page.$('button:has(svg):last-of-type');

      if (sendBtn) {
        await sendBtn.click();
        console.log(`  [chat ${i+1}] "${chatQueries[i].substring(0, 50)}..." — waiting 30s`);
        await page.waitForTimeout(30000);
        await screenshot(page, `chat-${i+1}-response`);

        // Extract response text
        const responseEls = await page.$$('[class*="message"], [class*="response"], [class*="assistant"], [data-role="assistant"]');
        let responseText = '';
        for (const el of responseEls) {
          responseText += (await el.textContent().catch(() => '')) + '\n---\n';
        }
        if (responseText.trim()) {
          save(`chat-${i+1}-response.txt`, responseText);
        }

        // Also save full page HTML for parsing later
        save(`chat-${i+1}-page.html`, await page.content());
      } else {
        console.log(`  [chat ${i+1}] No send button found`);
        await screenshot(page, `chat-${i+1}-no-send`);
      }
    } catch (e) {
      console.log(`  [chat ${i+1}] Error: ${e.message.substring(0, 80)}`);
    }
  }

  // ===== 5. API KEY GENERATION =====
  console.log('\n--- 5. API KEY ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/api-keys`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    const createBtn = await page.$('button:has-text("Create API key"), button:has-text("Create")');
    if (createBtn) {
      await createBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'api-key-create-dialog');
      save('api-key-create-dialog.html', await page.content());

      // Fill name
      const nameInput = await page.$('input[placeholder*="name" i], input[name="name"], input:first-of-type');
      if (nameInput) {
        await nameInput.fill('elevay-extraction');
        await page.waitForTimeout(500);

        // Look for scope checkboxes and check all
        const checkboxes = await page.$$('input[type="checkbox"], [role="checkbox"]');
        for (const cb of checkboxes) {
          const checked = await cb.isChecked().catch(() => false);
          if (!checked) await cb.click().catch(() => {});
        }
        await page.waitForTimeout(500);
        await screenshot(page, 'api-key-scopes-selected');

        // Submit
        const submitBtn = await page.$('button:has-text("Create"), button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          await screenshot(page, 'api-key-created');
          save('api-key-created.html', await page.content());

          // Try to find the key value
          const keyText = await page.textContent('body');
          const keyMatch = keyText.match(/sk_lf_\w+/);
          if (keyMatch) {
            console.log(`  [API KEY] ${keyMatch[0].substring(0, 20)}...`);
            save('api-key.txt', keyMatch[0]);
          }
        }
      }
    }
  } catch (e) {
    console.log(`  [API KEY] Error: ${e.message.substring(0, 80)}`);
  }

  // ===== 6. ACCOUNT DETAIL + OPPORTUNITIES =====
  console.log('\n--- 6. RECORD DETAILS ---');
  try {
    await page.goto(`${LF_BASE}/crm/accounts`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Click first account
    const firstAccount = await page.$('table tbody tr:first-child td:first-child a, table tbody tr:first-child a, [role="row"]:nth-child(2) a');
    if (firstAccount) {
      await firstAccount.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'account-detail');
      save('account-detail.html', await page.content());
      console.log(`  [ok] account detail: ${page.url()}`);

      // Check for tabs/sections
      const tabs = await page.$$eval('button[role="tab"], [class*="tab"], nav a', els => els.map(e => e.textContent?.trim()).filter(Boolean));
      if (tabs.length) save('account-detail-tabs.json', tabs);
    }
  } catch (e) {
    console.log(`  [err] account detail: ${e.message.substring(0, 80)}`);
  }

  try {
    await page.goto(`${LF_BASE}/crm/opportunities`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'opportunities-list');

    const firstOpp = await page.$('table tbody tr:first-child a, [role="row"]:nth-child(2) a');
    if (firstOpp) {
      await firstOpp.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'opportunity-detail');
      save('opportunity-detail.html', await page.content());
      console.log(`  [ok] opportunity detail: ${page.url()}`);
    }
  } catch (e) {
    console.log(`  [err] opportunities: ${e.message.substring(0, 80)}`);
  }

  // ===== 7. WORKFLOWS =====
  console.log('\n--- 7. WORKFLOWS ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/workflows`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'workflows-page');
    save('workflows-page.html', await page.content());

    const createWf = await page.$('button:has-text("Create"), button:has-text("New workflow")');
    if (createWf) {
      await createWf.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'workflow-create-dialog');
      save('workflow-create-dialog.html', await page.content());
    }
  } catch (e) {
    console.log(`  [err] workflows: ${e.message.substring(0, 80)}`);
  }

  // ===== 8. CONNECTORS =====
  console.log('\n--- 8. CONNECTORS ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/connectors`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'connectors-page');
    save('connectors-page.html', await page.content());
    console.log(`  [ok] connectors`);
  } catch (e) {
    console.log(`  [err] connectors: ${e.message.substring(0, 80)}`);
  }

  // ===== 9. DATA MODEL =====
  console.log('\n--- 9. DATA MODEL ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/data-model`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'data-model-page');
    save('data-model-page.html', await page.content());

    // Click through each object type tab if available
    const objectTabs = await page.$$('button[role="tab"], [class*="tab"] button, nav button');
    for (let t = 0; t < Math.min(objectTabs.length, 6); t++) {
      const label = await objectTabs[t].textContent().catch(() => `tab-${t}`);
      await objectTabs[t].click().catch(() => {});
      await page.waitForTimeout(1500);
      await screenshot(page, `data-model-${label.trim().toLowerCase().replace(/\s+/g, '-')}`);
    }
    console.log(`  [ok] data model`);
  } catch (e) {
    console.log(`  [err] data model: ${e.message.substring(0, 80)}`);
  }

  // ===== 10. OPPORTUNITY STAGES =====
  console.log('\n--- 10. OPPORTUNITY STAGES ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/opportunity-stages`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'opportunity-stages');
    save('opportunity-stages.html', await page.content());
    console.log(`  [ok] opportunity stages`);
  } catch (e) {
    console.log(`  [err] opportunity stages: ${e.message.substring(0, 80)}`);
  }

  console.log('\n=== DEEP EXTRACTION COMPLETE ===');
  console.log(`Files: ${fs.readdirSync(OUTPUT_DIR).length}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
