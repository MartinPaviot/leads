# Décisions — FuseAI track
_À cocher par Martin. Dès qu'une case est validée je peux exécuter._

Format : `[ ]` = en attente. Remplace par `[x]` et je repars.

---

## 🟢 Exécution autonome (juste un GO de ta part)

### A1 — Publier BATTLECARD au deal team
- [ ] GO : partage `fuse-analysis/BATTLECARD.md` aux commerciaux / conseillers GTM
- [ ] Revoir d'abord (Martin lit + ajuste wording avant partage)
- [ ] Skip

### A2 — Publier la page SEO `leadsens-vs-fuseai-fr`
- [ ] GO : publier sur le blog marketing (nécessite CMS setup si pas encore en place)
- [ ] Relire + éditer avant publication
- [ ] Skip

### A3 — Écrire les 9 autres pages SEO vs-competitor (FR)
Estimation ~3-4h / page. Je peux les enchaîner.
Ordre proposé dans NEXT_ACTIONS.md §N7.
- [ ] GO sur les 10 pages complètes (45h de ma part, ~1 semaine calendaire)
- [ ] GO sur 3 prioritaires seulement (vs Attio, vs Salesforce, vs Apollo)
- [ ] Skip pour l'instant

### A4 — Écrire Kiro spec FUSE-GAP-2 (Signals externes, N9)
Sources envisagées : TheirStack (hiring), Crunchbase (funding), UserGems (job change).
- [ ] GO : j'écris la spec complète (office-hours + requirements + design + tasks)
- [ ] Attendre, je reviendrai sur N9 plus tard
- [ ] Skip N9 définitivement

### A5 — Écrire Kiro spec FUSE-GAP-3 (Website Visitor ID, N10)
Provider envisagé : RB2B ou alternative EU (à explorer).
- [ ] GO : j'écris la spec complète
- [ ] Attendre, je reviendrai sur N10 plus tard
- [ ] Skip N10 définitivement

### A6 — Mettre à jour `_tools/check-email.js` à l'identique pour SMS (fix équivalent pour `sms-verify.js`)
J'ai remarqué en passant que `_tools/sms-verify.js` pourrait avoir un problème similaire (pas encore audité).
- [ ] GO : audit + fix si besoin
- [ ] Skip

---

## 🟡 Pricing v3 (N5) — choix à faire

Tu as juste mergé WS-2 pricing v2 (3 tiers $0/$49/$99). Fuse a un modèle crédits unifiés avec gotcha caché. Proposition v3 :

### B1 — Adopter les AI Credits pool en sur-couche des tiers ?
- [ ] GO : ajouter un "AI Credits pool" à chaque tier (10K Starter, 50K Pro) + top-ups $19 / 10K crédits
- [ ] Variante : seulement top-ups, pas de pool mensuel intégré
- [ ] Refuser : garder WS-2 tel quel (3 tiers, usage events existants)

### B2 — Si B1 = GO, cost model pour actions AI
Laquelle ?
- [ ] Mes defaults : SalesGPT query 10 cr, waterfall email 20 cr, signal agent 50 cr/mo, meeting summary 10 cr, pipeline analysis 20 cr
- [ ] Différent : je veux revoir la table (attends ma spec séparée)
- [ ] N/A (B1 refusé)

### B3 — Scope WS-2 actuel touche-t-il la prod ?
- [ ] Oui, il y a déjà des clients en prod → spec séparée WS-3 nécessaire, pas de migration en place
- [ ] Non, on peut itérer sur WS-2 directement
- [ ] Je ne sais pas, investigue d'abord

---

## 🟡 90-day guarantee équivalent (N6) — choix à faire

### C1 — Adopter une version LeadSens de la "performance guarantee" ?
- [ ] GO : ajouter aux CGV + homepage (wording à rédiger ensemble)
- [ ] Skip : nos CGV actuels suffisent
- [ ] Attendre de voir si des prospects demandent

### C2 — Si C1 = GO, critère déclencheur
- [ ] Mon default : "3 meetings nouveaux attribués à LeadSens à J+30, sinon remboursement + archivage lecture seule 12 mois"
- [ ] Plus strict : "5 meetings à J+60"
- [ ] Plus souple : "1 meeting à J+14"
- [ ] À rediscuter

---

## 🟡 FUSE-GAP-1 person email waterfall (N8) — décisions contractuelles

