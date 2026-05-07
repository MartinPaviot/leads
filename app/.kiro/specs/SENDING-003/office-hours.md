# SENDING-003 — Office Hours: Self-Service Sending Onboarding

## Problem statement (one sentence)
Connecting a sending domain to Elevay today requires the user to leave the product, buy a domain at a registrar, configure SPF/DKIM/DMARC records by hand, return to Elevay, paste credentials, and wait days for warmup — at any of those steps a non-technical founder will give up, and even a technical founder will burn 2-4 hours on plumbing instead of finding customers.

## Premise challenge

**Premise 1: Users buy and own their own sending domain.**
Counter-argument: most outbound platforms (Lemlist, Smartlead, Instantly's own onboarding) make users buy 3-5 domains and configure them. It's an industry expectation.

Counter-counter: **the industry expectation is broken.** It assumes the user is a power-user running their own infrastructure. Our ICP (early-stage SaaS founder) does not want to be a sysadmin. They want to send the email and get the meeting. The fact that "everyone does it this way" is precisely the metis opening — the indirect path that nobody else takes is to *handle the domain layer entirely on behalf of the user*.

**Decision: Elevay provides "managed sending domains" by default.** We register the domain, configure DNS, run warmup, hand the user a configured mailbox they connect to (or, more elegantly: they never connect to it directly, they just compose in Elevay and Elevay sends through it).

The user can ALSO bring their own domain — that path stays open for power-users — but the default and primary path is managed.

**Premise 2: We need to integrate registrar APIs (Namecheap, Cloudflare, Porkbun, etc.).**
Counter-argument: there's a simpler path. Use one registrar (Cloudflare, since they have the best API and lowest price), buy domains in bulk under one Elevay account, sub-allocate to tenants. The user never sees a registrar UI.

This works. It also creates a single point of vendor lock-in (Cloudflare). The risk is asymmetric: if Cloudflare bans Elevay's account for any reason, every tenant's outbound dies. **Mitigation: spread across 2 registrars (Cloudflare + Porkbun) with automatic failover. Hot-swap if needed.**

**Premise 3: One managed domain per tenant is enough.**
Counter-argument: deliverability best practice is to spread cold outbound across 3-5 domains so any single domain getting flagged doesn't kill the whole tenant. A single managed domain is fragile.

Right. **Default: 3 managed domains per tenant.** Each gets its own warmup. The send worker rotates across them per recipient. Cost: ~$3/month per tenant in domain registration fees. Trivial against $999/mo pricing. Quality gain: substantial.

**Premise 4: We should auto-configure DNS instantly via API.**
Counter-argument: the user might already own a domain we want to use (their corporate domain). For BYOD path, instant API config requires they hand us their DNS provider credentials, which is a non-starter for security-conscious tenants.

Resolution: **two paths.**
- Managed path (default): we own the domain, DNS is auto-configured at our registrar, user has zero touch.
- BYOD path: we generate the SPF/DKIM/DMARC records, user copy-pastes into their own DNS provider, we verify via DNS lookup. No credential surrender.

The managed path should be 80% of users. BYOD is for the 20% who insist on using their corporate domain.

**Premise 5: Warmup is invisible because warmup is invisible.**
Counter-argument: actually, surfacing warmup progress builds trust. Users know what's happening. They see the engine working. This becomes part of the product's perceived value.

Right. SENDING-001 already covers this (AC-8: dashboard surfaces readiness verdict). But the *onboarding flow* should preview the timeline: "Your sending infrastructure is being set up. Day 1-3: domain registration + DNS. Day 3-14: warmup. Day 14+: ready to send cold." Honest expectations beat surprised users.

## Alternatives explored

| Option | UX | Cost/tenant | Risk | Verdict |
|---|---|---|---|---|
| **A: Status quo (manual)** | Bad | $0 | High abandonment | Rejected |
| **B: Detailed instructions only (write your own DNS records)** | Bad | $0 | Same as A | Rejected |
| **C: BYOD with API-driven DNS auto-config (require user's registrar creds)** | Medium | $0 | Security-sensitive users won't comply | Rejected as default, kept as power-user option |
| **D: Managed domains, Elevay buys + configures, single registrar** | Excellent | ~$1/mo | Single point of failure | Improved by E |
| **E: Managed domains, multi-registrar, 3 domains per tenant default** | Excellent | ~$3/mo | Resilient, scalable | **Selected** |

## Layer check
Layer 1 (tried-and-true): registrar APIs, DNS record formats, multi-domain rotation are well-established.
Layer 2 (new and popular): "managed sending domains" as a category is emerging (Mailforge, Mailreef do this — confirmed Layer 2). Differentiator is integration quality, not category invention.
Layer 3: not warranted. Don't reinvent DNS.

## Completeness target
**8/10.** Boil the managed path completely (registrar abstraction + 3-domain provisioning + warmup orchestration with SENDING-001 + send routing with SENDING-002 + dashboard). Provide BYOD path as a secondary flow with manual DNS instructions and verification. Defer (1) cross-tenant managed-domain pool sharing, (2) automatic domain rotation when one degrades, (3) custom domain naming (use deterministic naming like `mail{N}.{tenant-slug}.elevay-mail.com` for now).

## Principles applied
- **Xenia** — The onboarding gives the infrastructure to the user before asking them to do any work. The product proves its generosity in the first 24 hours by handling the painful plumbing they didn't want to learn.
- **Polytropos** — Same product offers two faces: managed (default, hands-off) and BYOD (power-user, hands-on). The user sees the path that fits their stage.
- **Phronesis vs Episteme** — DNS configuration is pure episteme (rules, records, validations). Whether to send today vs wait for warmup is phronesis (judgment given context). The product handles episteme; the user (informed by the product's surfacing) decides on phronesis.
- **Nostos** — The infrastructure exists in service of getting the founder to the conversation. If a feature in this onboarding doesn't accelerate first-cold-send, it's out of scope.
- **Metis** — Every competitor makes users do the work. We do it for them. That asymmetric work is the moat.
