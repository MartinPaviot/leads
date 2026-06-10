# Security Awareness and Training Policy

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose

Ensure every workforce member understands Elevay's security policies, the threats relevant to a product that handles customer mailboxes and prospect PII, and their personal responsibilities — and that this understanding is refreshed and evidenced annually.

## 2. Annual Training Requirement

- Every workforce member completes security awareness training **annually**, covering at minimum: this policy pack (policies 01-12), phishing and social engineering, credential and secret hygiene, data classification and handling (Policy 07), AI tool usage rules (Policy 11 section 3), and incident reporting.
- Completion is evidenced in `_compliance/evidence/training/` (date, person, content covered, attestation).

## 3. Solo-Founder Mode

While Elevay has a workforce of one, formal courseware is replaced by a documented self-attestation regime:

- **Annual self-attestation:** the Founder re-reads the full policy pack once per year and records a dated attestation in `_compliance/evidence/training/` confirming the policies were reviewed and remain accurate (drift found during the review triggers policy updates, not just attestation).
- **Staying current on advisories:** the Founder monitors security advisories for the production stack on an ongoing basis — GitHub Dependabot alerts for the repository, and status/security bulletins from Vercel, Supabase, Twilio, Stripe, Anthropic, and OpenAI. Material advisories are acted on per the Vulnerability Management / Incident Response policies and noted in the risk register when they change Elevay's exposure.
- The annual self-attestation also satisfies the acknowledgement requirement of the Acceptable Use Policy (11).

## 4. Onboarding Training for Future Hires

- Any future employee or contractor completes security onboarding **within 30 days of start**, and before receiving access to customer data (whichever comes first for production access).
- Onboarding covers: the policy pack, the access request process (Policy 02), the two-space user-ID and tenant-scoping conventions that protect customer data in code, suppression-list obligations (`email_optouts`, `do_not_call_list`), and the AI tool rules.
- Completion is a precondition recorded in the access-granting checklist; evidence filed in `_compliance/evidence/training/`.

## 5. Phishing Awareness

Elevay connects to and processes customer mailboxes (Google/Microsoft OAuth, Zoho, IMAP/SMTP), which makes the workforce a high-value phishing target: a compromised operator account could expose customer mail content, not just company data. Therefore:

- Training gives specific weight to OAuth consent phishing (fake "grant access" prompts), vendor-impersonation emails (fake Vercel/Supabase/Stripe alerts), and MFA-fatigue attacks.
- Rule of practice: never approve an OAuth grant, MFA prompt, or credential entry that was not self-initiated; verify vendor emails by navigating to the dashboard directly rather than clicking links.
- Any suspected phishing attempt against a workforce member — successful or not — is reported under the Incident Response Policy, and successful credential phishing is treated as a potential customer-data incident.

## 6. Related Documents

- `11-acceptable-use-policy.md` (rules the training teaches)
- `02-access-control-policy.md` (access preconditions)
- `10-risk-assessment-policy.md` (advisory-driven register updates)
