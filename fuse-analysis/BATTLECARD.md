# LeadSens vs FuseAI — Competitive battlecard
_v1 · 2026-04-15 · pour conversations sales et prospect diligence_

## 60-sec pitch vs Fuse

> "Fuse est un **sync layer d'outbound** qui pousse vers Salesforce/HubSpot. LeadSens est **le CRM lui-même**, avec zéro saisie manuelle, une mémoire schema-less qui s'étend à ton cycle, et un chat qui fait 116 opérations métier. Tu remplaces Salesforce + Outreach + Apollo. Eux, ils s'ajoutent par-dessus."

## Les 3 questions qu'un acheteur posera (et nos réponses)

### Q1. "Fuse a 800M contacts dans sa DB. Vous ?"

**Réponse** : Deux choix d'architecture opposés.

- **Fuse** = DB propriétaire 800M contacts (en pratique 700M selon leur propre doc API, et industry tagging faible — on a testé : Livestorm classé "Computer Hardware", Jimini AI idem). Une liste "SaaS Paris" nous a retourné **35 % de précision** (Heschung chaussures y apparaît).
- **LeadSens** = waterfall Apollo + LLM fallback côté account, sans lock-in sur un provider. **Si ton ICP est connu de toi**, la donnée se récupère à la demande, sans payer pour 700M profils qu'on n'utilisera jamais.

Positionnement : "Nous vendons un CRM qui enrichit, pas une DB qui joue au CRM."

> **Gap honnête à combler** : on n'a pas encore d'enrichment *person-level* (email waterfall sur personne). Aujourd'hui on fait l'enrichment account-level. Priorité P1 si on va contre Fuse fréquemment. (cf. NEXT_ACTIONS.md §2)

### Q2. "Fuse fait email + LinkedIn + Power Dialer. Vous ?"

**Réponse** : Email + LinkedIn via sync natif Gmail/Microsoft — et **chat + CRM + meeting bot** en natif.

