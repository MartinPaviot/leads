# SOC 2 Readiness — Gap Analysis Elevay

**Date** : 2026-06-10 · **Scope** : repo `leads` (app/apps/web, Next.js 15 + Postgres Supabase + Vercel) + pratiques opérationnelles
**Méthode** : audit du code réel (3 sweeps parallèles : access control / data lifecycle / secrets-CI-vendors), faits vérifiés avec chemins de fichiers. Pas de checklist générique.

SOC 2 = critères Trust Services. **Security (Common Criteria) est obligatoire** ; Availability et Confidentiality sont quasi systématiquement attendus pour un SaaS qui traite des données prospects. ~50 % de l'effort est organisationnel (politiques écrites + preuves), pas du code.

---

## 1. Ce qui est DÉJÀ en place (assets pour l'audit)

Le socle technique est nettement meilleur que la moyenne d'un produit à ce stade :

| Contrôle | Preuve |
|---|---|
| Auth solide : bcrypt cost 12, politique mdp ≥12 car. + complexité, check HIBP k-anonymity | `src/auth.ts`, `lib/auth/password-pwned.ts` |
| Lockout brute-force : 5 échecs/15 min par compte, 30/60 min par IP, persisté en DB, email hashé SHA-256 (anti-énumération) | `lib/auth/auth-lockout.ts:25-36`, `db/schema/auth.ts:206-222` |
| Sessions JWT 8 h absolu / refresh 1 h | `auth.ts:284` |
| RBAC admin/member + `requireAdmin()` sur toutes les routes /api/admin et /api/eval | `lib/auth/auth-utils.ts:82-87` |
| Isolation tenant : WHERE applicatif systématique via getAuthContext/withAuthRLS. **CORRECTIF 2026-06-10 (T8)** : la RLS Postgres revendiquée par le code (migration 0038) est ABSENTE de la prod — `pg_policies` vide, `relrowsecurity=false` sur contacts/companies/deals/activities, connexion en `postgres` avec `rolbypassrls=true`. L'isolation = couche applicative seule. Fix réel = rôle DB dédié non-BYPASSRLS + réapplication des policies (risque R-08b du registre) | vérifié live via `scripts/inspect-mfa-and-rls.ts` |
| **11/11 webhooks signés** (Stripe, Resend/Svix, Twilio HMAC, Zeliq, FullEnrich, EmailEngine, Recall, Inngest, inbound), fail-closed, comparaison timing-safe, fenêtre anti-replay 5 min | scan des 314 routes API |
| Audit log signé HMAC-SHA256, inviolabilité, **rétention 7 ans**, exclu de la purge | `lib/infra/audit-log.ts`, `lib/infra/signed-audit.ts` |
| Chiffrement AES-256-GCM des mots de passe IMAP/SMTP/CalDAV et clés API tenant | `lib/crypto/settings-encryption.ts`, `db/schema/outbound.ts:240` |
| Tokens reset/vérification email stockés en SHA-256, jamais en clair | `db/schema/auth.ts:146-199` |
| Sentry avec scrubbing PII agressif (identité, cookies, tokens, emails, hashes) | `lib/observability/sentry-scrub.ts` |
| Headers : CSP avec connect-src en allowlist, HSTS 2 ans preload, X-Frame-Options DENY, nosniff, COOP/CORP, Permissions-Policy | `next.config.ts:9-111`, `vercel.json` |
| Rate limiting : 200 req/min IP, 10 req/min sur auth | `middleware.ts:4-38` |
| RGPD : `/api/gdpr/export` + `/api/gdpr/delete` (cascade + audit), purge cron quotidienne 30 j post-résiliation, validation région EU au boot (DB, Anthropic EU, Sentry DE, PostHog EU, Twilio ie1) | `inngest/data-retention.ts`, `lib/region-config.ts` |
| Hygiène secrets repo : `.gitignore` couvre `.env*` + `_credentials/`, **aucun secret tracké dans git** (vérifié `git ls-files`), aucune clé en dur dans le code | `.gitignore:1-9` |
| ~525 fichiers de tests, PR template avec checklist sécurité, CODEOWNERS | `.github/` |
| Endpoints test-e2e triple-gatés (NODE_ENV + ENABLE_E2E_SEED + Bearer) + garde "E2E " sur cleanup | `api/test-e2e/cleanup/route.ts:56-63` |

À présenter tel quel à l'auditeur : webhooks, audit log signé, RLS, scrubbing Sentry sont des points forts différenciants.

