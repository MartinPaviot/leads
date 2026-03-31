#!/usr/bin/env node
/**
 * sms-verify.js — Rent temporary phone numbers via TextVerified API v2
 * Usage:
 *   node sms-verify.js get-number SERVICE_NAME
 *   node sms-verify.js get-code VERIFICATION_ID
 * Returns JSON: {id, number} or {code} or {error}
 */

const fs = require('fs');
const path = require('path');

const bootstrap = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '_credentials', 'bootstrap.json'), 'utf8')
);

const API_KEY = bootstrap.sms.api_key;
const BASE_URL = bootstrap.sms.base_url || 'https://www.textverified.com/api/v2';
const TIMEOUT_MS = 120_000;
const POLL_MS = 5_000;

const ACTION = process.argv[2];
const ARG = process.argv[3];

if (!ACTION || !ARG) {
  console.log(
    JSON.stringify({ error: 'Usage: node sms-verify.js <get-number|get-code> <service|id>' })
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function getNumber(service) {
  try {
    const res = await fetch(`${BASE_URL}/verifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: service }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log(JSON.stringify({ error: `HTTP ${res.status}: ${text}` }));
      process.exit(1);
    }

    const data = await res.json();

    if (data.number || data.phoneNumber) {
      console.log(
        JSON.stringify({
          id: data.id || data.verificationId,
          number: data.number || data.phoneNumber,
        })
      );
    } else {
      console.log(JSON.stringify({ error: 'NO_NUMBERS', raw: data }));
    }
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

async function getCode(verificationId) {
  const start = Date.now();

  try {
    while (Date.now() - start < TIMEOUT_MS) {
      const res = await fetch(`${BASE_URL}/verifications/${verificationId}`, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(JSON.stringify({ error: `HTTP ${res.status}: ${text}` }));
        process.exit(1);
      }

      const data = await res.json();

      if (data.code || data.smsCode) {
        console.log(JSON.stringify({ code: data.code || data.smsCode }));
        return;
      }

      if (data.status === 'completed' && (data.smsContent || data.text)) {
        // Extract code from SMS text
        const text = data.smsContent || data.text || '';
        const match = text.match(/\b(\d{4,8})\b/);
        if (match) {
          console.log(JSON.stringify({ code: match[1] }));
          return;
        }
        console.log(JSON.stringify({ code: text }));
        return;
      }

      if (data.status === 'cancelled' || data.status === 'expired') {
        console.log(JSON.stringify({ error: data.status }));
        return;
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    console.log(JSON.stringify({ error: 'timeout' }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

if (ACTION === 'get-number') {
  getNumber(ARG);
} else if (ACTION === 'get-code') {
  getCode(ARG);
} else {
  console.log(JSON.stringify({ error: `Unknown action: ${ACTION}. Use get-number or get-code.` }));
  process.exit(1);
}