- **Fuse** = email/LinkedIn + Power Dialer via Plivo. Channels sortants, sans CRM. Pour conserver les deals il faut sync vers Salesforce/HubSpot/Attio → 2 outils à maîtriser.
- **LeadSens** = Gmail + Outlook OAuth (deal-capture automatique depuis l'inbox), Meetings avec bot (transcription en pipeline), Tasks/Notes natifs. **Zéro saisie**.

Positionnement : "Fuse automatise l'outbound. Nous automatisons **tout le cycle** — de l'inbound signal au closing."

> **Gap honnête** : pas de Power Dialer. Pour un rep cold-calling hardcore Fuse est supérieur aujourd'hui. Positionner LeadSens pour les fondateurs/AEs en meeting-driven sales, pas les SDRs outbound haute intensité.

### Q3. "Fuse démarre à $119/mo. Vous coûtez quoi ?"

**Réponse** : $49/mo (Starter) vs $119/mo — **59 % moins cher**, et la grille est transparente.

- **Fuse** = $119 Launch (annual) = 60K crédits/mois. **Gotcha documenté** : l'email et LinkedIn coûtent **10 crédits in-app vs 5 crédits annoncés publiquement** → un user Launch attend 12K messages mais n'en a que 6K réels.
- **LeadSens** = $49 Starter (500 emails, 1K contacts, 500 queries AI/mo). Pas de crédit caché. 14-day trial Free au lieu d'un free tier perpétuel inutilisable (Fuse Free = 40 waterfall emails max/mois).

Positionnement : "Transparence et alignement d'usage. Tu paies ton abonnement, pas un système de jetons où certaines actions coûtent 2× plus cher à l'intérieur qu'à l'extérieur."

## Où ON GAGNE

| Dimension | LeadSens | Fuse | Notre edge |
|---|---|---|---|
| **CRM natif** | Accounts + Contacts + Opportunities + Activities + Deals + Custom objects JSONB | Aucun (sync vers Salesforce/HubSpot) | **Tu remplaces, pas tu ajoutes** |
| **Chat surface** | 116 tools métier (CHAT-00/01/02 done), Slack, MCP public, Claude Desktop | SalesGPT avec 5 prompts suggérés, async background research "Thought for 31s" | **Ratio tools chat > 20×** |
| **Schema-less memory** | Custom Objects + JSONB + embedding memory + agentTraces | "Knowledge Hub" = juste un scraping config de URLs + competitor URLs | **Implémentation vs théorie marketing** |
| **Signup UX** | OAuth Google + Microsoft natif | Email + password + reCAPTCHA, **pas d'OAuth** | **Time-to-first-value 10× plus court** |
| **Multi-surface chat** | Web + Slack (slash + @mentions + interactive approval buttons) + MCP public | Web seulement | **Tu bosses depuis ton outil, pas le leur** |
| **Transparence pricing** | $0 trial (14d) / $49 / $99, no hidden unit cost | Complexe : crédits unifiés + **hidden 2× haircut** sur email/LI + contradictions blog↔page | **Trust + predictability** |

## Où ON PERD (honesty wins)

| Dimension | LeadSens | Fuse | Effort rattrapage |
|---|---|---|---|
| **Contact DB propriétaire** | Waterfall ad-hoc via Apollo | 700–800M contacts, 20+ providers | 🔴 Élevé (partenariats data) |
| **Person-level email waterfall** | Account-level only (Apollo) | 50 cr = 1 email corporate validé | 🟡 Moyen (API Hunter/Findymail/Kaspr etc.) |
| **Website visitor ID** | ❌ Pas implémenté | JS snippet + IP→person (30 % visibility claim) | 🟡 Moyen (partenariat RB2B ou similaire) |
| **LinkedIn automation native** | ❌ Pas d'automation LI | LI messaging built-in | 🔴 Élevé (LI anti-automation cat-and-mouse) |
| **Power Dialer / click-to-call** | ❌ Rien | Multi-line parallel dialer via Plivo | 🔴 Élevé (partenariat Plivo/Twilio + compliance) |
| **Signals: hiring/funding/job change** | Custom signals tenant-level + Apollo company-level | 12 agent templates (9/12 sur hiring) | 🟡 Moyen (API TheirStack/JobsPikr/News) |
| **Purchase domain/inbox in-app** | ❌ Pas implémenté | Reseller Google/Microsoft | 🟢 Faible si via API Google Workspace Admin |

## Objections frequent trap

### "Mais Fuse est agentic ! Le nouveau paradigme !"

**Réponse** : leur "Fuse Agent" page marketing réutilise mot-pour-mot le copy des pages Signals et Prospect — **même phrases recopiées**. Leur feature "agentic" en production = SalesGPT (un chat + 5 prompts suggérés). LeadSens a **116 outils chat actifs** avec tool-calling, async actions avec approval flow, mémoire de session, traces observables. On fait de l'agentic pour de vrai.

### "Leur Customer Knowledge Graph va devenir massif"

**Réponse** : j'ai créé un Knowledge Profile in-app (fuse-analysis/screenshots/082). Leur implémentation = **un formulaire de 2 champs** : "Your website URLs" + "Competitor URLs". C'est un scraping config, pas un knowledge graph. Leur marketing parle de "digital twins de customer archetypes" — dans le produit il n'y a rien de tel.

### "Fuse est backed by YC"

**Réponse** : vrai, W25 batch. Mais ils ont pivoté récemment (infra S3 bucket = `kompass-ai-public-bucket`, ancien nom), leur stats "Product Impact" sur les pages produit affichent **toutes `0%`** (placeholders jamais remplis), et leurs articles de blog se contredisent mutuellement sur leur propre pricing (60K vs 50K crédits, Unlimited seats vs 3-users, math 25 % mal calculée). Signal d'une team qui court vite mais sans discipline QA.

## Pitch négatif contre nous (ce que Fuse dira de LeadSens)

Probable :

1. **"LeadSens est un petit player français, pas scalable"** → réponse : stack Next.js + Postgres + NextAuth production-grade ; 116 chat tools observés par agentTraces ; multi-tenant JSONB ; nous servons déjà en prod.
2. **"Pas de Power Dialer"** → réponse : nous ne vendons pas aux équipes SDR 200+ appels/jour ; notre ICP = founder-led & meeting-driven sales. Power Dialer n'est pas notre Q2 priorité.
3. **"Pas de 800M contact DB"** → réponse : 800M contacts n'enrichissent pas votre pipeline si le tagging est faux à 35 %. Preuve en main (le test Fuse sur "SaaS Paris" avec Livestorm classé "Hardware").

## One-liner à retenir

> "FuseAI = 5 outils en 1 pour remplir votre Salesforce plus vite. LeadSens = le remplaçant de Salesforce qui parle déjà français et dont vous n'avez plus besoin de remplir."

---

**Sources** : `fuse-analysis/ANALYSIS.md` §1-14 + tests produit in-app (`fuse-signup@elevay.dev` Free tier 2026-04-15). Screenshots dans `fuse-analysis/screenshots/` (57 fichiers), raw dumps dans `raw/` (48 fichiers). Credits used: 50/2000 (1 waterfall email enrichment test).