---

## 2. Gaps TECHNIQUES — par priorité

### P0 — bloquants audit

**T1. Tokens OAuth en clair en DB** — `db/schema/auth.ts:48-53` : `refresh_token`, `access_token`, `id_token` (Google/Microsoft = accès boîtes mail et calendriers clients) en colonnes `text` non chiffrées, alors que `settings-encryption.ts` (AES-256-GCM) existe déjà. → Chiffrer ces colonnes avec la même lib + migration de re-chiffrement opportuniste (le pattern existe déjà pour H12).

**T2. `_credentials/` = coffre en clair sur disque** (non tracké git, mais sur la machine et dans les backups éventuels) :
- `bootstrap.json` : **carte bancaire complète en clair (numéro + CVV + PIN + adresse)**, mot de passe IMAP Zoho, clés Capsolver/TextVerified ;
- `accounts.json` : logins/mots de passe partagés PostHog, Supabase, Apollo, Resend, Recall, FuseAI ;
- `db-backups/…/contacts.ndjson` etc. : **exports DB avec PII prospects non chiffrés**.
→ Supprimer la carte du fichier ; migrer tout vers un gestionnaire (1Password/Bitwarden + Vercel env pour le runtime) ; chiffrer ou supprimer les dumps NDJSON. Les **comptes vendors partagés sont une non-conformité directe CC6.1** (comptes nominatifs requis).

**T3. Aucune CI, déploiement prod sans gate** — `.github/workflows/` n'existe pas (le ci.yml a été retiré) et **push sur main = déploiement prod automatique Vercel**. Change management (CC8.1) actuellement non démontrable. → Réinstaurer un workflow tsc + lint + vitest + (gitleaks), activer la branch protection sur main (PR obligatoire + CI verte), garder le flux PR existant comme preuve de revue.

