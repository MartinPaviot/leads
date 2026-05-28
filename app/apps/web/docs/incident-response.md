# Incident response plan

**Last updated:** 2026-05-19
**Owner:** CTO + DPO
**Review cadence:** annually + after every Sev1 / Sev2 incident

This document defines how Elevay detects, responds to, and notifies about
security incidents and personal data breaches.

---

## 1. Severity levels

| Sev | Definition | Examples | Notification target |
|---|---|---|---|
| **Sev1** | Confirmed compromise of production data or full outage | Customer DB breach, cross-tenant data leak, root credential leak, full Service outage > 30 min | Initial: < 15 min internal; affected customers + DPA: per regulatory timeline |
| **Sev2** | Probable compromise or major degradation | Suspected unauthorised access, large-scale credential stuffing observed, mailbox sync misrouting | < 30 min internal; customer comms within 4h |
| **Sev3** | Confined incident with low impact | Failed exploit attempt blocked at WAF, single account takeover with rapid recovery | < 1h internal; affected user only |
| **Sev4** | Informational / near-miss | Vulnerability reported by researcher; security finding without exploitation | Normal triage |

---

## 2. Roles

| Role | Responsibility | Primary | Backup |
|---|---|---|---|
| **Incident Commander** | Single decision-maker during incident | CTO | Eng Lead |
| **Comms Lead** | Customer + DPA notifications | DPO | Founder |
| **Tech Lead** | Containment + investigation | Eng on-call | CTO |
| **Scribe** | Realtime timeline | Anyone on the call | — |

---

## 3. Response phases

### 3.1 Detect

Detection sources:
- Sentry alerts on unusual error rates
- PostHog anomaly dashboards
- Customer report → security@elevay.dev
- Researcher disclosure → security@elevay.dev
- Automated audit log alerts (role changes, mass data export, cross-tenant query)
- Postmaster Tools alerts (Gmail/Outlook spam rate spikes)
- Failed CI / security scans

### 3.2 Triage (within 15 min)

- Confirm whether the event is real, ongoing, or historical
- Assign severity
- Open a dedicated incident channel (#inc-yyyymmdd-shortname)
- Page the Incident Commander
- Start the timeline log

### 3.3 Contain

| Containment action | When |
|---|---|
| Revoke compromised credentials | Sev1 / Sev2 with credential compromise |
| Rotate `AUTH_SECRET`, `ELEVAY_APP_SECRET`, OAuth client secrets | Sev1 |
| Force-logout affected users (JWT rotation by short maxAge) | Sev1 / Sev2 |
| Disable affected feature flag | Sev1 / Sev2 |
| Block IP / range at WAF | Sev1 / Sev2 |
| Take service offline | Last resort, Sev1 only, IC decision |

### 3.4 Eradicate

- Identify root cause (timeline, code change correlation, vendor incident)
- Patch the vulnerability
- Verify the patch
- Run regression tests
- Deploy to production

### 3.5 Recover

- Restore from backup if data loss
- Re-enable disabled features once verified
- Communicate restoration to customers

### 3.6 Post-mortem (within 7 days)

- Blameless write-up: timeline, root cause, contributing factors, fixes, follow-ups
- Owner + due date for each follow-up
- Review at next security weekly

---

## 4. Personal data breach notification

GDPR Art. 33 / 34 — and nFADP Art. 24 — require notification of personal
data breaches:

| Threshold | To | When |
|---|---|---|
| Breach of personal data | CNIL (FR) and / or FDPIC (CH) | Within **72 hours** of discovery |
| Breach likely to result in high risk to data subjects' rights | Data subjects directly | Without undue delay |
| Customer-controlled data (we are processor) | The customer (data controller) | Without undue delay; in time for them to meet their 72h obligation |

### What constitutes "discovery"

The 72h clock starts when Elevay has a **reasonable degree of certainty** a
breach has occurred — typically at the end of triage when severity is set.

### Notification content (Art. 33(3))

- Nature of the breach + categories and approximate number of data subjects affected
- Name and contact of the DPO
- Likely consequences
- Measures taken / proposed

### Decision tree

```
Personal data accessed/altered/exposed by an unauthorised party?
├─ No  → not a "personal data breach" under GDPR; document as Sev3/4
└─ Yes
   ├─ Risk to rights/freedoms of individuals?
   │  ├─ No  → log internally, no DPA notification
   │  └─ Yes → notify supervisory authority within 72h
   └─ High risk to rights/freedoms?
      ├─ No  → DPA notification only
      └─ Yes → DPA + affected data subjects
```

---

## 5. Communication templates

### 5.1 Internal page (Sev1/Sev2)

```
[INC-{id}] {short title}
Severity: Sev1
IC: {name}
Status: investigating | contained | resolved
Affected: {scope — tenants, users, data}
Next update: {timestamp}
Channel: #inc-{id}
```

### 5.2 Customer notification (Sev1 + data exposure)

```
Subject: Security incident affecting your Elevay account

We are writing to inform you of a security incident that may have affected
the personal data in your Elevay workspace.

What happened: [factual description]
What data was involved: [categories]
What we are doing: [containment + remediation]
What you should do: [actions, e.g. rotate API keys]
Contact: security@elevay.dev

We are notifying the {CNIL/FDPIC} as required by GDPR Art. 33 / nFADP Art. 24.
```

### 5.3 Supervisory authority notification

CNIL submission via `notifications.cnil.fr`.
FDPIC notification via `databreach.edoeb.admin.ch`.

---

## 6. Vendor incident dependency

When the incident is caused by a sub-processor:

1. Confirm the vendor incident is real (security advisory, status page, vendor's own notification)
2. Assess our exposure: which tenants, which data, which timeframe
3. Notify customers proportionally — even if the vendor will also notify them, we are still the controller
4. Track vendor's remediation and demand a post-mortem

---

## 7. Drills

| Drill | Cadence |
|---|---|
| Tabletop walkthrough of a Sev1 scenario | quarterly |
| Restore-from-backup live drill | every 6 months |
| Page-routing test | monthly |

---

## 8. Contacts

| Contact | Role | Reach |
|---|---|---|
| security@elevay.dev | Inbox + paging | 24/7 |
| privacy@elevay.dev | DPO | business hours |
| CNIL | French supervisory authority | notifications.cnil.fr |
| FDPIC | Swiss supervisory authority | databreach.edoeb.admin.ch |
