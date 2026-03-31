# Autonomy tools

Read this during first run setup to create the 3 tools in `_tools/`. Also reference when using the tools during research or build phases.

## Overview

You have full browser control via Playwright MCP. Say "use playwright mcp to navigate to..." on first use.

You can create accounts on any service autonomously using these 3 tools. Write them yourself during first run — you know how IMAP, Capsolver, and TextVerified APIs work. Read all credentials from `_credentials/bootstrap.json`.

---

## _tools/check-email.js

**Purpose**: Check the catch-all inbox for verification emails after signing up for services.

**When to use**: Immediately after submitting a signup form that requires email verification.

**How to invoke**: `node _tools/check-email.js "signup-123@agent.domain.com" "verify"`

**Input**: arg1 = target email address, arg2 = subject keyword to match

**Returns**: JSON to stdout:
- `{found: true, from: "noreply@service.com", subject: "Verify your email", links: ["https://...verify?token=abc"], codes: ["123456"]}` — found a matching email
- `{found: false}` — no matching email after 120s timeout

**How it works internally**:
1. Connect to IMAP using creds from `bootstrap.json` (host, port, user, password)
2. Open INBOX
3. Search for UNSEEN messages matching TO address and subject keyword
4. Parse each match with mailparser
5. Extract all URLs and 4-8 digit codes from body text
6. If no match, wait 5s and retry. Timeout after 120s.
7. Mark found messages as seen.

**After receiving result**: Click the first verification link via Playwright, or enter the code in the signup form.

**Cost**: Free (uses your own IMAP).

---

## _tools/solve-captcha.js

**Purpose**: Solve CAPTCHAs encountered during web signups.

**When to use**: When Playwright encounters a reCAPTCHA v2 or hCaptcha on a page. Inspect the page source or network requests to find the siteKey.

**How to invoke**:
```bash
node _tools/solve-captcha.js recaptcha_v2 '{"pageUrl":"https://example.com/signup","siteKey":"6Le..."}'
node _tools/solve-captcha.js hcaptcha '{"pageUrl":"https://example.com/signup","siteKey":"abc..."}'
```

**Input**: arg1 = captcha type (`recaptcha_v2` or `hcaptcha`), arg2 = JSON with pageUrl and siteKey

**Returns**: JSON to stdout:
- `{solved: true, solution: {token: "03AGdBq24..."}}` — inject this token into the page
- `{solved: false, error: "timeout"}` — failed after 180s
- `{error: "CAPTCHA_NOT_READY"}` — Capsolver couldn't solve it

**How to inject the solution**: Via Playwright browser_console tool:
```javascript
document.getElementById('g-recaptcha-response').value = 'TOKEN_HERE';
// Then submit the form
```

**How it works internally**:
1. Create task at Capsolver API (`/createTask`) with the captcha type and site details
2. Poll `/getTaskResult` every 3s until status = "ready" or timeout
3. Return the solution token

**Cost**: ~$0.002 per captcha. Log to `_reports/spending.md`.

---

## _tools/sms-verify.js

**Purpose**: Rent a temporary phone number for SMS verification during signups.

**When to use**: When a signup form requires phone verification and you need a number to receive a code.

**Provider**: TextVerified (textverified.com), API v2.

**How to invoke (2 steps)**:

Step 1 — Get a number:
```bash
node _tools/sms-verify.js get-number SERVICE_NAME
```
Returns: `{id: "123456", number: "+12025551234"}`
Enter this number in the signup form.

Step 2 — Get the verification code:
```bash
node _tools/sms-verify.js get-code 123456
```
Returns: `{code: "4521"}` — enter this code in the form.

**Service names**: Use the service name as listed on TextVerified (e.g. "google", "amazon", "instagram", "facebook", "any"). Use "any" as default for generic services.

**Returns**:
- get-number: `{id: "...", number: "..."}` or `{error: "NO_NUMBERS"}`
- get-code: `{code: "..."}` or `{error: "timeout"}` after 120s

**How it works internally**:
1. get-number: POST to TextVerified API v2 to rent a number for the given service
2. get-code: poll the verification endpoint every 5s until SMS arrives or timeout
3. Read API key from `_credentials/bootstrap.json` field `sms.api_key`
4. Base URL: `sms.base_url` from bootstrap.json
5. Auth: Bearer token in Authorization header

**Important**: Write this tool by reading the TextVerified API v2 docs first. Navigate to textverified.com/api-docs via Playwright to get the exact endpoints, request/response shapes, and authentication method.

**Cost**: ~$0.50/number. Log to `_reports/spending.md`.

---

## Account management

After EVERY signup on any service, immediately append to `_credentials/accounts.json`:
```json
{
  "service": "apollo.io",
  "email": "signup-1711836000@agent.leadsens.com",
  "password": "xK9mP2vL8nQ4wR7j",
  "api_key": "xxx",
  "plan": "free",
  "date": "2026-03-30",
  "cost_usd": 0
}
```
Generate strong random passwords (16+ chars, mixed case, digits). Never reuse passwords across services.

## Budget management

Before ANY paid action:
1. Read current total from `_reports/spending.md`
2. Check against `monthly_cap_usd` in `_credentials/bootstrap.json`
3. If at cap → STOP, tell Martin
4. If under cap → proceed, log charge immediately after

Format for `_reports/spending.md`:
```markdown
| Date | Service | Item | Cost |
|------|---------|------|------|
| 2026-03-30 | Capsolver | Initial credit | $10.00 |
| 2026-03-30 | SMS-Activate | Phone number (Apollo signup) | $0.15 |
```
