# Setup guide

## What you get

```
CLAUDE.md                    ← The agent reads this. Core instructions.
_harness/
  RESEARCH.md                ← Detailed research protocols (14 investigations)
  EVAL_RUBRIC.md             ← Scoring methodology for evaluation
  TOOLS.md                   ← Autonomy tool specs (email, captcha, SMS)
_credentials/
  bootstrap.json             ← YOUR credentials. Fill this in.
```

## What you do (once, ~15 minutes)

### 1. Catch-all email (~5 min)
You already have Zoho with 12 domains. Pick one (e.g. `agent.leadsens.com`).
- Create a mailbox: `agent@agent.leadsens.com`
- Enable catch-all: all emails to `*@agent.leadsens.com` go to that mailbox
- Note the IMAP settings (host, port 993, user, password)

### 2. Capsolver (~2 min)
- Go to capsolver.com
- Create account
- Add $10 credit (card or crypto)
- Copy API key from dashboard

### 3. SMS-Activate (~2 min)
- Go to sms-activate.guru
- Create account
- Add $5 credit
- Copy API key from profile page

### 4. Virtual card (~5 min)
- Go to privacy.com (US) or use Revolut (EU)
- Create a virtual card
- Set monthly spending limit to $200
- Note: card number, exp, CVV, billing zip, name

### 5. Fill bootstrap.json
Open `_credentials/bootstrap.json` and fill in all fields from steps 1-4.
Delete the `_setup` fields if you want — they're just instructions.

### 6. Playwright MCP
Run this once in your terminal:
```bash
claude mcp add --scope user playwright npx @playwright/mcp@latest
npx playwright install chromium
```

## Launch

```bash
# Create project folder
mkdir ~/gtm-engine

# Copy all files into it:
# CLAUDE.md → ~/gtm-engine/CLAUDE.md
# _harness/ → ~/gtm-engine/_harness/
# _credentials/ → ~/gtm-engine/_credentials/

# Open in VS Code
code ~/gtm-engine

# Open Claude Code panel
# Type:
/loop
```

## Monitor

- `_reports/daily-report.md` — progress summary
- `_reports/harness-health.md` — pass/fail rates, anomalies
- `_reports/spending.md` — budget tracking
- `_reports/drift.md` — spec-code drift detection

## Intervene

The agent stops automatically at milestone checkpoints (defined in `_harness/milestones.json` with `checkpoint: true`). It tells you what's built and asks for your product direction review. You review, give feedback, say "continue".

## Controls

- Agent stops at checkpoints automatically
- To see status anytime: type `/status` in Claude Code
- To pause: the agent waits for your response at checkpoints
- To force stop: close Claude Code

## Cost estimate

- Capsolver: ~$0.002/captcha → $10 lasts ~5000 captchas
- SMS-Activate: ~$0.10-0.50/number → $5 lasts ~10-50 signups
- Virtual card: depends on what providers the agent signs up for. $200 cap.
- Claude Code Max: your existing subscription