**T4. Pas de MFA** — aucun TOTP/WebAuthn dans `auth.ts` (noté "v2 idea" dans l'audit settings). Le provider Credentials rend le MFA app-level nécessaire. → Au minimum TOTP obligatoire pour le rôle admin ; idéalement pour tous.

**T5. Offboarding utilisateur impossible** — pas de colonne `deactivatedAt` sur `users`, pas d'endpoint de retrait d'un membre actif (seul le rôle est modifiable), et un utilisateur retiré garderait sa session jusqu'à 8 h (pas de révocation). CC6.2/CC6.3 exigent un offboarding démontrable. → deactivation + DELETE membre + invalidation de session (version de session dans le JWT).

### P1 — exigés pendant la fenêtre d'observation

**T6. Trail d'authentification incomplet** — seuls les échecs de login sont journalisés ; les **logins réussis ne le sont pas** (CC6.1). L'audit log est best-effort : un échec d'écriture = `console.error` silencieux (`audit-log.ts:70`). → Logger les succès (user, IP, méthode, horodatage) ; alerter sur échec d'écriture d'audit.

**T7. Pas de révocation de session au changement de mot de passe** — vieux JWT valides 8 h après un reset. → versionner.

**T8. Workers Inngest hors RLS** — les 49 workers accèdent à la DB sans `app.tenant_id` (`inngest/with-tenant-context.ts`), donc dépendent d'un user DB BYPASSRLS. → vérifier la config prod et documenter la compensation (scoping applicatif), ou poser le contexte tenant par step.

**T9. Monitoring/alerting insuffisant** — Sentry seul ; `/api/health` ne teste ni DB ni dépendances ; pas d'uptime monitoring ni d'alerting métier (échecs d'envoi, échecs de purge). Availability (A1) indémontrable sans ça. → uptime check externe (Checkly/BetterStack), health check profond, alertes Sentry documentées.

**T10. Gestion des dépendances non automatisée** — pas de Dependabot/Renovate, pas de `pnpm audit` en CI, pas de `.nvmrc`. Vulnerability management (CC7.1) exige un processus. → Dependabot + audit en CI + pin Node.

**T11. Rétention non définie pour les données chaudes** — enregistrements d'appels (`calls.recordingUrl`, stockés chez Twilio, aucun TTL), transcripts, corps d'emails : purgés uniquement à la résiliation du tenant. → définir et appliquer une politique (ex. recordings 90 j) + la documenter.

**T12. Pas de rotation de clés** — `ELEVAY_APP_SECRET` et ~25 clés vendors sans politique ni date de rotation. → calendrier de rotation annuel + procédure écrite (et révoquer la clé Resend full-access déjà notée en attente).

### P2 — finition

- Rate limiting in-memory : par-instance sur Vercel Fluid → passer sur Redis (REDIS_URL existe déjà) pour des limites réelles multi-instances.
- CSP : retirer `unsafe-inline` script-src (migration nonce, déjà notée "phase 2" dans next.config).
- Health check : exposer la version/SHA déployé pour la traçabilité des changements.
- `app/apps/admin` : vérifier qu'il a les mêmes gates auth (non couvert par ce sweep).

---

## 3. Gaps ORGANISATIONNELS (l'autre moitié de SOC 2)

Rien de tout cela n'existe aujourd'hui dans le repo ; tout est exigé par l'auditeur :

1. **Politiques écrites** (le paquet standard, ~12 docs) : Information Security Policy, Access Control, Change Management, Incident Response (avec notification 72 h RGPD), Business Continuity / Disaster Recovery (**avec RTO/RPO** — actuellement aucun objectif défini, backups = implicites Supabase jamais testés en restauration), Data Retention & Classification, Vendor Management, Acceptable Use, Secure SDLC, Encryption Policy, Logging & Monitoring Policy, Risk Assessment Policy.
2. **Risk assessment annuel + registre des risques** tenu à jour.
3. **Gestion des sous-traitants** : 30 vendors identifiés dans le code (Anthropic, OpenAI, Mistral, Twilio, Deepgram, Recall, Resend, Stripe, Inngest, Supabase/Neon, Upstash, Sentry, PostHog, Apollo, Kaspr, Lusha, Hunter, Datagma, Firmable, FullEnrich, Zeliq, Crunchbase, Pappers, Zefix, Google, Microsoft, Zoho, Capsolver, TextVerified, Rippletide). Il faut : DPA signé pour chaque processeur de PII, revue annuelle (leur SOC 2/ISO), **liste publique de subprocessors**, et trancher ceux qui sont du tooling de dev à sortir du scope prod (Capsolver, TextVerified, FuseAI).
4. **Revues d'accès trimestrielles** : qui a accès à Vercel, Supabase, GitHub, Twilio, Stripe, DNS — avec preuve. Implique d'abord T2 (fin des comptes partagés).
5. **Test de restauration backup** documenté (au moins 1×/an) + confirmation PITR Supabase par écrit.
6. **Pentest annuel** par un tiers + suivi des findings.
7. **Security awareness training** (même en solo : attestation annuelle ; obligatoire dès le premier employé).
8. **Plateforme de conformité** : Vanta, Drata ou Secureframe — collecte automatique des preuves (config Vercel/GitHub/Supabase, MDM du laptop, etc.). C'est le multiplicateur d'effort n°1 pour une équipe d'une personne.
9. **Auditeur** : viser un **Type I** d'abord (instantané), puis **Type II** après une fenêtre d'observation de 3 mois minimum. Budget typique startup : 10-20 k$ audit + ~10-20 k$/an plateforme.

---

## 3bis. État d'exécution (2026-06-10, fin de journée)

**Fait et vérifié en prod** (PR #114, merge 6671efa3, deploy READY, logs sains — 200 sur les routes authentifiées, Inngest 206, zéro error/fatal) :
- **T1 ✓** Tokens OAuth chiffrés AES-256-GCM : écriture (linkAccount + refresh), lecture tolérante sur les 6 lecteurs, backfill prod exécuté (3 lignes ; idempotence + déchiffrement + forme JWT vérifiés via `scripts/verify-oauth-encryption.ts`).
- **T2 ✓ (partiel)** Carte bancaire purgée des deux `bootstrap.json` (cap budget conservé) ; dumps DB chiffrés (`.tar.gz.enc`, roundtrip hash-vérifié, plaintext supprimé, outil `_tools/backup-crypt/`). RESTE : remplacer les comptes vendors partagés d'`accounts.json` par des comptes nominatifs (action Martin).
- **T5 ✓** Offboarding : `users.deactivated_at` (migration 0072 appliquée en prod), DELETE `/api/settings/members` (admin-only, tenant-scoped, réversible, audité), login bloqué + révocation serveur ≤60 s via `lib/auth/session-guard` dans `getAuthContext`.
- **T7 ✓** `auth_user.password_changed_at` : tout JWT antérieur à un changement/reset de mot de passe est rejeté (signed-out-everywhere).
- **T6 ✓** Logins réussis audit-loggés (events.signIn, provider taggé) ; échec d'écriture d'audit → Sentry au lieu d'un console.error silencieux.
- **T10 ✓** Dependabot ACTIF (PRs #115-#119 ouvertes dès le merge) + `.nvmrc`. Attention : ne PAS merger les bumps majeurs sans CI verte (#116 propose eslint-config-next 16 sur un Next 15).
- **T3 ◐** `ci.yml` (tsc + vitest + gitleaks) écrit et validé localement (321 fichiers / 3 581 tests verts en worktree sans env) mais **non poussé** : les tokens git/gh n'ont pas le scope `workflow` → exécuter `gh auth refresh -h github.com -s workflow`. Le fichier attend dans le worktree `C:\Users\marti\leads-soc2`.
- **Branch protection ✗** : GitHub répond « Upgrade to GitHub Pro or make this repository public » (repo privé, plan Free). Décision : Pro (~4 $/mois) ou repo public.

**Toujours ouverts** : T4 (MFA), T8 (BYPASSRLS Inngest), T9 (uptime/alerting), T11 (rétention recordings), T12 (rotation clés), et tout le volet organisationnel (§3).

## 3ter. État d'exécution vague 2 (2026-06-10, soir)

- **T4 ✓** MFA TOTP complet : RFC 6238 maison validé par les vecteurs de l'Appendix B (14 tests), secret chiffré AES-256-GCM dans `user_mfa_secrets` (table prod préexistante, schéma calqué), anti-replay par step, 10 recovery codes single-use hashés SHA-256, exigé au login credentials (`MfaRequired`/`InvalidTotp` + champ conditionnel sur /sign-in), carte d'enrôlement sur /settings/security, audit `mfa_enrolled`/`mfa_disabled`. Politique 02 : MFA requis pour les admins (grâce 14 j).
- **T8 ✓ (constat)** — voir le correctif RLS en section 1 : la RLS n'existe pas en prod ; documenté honnêtement (risque R-08b), fix infra = rôle DB dédié (hors périmètre de cette vague).
- **T9 ✓** `/api/health` teste la DB (budget 3 s, 503 si KO) + expose le commit déployé ; `uptime.yml` (probe 5 min sur prod, alerte email GitHub native) — en attente du scope workflow avec ci.yml.
- **T11 ✓** Cron `recording-retention-purge` (04:00 UTC) : recordings > 90 j (override `settings.recordingRetentionDays`, min 7) supprimés chez Twilio puis pointeur nullé ; 404 toléré, échec → re-tenté le lendemain ; transcripts conservés (vie du contrat) ; audit-loggé par batch.
- **T12 — exclu sur décision Martin** (risque R-03 accepté au registre).
- **Volet org ✓ (v1)** : 12 politiques + liste subprocessors (28 vendors prod) dans `_compliance/`, ancrées sur les mécanismes réels (crons, endpoints, env), registre de risques 11 entrées. Restent les actes externes : signer les DPAs, choisir Vanta/Drata, drill de restauration, pentest.

## 4. Ordre d'exécution recommandé

| Vague | Contenu | Effort |
|---|---|---|
| **1. Cette semaine** | T2 (purger carte + vault secrets + chiffrer/supprimer dumps), T3 (CI + branch protection), choisir Vanta/Drata | 2-3 j |
| **2. Sprint suivant** | T1 (chiffrer tokens OAuth), T5 (offboarding + révocation session), T6/T7 (logs login + invalidation), T10 (Dependabot) | 3-5 j |
| **3. En parallèle (non-code)** | Paquet de politiques (templates fournis par la plateforme), DPAs vendors, RTO/RPO + test de restauration | 1-2 sem. étalées |
| **4. Avant l'audit** | T4 (MFA), T9 (uptime/alerting), T11 (rétention recordings), T12 (rotation), pentest | 1-2 sem. |
| **5. Audit** | Type I → fenêtre 3 mois → Type II | calendrier auditeur |

**Verdict** : le code est à ~70 % du niveau requis (auth, isolation, webhooks, audit log, chiffrement applicatif déjà solides). Les vrais trous sont : tokens OAuth en clair, le dossier `_credentials/`, l'absence totale de CI/gating, MFA, offboarding — plus tout le volet organisationnel qui part de zéro. C'est un chantier de quelques semaines de code + 3 mois d'observation, pas un rewrite (pas un ocean côté code ; le volet politiques/process est un marathon administratif à démarrer tout de suite).