Spec Kiro prête (`_specs/FUSE-GAP-1-person-email-waterfall/`). Pour démarrer Phase 5 (build), il me faut :

### D1 — Contrat Dropcontact (provider #1 du waterfall, EU-first)
Choix :
- [ ] Signer plan gratuit (limite ~50 lookups/mois) pour MVP/dev
- [ ] Signer plan payant (€49+/mois, contact commercial Dropcontact) pour prod dès v1
- [ ] Autre provider EU préféré (lequel ? Kaspr ?)
- [ ] Skip Dropcontact, faire waterfall Hunter + provider US seulement

### D2 — Contrat Hunter (provider #2, large coverage US)
- [ ] Signer Starter (€49/mo → 500 req/mo)
- [ ] Signer Growth (€149/mo → 2000 req/mo) pour anticiper le volume Pro
- [ ] Skip Hunter, faire solo Dropcontact
- [ ] Autre provider US préféré (lequel ? Findymail ? RocketReach ?)

### D3 — Caps par plan (confirmer mes defaults ?)
- [ ] OK mes defaults : Free trial 20 total / Starter 200 /mo / Pro 2000 /mo / Enterprise custom
- [ ] Différent (dis-moi les chiffres)
- [ ] Investigue d'abord les coûts réels avant de fixer

### D4 — Branche de build
- [ ] OK : `feat/FUSE-GAP-1-person-enrichment` off `main`
- [ ] Autre nom de branche
- [ ] Merger sur `feat/journey-audit-haute` directement (batch)

### D5 — Qui implémente ?
- [ ] Je peux commencer en autonomie dès que D1+D2+D3 cochés
- [ ] Tu préfères review la spec d'abord plus en détail
- [ ] Attribuer à quelqu'un d'autre de ton équipe

---

## 🟡 Apollo — décisions collatérales

Apollo est notre seul provider account-level actuellement, bloqué sur People Search côté trial.

### E1 — Upgrade Apollo plan pour unlock People Search ?
- [ ] GO : passer à Apollo Basic $49/mo (unlock People Search limité)
- [ ] GO : passer à Apollo Pro ($99/mo, unlimited People Search)
- [ ] Skip : on attend FUSE-GAP-1 pour faire du person enrichment en propre
- [ ] Migrer hors Apollo complètement

---

## 🟡 Budget test FuseAI (BUDGET.md)

Si on veut encore plus d'intelligence sur FuseAI (Signals en prod, API test, SalesGPT deep):

### F1 — Upgrader le compte Fuse Free vers Launch ?
- [ ] GO : $159 mensuel (1 mois, puis cancel) — Option B du BUDGET
- [ ] GO : $119 annuel ($1 428 total, le moins cher par mois mais commit annuel)
- [ ] Skip : l'analyse Free-tier + public a suffi

### F2 — Upgrader vers Scale ($399/mo) ultérieurement ?
- [ ] À décider seulement après F1
- [ ] Skip définitivement

---

## 🟢 Décisions déjà cochées (référence)

- [x] N1 — BATTLECARD produit ✓ (2026-04-15)
- [x] N2 — Homepage 3-adversaires shipped ✓ (commit `bca94b0`)
- [x] N3 — N/A, on fait déjà mieux que Fuse (magic link vs 6-digit OTP)
- [x] N4 — check-email.js étendu ✓ (commit `f62129b`)
- [x] N7.1 — Page SEO vs-FuseAI-FR draft ✓
- [x] N8 spec Kiro ✓ (en attente de D1+D2+D3)
- [x] N11 — SKIP Power Dialer 2026 confirmé

---

## Comment m'envoyer tes réponses

1. **Plus simple** : édite ce fichier et remplace `[ ]` par `[x]` sur tes choix, puis "voilà"
2. **Plus rapide** : dis-moi "A1 A3 D1:2 D2:1 D3:1 D5:1" (codes) — je reconstitue
3. **En free-form** : "Go A1 A3 A4, pour D1 prends le payant Dropcontact, D2 Starter Hunter, laisse le reste pour plus tard" — je traduis

Dès que j'ai le signal, j'exécute en série. La priorité d'exécution par défaut sera :
**A1 → A3 → A4/A5 (specs en parallèle) → D1-D5 (si cochés) → start build FUSE-GAP-1**

Tous les choix qui demandent de l'argent (D1, D2, E1, F1) : **je ne dépense rien sans ta validation cochée explicitement**.
