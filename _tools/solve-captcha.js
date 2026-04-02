#!/usr/bin/env node
/**
 * solve-captcha.js — Solve CAPTCHAs via Capsolver API
 * Usage: node solve-captcha.js recaptcha_v2 '{"pageUrl":"...","siteKey":"..."}'
 *        node solve-captcha.js hcaptcha '{"pageUrl":"...","siteKey":"..."}'
 * Returns JSON: {solved, solution} or {solved: false, error}
 */

const fs = require('fs');
const path = require('path');

const bootstrap = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '_credentials', 'bootstrap.json'), 'utf8')
);

const API_KEY = bootstrap.captcha.api_key;
const BASE_URL = 'https://api.capsolver.com';
const TIMEOUT_MS = 180_000;
const POLL_MS = 3_000;

const CAPTCHA_TYPE = process.argv[2];
const PARAMS = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!CAPTCHA_TYPE || !PARAMS.pageUrl || !PARAMS.siteKey) {
  console.log(
    JSON.stringify({
      error: 'Usage: node solve-captcha.js <type> \'{"pageUrl":"...","siteKey":"..."}\'',
    })
  );
  process.exit(1);
}

const TASK_TYPE_MAP = {
  recaptcha_v2: 'ReCaptchaV2TaskProxyLess',
  hcaptcha: 'HCaptchaTaskProxyLess',
  turnstile: 'AntiTurnstileTaskProxyLess',
};

async function createTask() {
  const taskType = TASK_TYPE_MAP[CAPTCHA_TYPE];
  if (!taskType) {
    console.log(JSON.stringify({ error: `Unknown captcha type: ${CAPTCHA_TYPE}` }));
    process.exit(1);
  }

  const body = {
    clientKey: API_KEY,
    task: {
      type: taskType,
      websiteURL: PARAMS.pageUrl,
      websiteKey: PARAMS.siteKey,
    },
  };

  const res = await fetch(`${BASE_URL}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.errorId && data.errorId !== 0) {
    console.log(JSON.stringify({ solved: false, error: data.errorDescription || data.errorCode }));
    process.exit(1);
  }

  return data.taskId;
}

async function getResult(taskId) {
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const res = await fetch(`${BASE_URL}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: API_KEY, taskId }),
    });

    const data = await res.json();

    if (data.status === 'ready') {
      return { solved: true, solution: { token: data.solution?.gRecaptchaResponse || data.solution?.token || data.solution?.captcha_response } };
    }

    if (data.errorId && data.errorId !== 0) {
      return { solved: false, error: data.errorDescription || data.errorCode };
    }
  }

  return { solved: false, error: 'timeout' };
}

async function main() {
  try {
    const taskId = await createTask();
    const result = await getResult(taskId);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ solved: false, error: err.message }));
    process.exit(1);
  }
}

main();
