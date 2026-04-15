#!/usr/bin/env node
/**
 * check-email.js — Check catch-all inbox for verification emails
 * Usage: node check-email.js "target@domain.com" "keyword"
 * Returns JSON: {found, from, subject, links, codes, folder} or {found: false, scanned: [...]}
 *
 * Scans multiple folders in order (INBOX first, then categories Zoho may
 * have auto-routed to). Extracts both numeric and alphanumeric codes —
 * some SaaS (e.g. FuseAI) send alphanumeric 6-char codes while labelling
 * the UI "6-digit code". The tool reports both.
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
const FOLDERS = ['INBOX', 'Notification', 'Newsletter', 'Spam'];

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
  // Numeric codes (OTP): 4–8 digits
  const numericRe = /\b(\d{4,8})\b/g;
  // Alphanumeric codes: 5–8 chars with at least one letter, uppercase-friendly
  // Matches things like "FDCAE3" (FuseAI) without matching whole words
  const alnumRe = /\b([A-Z0-9]{5,8})\b/g;
  const out = new Set();
  let m;
  while ((m = numericRe.exec(text || ''))) out.add(m[1]);
  while ((m = alnumRe.exec(text || ''))) {
    const code = m[1];
    if (/[A-Z]/.test(code) && /\d/.test(code)) out.add(code);
  }
  return [...out];
}

async function searchFolder(connection, folder) {
  await connection.openBox(folder);
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
    // Codes: extract from plain text only to avoid CSS colors (#050505) in HTML
    const codes = extractCodes(parsed.text || '');

    return {
      found: true,
      from: parsed.from?.text || '',
      subject: parsed.subject || '',
      links,
      codes,
      folder,
    };
  }
  return null;
}

async function poll() {
  const start = Date.now();
  let connection;

  try {
    connection = await imaps.connect(config);

    while (Date.now() - start < TIMEOUT_MS) {
      for (const folder of FOLDERS) {
        try {
          const hit = await searchFolder(connection, folder);
          if (hit) {
            console.log(JSON.stringify(hit));
            connection.end();
            return;
          }
        } catch (folderErr) {
          // Folder may not exist for this account — skip silently
          continue;
        }
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    console.log(JSON.stringify({ found: false, scanned: FOLDERS }));
    connection.end();
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    if (connection) connection.end();
    process.exit(1);
  }
}

poll();
