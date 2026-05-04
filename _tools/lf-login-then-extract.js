const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '_research', 'raw', 'lightfield-extraction');
const LF_BASE = 'https://crm.lightfield.app';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const graphqlRequests = [];
const restRequests = [];

function saveJSON(filename, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`[OK] ${filename}`);
}
function saveText(filename, text) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), text);
  console.log(`[OK] ${filename}`);
}
function formatType(type) {
  if (!type) return '?';
  if (type.kind === 'NON_NULL') return `${formatType(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${formatType(type.ofType)}]`;
  return type.name || '?';
}

async function main() {
  console.log('=== LIGHTFIELD EXTRACTION ===');
  console.log('Lancement du navigateur...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
    channel: 'chrome'
  });

  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Network capture
  page.on('request', req => {
    const url = req.url();
    const postData = req.postData();
    if (postData && (url.includes('graphql') || url.includes('gql'))) {
      try {
        const body = JSON.parse(postData);
        const ops = Array.isArray(body) ? body : [body];
        for (const op of ops) {
          graphqlRequests.push({ url, operationName: op.operationName || '?', query: op.query, variables: op.variables });
        }
      } catch (e) {}
    }
    if (url.includes('/api/') && !url.includes('_next')) {
      restRequests.push({ url, method: req.method(), body: postData?.substring(0, 500) });
    }
  });

  // Go to login and use magic link
  await page.goto(`${LF_BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('[AUTH] Entering email for magic link...');
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email"], input[placeholder*="work email"]');
  if (emailInput) {
    await emailInput.fill('lf-signup@elevay.dev');
    await page.waitForTimeout(500);
    // Click the arrow/submit button next to the email input
    const submitBtn = await page.$('button[type="submit"], form button, input[type="email"] ~ button, button[aria-label*="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await emailInput.press('Enter');
    }
    console.log('[AUTH] Magic link requested for lf-signup@elevay.dev');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'after-email-submit.png'), fullPage: true });
  }

  // Check IMAP for magic link
  console.log('[AUTH] Checking IMAP for magic link...');
  const imapSimple = require('imap-simple');
  const { simpleParser } = require('mailparser');
  const imapConfig = {
    imap: {
      user: 'martin@elevay.dev',
      password: '1EjU7nGru2Ve',
      host: 'imappro.zoho.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  let authenticated = false;
  try {
    const conn = await imapSimple.connect(imapConfig);
    await conn.openBox('INBOX');

    for (let attempt = 0; attempt < 60; attempt++) {
      const sinceDate = new Date().toISOString().split('T')[0];
      const msgs = await conn.search([['SINCE', sinceDate]], { bodies: ['HEADER', ''], markSeen: false });
      msgs.sort((a, b) => (b.attributes?.uid || 0) - (a.attributes?.uid || 0));

      for (const msg of msgs.slice(0, 5)) {
        const hdr = msg.parts.find(p => p.which === 'HEADER')?.body;
        const from = (hdr?.from?.[0] || '').toLowerCase();
        const subj = (hdr?.subject?.[0] || '').toLowerCase();

        if (from.includes('lightfield') || from.includes('stytch') || subj.includes('lightfield') || subj.includes('log in') || subj.includes('sign in') || subj.includes('magic')) {
          console.log(`[IMAP] Found: FROM=${hdr?.from?.[0]} SUBJ=${hdr?.subject?.[0]}`);
          const body = msg.parts.find(p => p.which === '')?.body;
          if (!body) continue;
          const parsed = await simpleParser(body);
          const html = parsed.html || '';
          const text = parsed.text || '';
          const allText = html + '\n' + text;

          // Find the actual magic link (has token, not just homepage)
          const urlMatches = [...allText.matchAll(/https?:\/\/[^\s"'<>]+/gi)];
          const allLinks = [];
          for (const m of urlMatches) {
            const link = m[0].replace(/[)"'>]+$/, '').replace(/&amp;/g, '&');
            allLinks.push(link);
          }
          console.log(`[IMAP] All URLs in email (${allLinks.length}):`);
          allLinks.forEach((l, i) => console.log(`  [${i}] ${l.substring(0, 120)}`));

          // Find the magic link: longest URL containing token/authenticate/magic/login
          const magicLink = allLinks
            .filter(l => !(/\.(png|jpg|gif|css|ico|svg)/i.test(l)))
            .filter(l => !(/unsubscribe|privacy|terms|mailto/i.test(l)))
            .filter(l => l.length > 40) // real magic links are long (have tokens)
            .filter(l => l.includes('lightfield') || l.includes('stytch'))
            .sort((a, b) => b.length - a.length)[0]; // longest = most likely the token URL

          if (magicLink) {
            console.log(`[IMAP] Magic link: ${magicLink.substring(0, 120)}...`);
            conn.end();

            await page.goto(magicLink, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(5000);
            let url = page.url();
            console.log(`[AUTH] After magic link: ${url}`);

            if (!url.includes('/crm/')) {
              console.log('[AUTH] Redirected to homepage, trying /crm/up-next with cookies...');
              await page.goto(`${LF_BASE}/crm/up-next`, { waitUntil: 'networkidle', timeout: 15000 });
              await page.waitForTimeout(3000);
              url = page.url();
              console.log(`[AUTH] After redirect: ${url}`);
            }

            if (url.includes('/crm/')) {
              authenticated = true;
            }
            break;
          }
          if (authenticated) break;
        }
      }
      if (authenticated) break;

      if (attempt % 5 === 0) console.log(`[IMAP] Attempt ${attempt + 1}/60 - waiting for magic link email...`);
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!authenticated) conn.end();
  } catch (e) {
    console.log(`[IMAP] Error: ${e.message}`);
  }

  // Fallback: check ALL tabs or try navigating with existing cookies
  if (!authenticated) {
    console.log('[AUTH] Checking all tabs and trying with cookies...');
    for (let attempt = 0; attempt < 90; attempt++) {
      // Check all open pages in context
      const allPages = context.pages();
      for (const p of allPages) {
        if (p.url().includes('lightfield.app/crm/')) {
          page = p;
          authenticated = true;
          console.log(`[AUTH OK] Found authenticated tab: ${p.url()}`);
          break;
        }
      }
      if (authenticated) break;

      // Every 10 attempts, try navigating the original page to /crm/ with cookies
      if (attempt % 10 === 0 && attempt > 0) {
        try {
          await page.goto(`${LF_BASE}/crm/up-next`, { waitUntil: 'networkidle', timeout: 10000 });
          const url = page.url();
          if (url.includes('/crm/')) {
            authenticated = true;
            console.log(`[AUTH OK] Cookie auth worked: ${url}`);
            break;
          }
        } catch (e) {}
      }
      await page.waitForTimeout(2000);
      if (attempt % 5 === 0) console.log(`[AUTH] Waiting... (${attempt * 2}s)`);
    }
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'post-login.png'), fullPage: true });

  // ===== PHASE 1: Navigate all pages =====
  console.log('\n--- PHASE 1: Navigation de toutes les pages ---');
  const pages = [
    'up-next', 'accounts', 'contacts', 'opportunities',
    'tasks', 'meetings', 'notes', 'agent',
    'settings/profile', 'settings/mail-and-calendar', 'settings/knowledge',
    'settings/agent', 'settings/api-keys', 'settings/integrations',
    'settings/members', 'settings/billing', 'settings/skills',
    'settings/workspace', 'settings/notifications', 'settings/mcp'
  ];

  for (const pg of pages) {
    const url = `${LF_BASE}/crm/${pg}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `page-${pg.replace('/', '-')}.png`), fullPage: true });
      saveText(`page-${pg.replace('/', '-')}.html`, await page.content());
      console.log(`  [page] ${pg}`);

      // On accounts: click first row for detail
      if (pg === 'accounts') {
        const row = await page.$('table tbody tr:first-child a, [role="row"] a');
        if (row) {
          await row.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: path.join(OUTPUT_DIR, 'page-account-detail.png'), fullPage: true });
          saveText('page-account-detail.html', await page.content());
          console.log('  [page] account-detail');
        }
      }
    } catch (e) {
      console.log(`  [skip] ${pg}: ${e.message.substring(0, 80)}`);
    }
  }

  // Save captured traffic
  saveJSON('graphql-requests.json', graphqlRequests);
  saveJSON('rest-requests.json', restRequests);
  console.log(`\n  GraphQL ops captured: ${[...new Set(graphqlRequests.map(r => r.operationName))].length}`);
  console.log(`  REST endpoints captured: ${restRequests.length}`);

  // ===== PHASE 2: GraphQL Introspection =====
  console.log('\n--- PHASE 2: GraphQL Introspection ---');
  const gqlEndpoints = [...new Set(graphqlRequests.map(r => r.url))];
  const commonEndpoints = [`${LF_BASE}/graphql`, `${LF_BASE}/api/graphql`, 'https://api.lightfield.app/graphql'];
  const allEndpoints = [...gqlEndpoints, ...commonEndpoints];

  const introspectionQuery = `query { __schema { queryType{name} mutationType{name} types { kind name description fields(includeDeprecated:true) { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } inputFields { name type { kind name ofType { kind name } } } enumValues { name } } } }`;

  for (const ep of [...new Set(allEndpoints)]) {
    try {
      const result = await page.evaluate(async ({ url, query }) => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ query }) });
        if (!r.ok) return { status: r.status };
        return { status: r.status, data: await r.json() };
      }, { url: ep, query: introspectionQuery });

      if (result.data?.data?.__schema || result.data?.__schema) {
        console.log(`  [INTROSPECTION OK] ${ep}`);
        saveJSON('graphql-introspection.json', result.data);
        const schema = result.data.data?.__schema || result.data.__schema;
        const userTypes = schema.types.filter(t => !t.name.startsWith('__'));
        saveJSON('graphql-types-summary.json', userTypes.map(t => ({
          name: t.name, kind: t.kind,
          fields: t.fields?.map(f => `${f.name}: ${formatType(f.type)}`),
          enums: t.enumValues?.map(e => e.name)
        })));
        break;
      } else {
        console.log(`  [${result.status}] ${ep}`);
      }
    } catch (e) {
      console.log(`  [err] ${ep}: ${e.message.substring(0, 60)}`);
    }
  }

  // ===== PHASE 3: API Key =====
  console.log('\n--- PHASE 3: API Key ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/api-keys`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'api-keys-page.png'), fullPage: true });
    saveText('api-keys-page.html', await page.content());

    // Check for existing keys
    const keyText = await page.textContent('body');
    if (keyText.includes('sk_lf_')) {
      const match = keyText.match(/sk_lf_\w+/);
      if (match) {
        console.log(`  [API KEY] Found: ${match[0].substring(0, 15)}...`);
        saveText('api-key.txt', match[0]);
      }
    } else {
      console.log('  [API KEY] No existing key found');
    }
  } catch (e) {
    console.log(`  [API KEY] Error: ${e.message.substring(0, 80)}`);
  }

  // ===== PHASE 4: Skills =====
  console.log('\n--- PHASE 4: Skills ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/skills`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'skills-page.png'), fullPage: true });
    saveText('skills-page.html', await page.content());
    console.log('  [OK] Skills page captured');
  } catch (e) {
    console.log(`  [skip] ${e.message.substring(0, 80)}`);
  }

  // ===== PHASE 5: Knowledge =====
  console.log('\n--- PHASE 5: Knowledge ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/knowledge`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'knowledge-page.png'), fullPage: true });
    saveText('knowledge-page.html', await page.content());
    console.log('  [OK] Knowledge page captured');
  } catch (e) {
    console.log(`  [skip] ${e.message.substring(0, 80)}`);
  }

  // ===== PHASE 6: MCP Settings =====
  console.log('\n--- PHASE 6: MCP & Integrations ---');
  try {
    await page.goto(`${LF_BASE}/crm/settings/mcp`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'mcp-page.png'), fullPage: true });
    saveText('mcp-page.html', await page.content());
  } catch (e) {}
  try {
    await page.goto(`${LF_BASE}/crm/settings/integrations`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'integrations-page.png'), fullPage: true });
    saveText('integrations-page.html', await page.content());
  } catch (e) {}

  // ===== PHASE 7: Export =====
  console.log('\n--- PHASE 7: Export ---');
  for (const entity of ['accounts', 'contacts', 'opportunities']) {
    try {
      await page.goto(`${LF_BASE}/crm/${entity}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      const exportBtn = await page.$('button:has-text("Export"), button:has-text("Import")');
      if (exportBtn) {
        await exportBtn.click();
        await page.waitForTimeout(1000);
        const csvBtn = await page.$('[role="menuitem"]:has-text("Export"), button:has-text("Export CSV"), button:has-text("CSV")');
        if (csvBtn) {
          await csvBtn.click();
          await page.waitForTimeout(3000);
          console.log(`  [export] ${entity} triggered`);
        }
      }
    } catch (e) {}
  }

  // ===== PHASE 8: Chat — test Skills invocation =====
  console.log('\n--- PHASE 8: Chat tests ---');
  try {
    await page.goto(`${LF_BASE}/crm/agent`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const chatInput = await page.$('textarea, input[placeholder*="Ask"]');
    if (chatInput) {
      await chatInput.fill('List all available skills you can run for me');
      const sendBtn = await page.$('button[type="submit"], button[aria-label*="send"], button:has(svg)');
      if (sendBtn) {
        await sendBtn.click();
        console.log('  [chat] Query sent, waiting 25s...');
        await page.waitForTimeout(25000);
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'chat-skills-list.png'), fullPage: true });
        saveText('chat-skills-list.html', await page.content());
        console.log('  [chat] Skills list response captured');
      }
    }
  } catch (e) {
    console.log(`  [chat] Error: ${e.message.substring(0, 80)}`);
  }

  // Final summary
  const gqlOps = [...new Set(graphqlRequests.map(r => r.operationName))];
  const restEps = [...new Set(restRequests.map(r => `${r.method} ${r.url}`))];
  const screenshots = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));

  const summary = {
    timestamp: new Date().toISOString(),
    graphqlOperations: gqlOps,
    graphqlOperationCount: gqlOps.length,
    restEndpoints: restEps,
    restEndpointCount: restEps.length,
    screenshotCount: screenshots.length,
    files: fs.readdirSync(OUTPUT_DIR).length
  };
  saveJSON('extraction-summary.json', summary);

  console.log('\n=== EXTRACTION TERMINEE ===');
  console.log(`  GraphQL operations: ${gqlOps.length}`);
  console.log(`  REST endpoints: ${restEps.length}`);
  console.log(`  Screenshots: ${screenshots.length}`);
  console.log(`  Total files: ${summary.files}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  // Save final traffic
  saveJSON('graphql-requests-final.json', graphqlRequests);
  saveJSON('rest-requests-final.json', restRequests);

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
