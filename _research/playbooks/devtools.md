# Devtools playbook

Tenant ICP : devtools / developer-platform / infra companies (CI/CD, observability, IDE plug-ins, code-quality, AI-augmented dev).

## TAM seed queries (Apollo / Lusha / ZoomInfo)

- `industry: "Computer Software" OR "Information Technology" AND department:engineering` (firmographic baseline)
- `keywords: "API platform" OR "developer experience" OR "DevOps" OR "observability"`
- `funded between $5M-$50M last 24 months` (sweet spot — maturity + budget)
- `headcount 11-200` (post-seed up to Series B/C)

## Buying signals (5 canonical)

| Signal | Detection | Why it fires |
|---|---|---|
| **funding_recent** | Apollo `latest_funding_stage` updated in last 90d | New round → new tooling budget within 60 days |
| **head_of_eng_hired** | Job change : Director/VP Eng/CTO joins | First-90-days plays drive tooling consolidation |
| **stack_signal_competitor_adoption** | LinkedIn job ads mention competitor product (e.g. "Datadog experience required") | Already evaluating the category — hot |
| **growth_signal_eng_hiring_burst** | ≥5 eng job posts active simultaneously | Team scale → infra pain points emerge |
| **conference_attendance** | Speaker / attendee at DevOpsDays / KubeCon / Strange Loop in last 90d | Active in modern-tooling community |

## Sequence templates (3)

### Sequence A — "Funding round congrats + concrete value"
```
Step 1 (D+0):
Subject: "Congrats on the $X — quick question on dev velocity"
Body: Founder-to-founder note. Reference round announcement. Single concrete benchmark from a similar-stage devtools company. Ask one question.

Step 2 (D+3):
Subject: "Re: dev velocity"
Body: Bump with one signal-grounded reason ("noticed you're hiring 3 senior backends") + one CTA.

Step 3 (D+7):
Subject: "Last note"
Body: Soft break-up. Drop a customer story matching their stage.
```

### Sequence B — "Stack-aware switching"
```
Step 1 (D+0):
Subject: "On <competitor> — three things we hear most"
Body: Pattern recognition message. Three friction points current <competitor> users report. Offer a 15-min comparison.

Step 2 (D+4):
Subject: "Quick benchmark"
Body: Reference architecture comparison they can open in one click.

Step 3 (D+10):
Subject: "Worth a look?"
Body: Friction-point recap + CTA to schedule.
```

### Sequence C — "Hiring-burst opportunity"
```
Step 1 (D+0):
Subject: "Onboarding 10 engineers in <quarter>?"
Body: Hiring burst → first-week dev experience matters. Offer a 30-min audit of their current dev onboarding flow.

Step 2 (D+5):
Subject: "Re: dev onboarding"
Body: Resource — guide they can share with their new hires regardless of the deal.

Step 3 (D+12):
Subject: "Stepping back"
Body: Soft break-up.
```

## Pipeline stages (recommended)

1. **Discovery** — IC/EM-level intro
2. **Champion identified** — found a single owner who can vouch
3. **Architecture review** — technical evaluation in flight
4. **Security review** — SOC2 / vendor security questionnaire
5. **Trial** — paid or unpaid POC
6. **Procurement** — legal + budget approval
7. **Won / Lost**

## Common objections + responses

- *"We have an internal tool."* → Acknowledge build vs buy ; ROI on engineering time spent maintaining vs feature velocity.
- *"Wait until next quarter."* → Map the cost of waiting (engineer-month wasted, missed ship).
- *"Security review is 6 weeks."* → Offer to start the security review in parallel with technical eval.

## Geo notes

- US west coast / SF Bay Area : highest density. Decision cycles 2-4 weeks.
- US east coast / NYC : finance-adjacent devtools, longer cycles (4-8 weeks).
- EU (UK, NL, DE, FR) : longer GDPR review, 4-12 weeks. Favour PLG entry.
- APAC : highest deal sizes when they land, lowest deal volume. Optional in early-stage outreach.
