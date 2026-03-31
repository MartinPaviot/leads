#!/usr/bin/env node
/**
 * check-email.js — Check catch-all inbox for verification emails
 * Usage: node check-email.js "target@domain.com" "keyword"
 * Returns JSON: {found, from, subject, links, codes} or {found: false}
 */

const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const bootstrap = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '_credentials', 'bootstrap.json'), 'utf8')
);

const TARGET_EMAIL = process.argv[2];
const KEYWORD = (process.argv[3] || '').toLowerCase();
const TIMEOUT_MS = 120_000;
const POLL_MS = 5_000;

if (!TARGET_EMAIL) {
  console.log(JSON.stringify({ error: 'Usage: node check-email.js <email> [keyword]' }));
  process.exit(1);
}

const config = {
  imap: {
    user: bootstrap.email.imap_user,
    password: bootstrap.email.imap_password,
    host: bootstrap.email.imap_host,
    port: bootstrap.email.imap_port,
    tls: true,
    authTimeout: 10_000,
    tlsOptions: { rejectUnauthorized: false },
  },
};

function extractLinks(text) {
  const urlRe = /https?:\/\/[^\s"'<>\])}]+/g;
  return [...new Set((text || '').match(urlRe) || [])];
}

function extractCodes(text) {
  const codeRe = /\b(\d{4,8})\b/g;
  const matches = [];
  let m;
  while ((m = codeRe.exec(text || ''))) matches.push(m[1]);
  return [...new Set(matches)];
}

async function poll() {
  const start = Date.now();
  let connection;

  try {
    connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    while (Date.now() - start < TIMEOUT_MS) {
      const searchCriteria = ['UNSEEN', ['TO', TARGET_EMAIL]];
      const fetchOptions = { bodies: [''], markSeen: false };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const msg of messages) {
        const raw = msg.parts.find((p) => p.which === '');
        if (!raw) continue;

        const parsed = await simpleParser(raw.body);
        const subject = (parsed.subject || '').toLowerCase();

        if (KEYWORD && !subject.includes(KEYWORD)) continue;

        // Mark as seen
        const uid = msg.attributes.uid;
        await connection.addFlags(uid, ['\\Seen']);

        const bodyText = (parsed.text || '') + ' ' + (parsed.html || '');
        const links = extractLinks(bodyText);
        const codes = extractCodes(parsed.text || '');

        console.log(
          JSON.stringify({
            found: true,
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            links,
            codes,
          })
        );
        connection.end();
        return;
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    console.log(JSON.stringify({ found: false }));
    connection.end();
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    if (connection) connection.end();
    process.exit(1);
  }
}

poll();
