# Audit approfondi — 18 pages Settings

## Structure générale
**Layout :** `app/(dashboard)/settings/layout.tsx` — sidebar gauche en 4 groupes.

| Groupe | Pages |
|---|---|
| **Account** | Profile, Agent |
| **Workspace** | Custom Objects, Data Model, General, ICP & Product, Knowledge, Mail & Calendar, Members, Notifications, Opportunity Stages, Recording, Workflows |
| **Developer** | MCP Integration |
| **Billing** | Billing |

Sidebar active state via accent color, groupes en en-têtes majuscules gris.

---

## 1. Profile — `/settings/page.tsx` (173 lignes) ✅
- Champs : First name, Last name (email read-only)
- Language : 10 langues (EN, FR, DE, ES, PT, IT, NL, JA, KO, ZH)
- Timezone : fallback 11 fuseaux hardcodés + Intl API
- Bouton Update + badge "Saved" 3 s
- Section "Email & Calendar" = lien vers `/settings/mail-calendar`
- `GET|PUT /api/settings/profile`
- **Manquants :** validation frontend minimale, timezone fallback incomplet

## 2. Billing — `/settings/billing/page.tsx` (283 lignes) ✅
Intégration Stripe complète :
- Plan actuel + bouton Upgrade / Manage (Stripe Customer Portal)
- Jours restants trial / date renouvellement, alerte annulation
- **Usage This Period** 3 mètres : contacts enriched, emails sent, AI queries (Unlimited pour Pro) — barre de progression + warning à 80 %
- Plans **hardcodés** (lignes 29-40) :
  - trial : `{ contacts: 100, emails: 50, ai: 100 }`
  - starter : `{ contacts: 1000, emails: 500, ai: 500 }`
  - pro : `{ contacts: 10000, emails: 5000, ai: -1 }`
- Endpoints : `/api/billing/usage`, `/subscription`, `/portal`, `/checkout`
- **Manquants :** historical usage par mois, factures/receipts

## 3. Data Model — `/settings/data-model/page.tsx` (284 lignes) ✅
- Tabs entités : Company / Contact / Deal
- Champs natifs read-only (domain pour company, email pour contact, stage pour deal…)
- Champs personnalisés CRUD inline : Name + Type (text/date/number/single_select/multi_select/url/social_handle/address/markdown) + AI mode (off/suggest/auto)
- `GET|PUT /api/settings/data-model`
- **Manquants :** descriptions de champs (pour AI), options select non éditables après création, pas de validation dupes, UX inline trompeuse

## 4. Evals — `/settings/evals/page.tsx` (387 lignes) ✅ admin-probable
- Sidebar : datasets list + "Seed from Chat" + "+Create"
- Main (dataset sélectionné) : Run Eval, Add Case (input/expectedOutput/tags CSV), Recent Runs (date/model/pass rate), cases list
- Main (run sélectionné) : 4 summary cards (Pass Rate, Mean Score, Cases, Regressions), regressions alert, results table (input/score/latency/grader reasoning)
- Endpoints : `/api/eval/datasets`, `/datasets/{id}/cases`, `/runs`, `/runs/{id}`, `/seed`
- LLM-as-judge : score 0-1, pass/fail
- **Manquants :** edit case, delete dataset/run, grader model config UI, export
- **⚠ Pas de gate UI admin côté page**

## 5. ICP & Product — `/settings/icp/page.tsx` (351 lignes) ✅
- Product Context : product desc, sales motion (SALES_MOTIONS), primary challenge, AI tone (Direct/Friendly/Formal/Casual/Technical)
- Target Industries : tags + MultiSelectDropdown custom (lignes 288-351)
- Company Sizes : toggle buttons
- Decision-Maker Roles : textarea + quick-add 20 rôles
- Geographies : tags + searchable dropdown
- `GET|PUT /api/settings/icp`
- **Manquants :** templates ICP pré-faits, pas de "Custom" sur AI tone

## 6. Knowledge — `/settings/knowledge/page.tsx` (161 lignes) ✅
- "+ Add knowledge" → crée topic vide avec `id: "temp-" + Date.now()`
- Card par topic : Topic input + Content textarea + Save + Remove
- `GET /api/settings/knowledge`, `POST` (create), `PUT` (update), `DELETE?id=`
- **Manquants :** pas de RAG/vectorization config, pas d'upload documents (Notion/Drive non présent), pas de preview du prompt AI, UX "temp-" si save échoue

## 7. Mailboxes — `/settings/mailboxes/page.tsx` (6 lignes) 🔄 redirect
Redirige vers `/settings/mail-calendar`.

## 8. Mail & Calendar — `/settings/mail-calendar/page.tsx` (563 lignes) ✅
### Section 1 — Connected Accounts
- Card par compte : email + status badge (Active/Syncing/Warming up/Error)
- Provider icons Google/Microsoft
- Last email sync, Calendar connected checkmark
- Daily sent/limit + health score %
- Warmup progress bar si `warming_up`
- Actions : Skip warm-up, Delete
- "Force sync now" bouton
- Empty state + setup OAuth buttons Google + Microsoft + Shield "Never store password"

### Section 2 — Sync Preferences
- Contact Creation Mode : radio Disabled / Selective (ICP match) / Always
- Email Sync Lookback : select 1m/3m/6m/12m
- Ignored Domains : 14 defaults (gmail/yahoo/outlook…) + input custom

### Warmup logic
21-day warmup SMTP. Progress `(daysSinceStart / 21) × 100`. Daily target enveloppe.

### Endpoints
- `GET /api/settings/mail-calendar`
- `POST /api/email/sync` (force)
- `DELETE /api/settings/mailboxes?id=`
- `PATCH /api/settings/mailboxes?id=&action=skip-warmup`
- **Ligne 151 : `PUT /api/settings/privacy` — BUG (devrait être /api/settings/mail-calendar)**
- `signIn("google" / "microsoft-entra-id")`

### Manquants
- 🐛 **BUG endpoint sync preferences** : appelle `/api/settings/privacy` au lieu de `mail-calendar` → sync prefs ne se sauvegardent pas
- Pas de sélection multi-comptes (global only), pas de détail bounce/spam, pas de SMTP/IMAP manuel, calendar sync non editable

## 9. MCP Integration — `/settings/mcp/page.tsx` (495 lignes) ✅ admin-probable
- Connection Details : MCP Server URL (copiable), Protocol "JSON-RPC 2.0 over HTTP POST with Bearer token"
- API Keys : banner clé créée ("Copy now - won't be shown again"), création form + list (name, key prefix, createdAt, lastUsedAt + Delete)
- Setup Instructions : Claude Desktop (config JSON), Claude Code (`claude mcp add`), cURL example
- Available Tools : hardcoded 12 (search_records, get_contact, list_contacts, create_contact, log_note, search_crm, etc.)
- Endpoints : `GET|POST|DELETE /api/mcp/keys`
- **Manquants :** pas de rotation, usage monitoring, rate limits configurables, tools list dynamique
- **⚠ Pas de gate UI admin**

## 10. Members — `/settings/members/page.tsx` (137 lignes) ⚠ partiel
- Count members en titre
- **Invite section : input email + role select + button "Invite" — button disabled hardcoded, pas d'onClick, texte "Invite functionality coming soon."**
- Members list : avatar initials + name + email + role select (change via API)
- Endpoints : `GET /api/settings/members`, `PUT` (change role)
- **🐛 BUG Invites stub** : UX déceptive
- **Manquants :** suppression membres, workflow email invitations avec pending list

## 11. Notifications — `/settings/notifications/page.tsx` (180 lignes) ✅
- Slack Integration : webhook URL input + Save + badge "Connected" si présent
- Notifications table groupées par categories (Pipeline/Tasks/Meetings/Outreach/Prospecting/System)
- Par pref : label + description + 3 toggles (Slack, Email, In-app)
- Slack toggle disabled `(--)` si pas de webhook
- **Prefs hardcodées** (lignes 19-30) : deal_risk, deal_won, deal_lost, task_due, task_assigned, meeting_upcoming, sequence_reply, enrichment_done, new_contact, system
- Endpoints : `GET|PUT /api/notifications/preferences`
- Auto-save toggle
- **Manquants :** prefs dynamiques par workspace, custom rules, template editing

## 12. Custom Objects — `/settings/objects/page.tsx` (597 lignes) ✅
- Object types list : cards avec Icon (14 dispo), name, field count, slug, Edit + Delete (confirm)
- Create/Edit modal : plural/singular name, icon picker 14 icons, fields inline (Name + Type + Required toggle + Add + options CSV si select)
- **Field types :** text, number, date, select, url, boolean
- Structure : `{ id: slug, name (plural), nameSingular, icon, fields: FieldDef[] }`
- Endpoints : `GET|POST|PUT|DELETE /api/custom-objects`
- **Manquants :** validation dupes slug, pas de field relationships (FK), pas de field ordering, pas de delete field dédié

## 13. Privacy — `/settings/privacy/page.tsx` (5 lignes) 🔄 redirect
Redirige vers `/settings/mail-calendar`.

## 14. Recording — `/settings/recording/page.tsx` (106 lignes) ✅
- Toggle "Auto-record meetings" — bot rejoint automatiquement
- Bot display name input (default : "Elevay Notetaker")
- Help text : "This name appears when the bot joins your meetings"
- Save + badge
- Endpoints : `GET|PUT /api/settings/workspace` (recordingEnabled, recordingBotName)
- **Manquants :** provider selection (Meet/Zoom/Teams), transcript config (language/format), webhook delivery config

## 15. Opportunity Stages — `/settings/stages/page.tsx` (215 lignes) ✅
- **In Progress section :** list + color dot (grey/amber/emerald), per stage : Name + Description + AI mode toggle (auto/suggest/off) + Remove, Add stage button
- **Done section :** idem, info dot color
- Save stages button
- Structure : `{ id, name, description, category: "in_progress"|"done", aiFillMode }`
- Endpoints : `GET|PUT /api/settings/stages`
- **Manquants :** pas de drag-drop reordering, validation dupes, color customization

## 16. Workflows — `/settings/workflows/page.tsx` (369 lignes) ⚠ Beta
- Badge "Beta" + "Create workflow"
- Create form : Name + When (trigger) + Then (action) + conditional inputs + action params + Create/Cancel
- Workflows list : Play/Pause icon, Name, trigger → action description, run count + last run, Delete
- **Triggers (11) :** deal_stage_changed, deal_won, deal_lost, contact_created, account_created, email_received, task_due, score_changed, enrichment_completed, sequence_reply_received, meeting_completed
- **Actions (9) :** send_notification, create_task, send_email, enroll_sequence, assign_owner, add_tag, update_field, call_webhook, ai_action
- Conditional params affichés pour certains triggers
- Endpoints : `GET|PUT /api/settings/workflows`
- **🐛 Limitation :** `actions: [{ type, params }]` **single action hardcoded** (ligne 112-126)
- **Manquants :** pas d'édition (seulement delete), pas de multi-action, pas de AND/OR condition grouping, pas de testing/dry-run, params UI primitif

## 17. Workspace — `/settings/workspace/page.tsx` (149 lignes) ✅
- Workspace name : input + Update + "Saved"
- Domains : tags avec remove + input + Add (Enter key)
- **Danger zone :** Delete workspace disabled, texte "Contact support…"
- Endpoints : `GET|PUT /api/settings/workspace` (name, companyDomains)
- **Manquants :** transfer/handoff, backup/export settings

## 18. Agent — `/settings/agent/page.tsx` (68 lignes) ✅
- Toggle "Record creation and updates" : Ask every time / Auto-run
- Description : "Choose whether or not record creation and field updates require approval in chat"
- Auto-save + "Saved"
- Endpoints : `GET|PUT /api/settings/workspace` (agentApprovalMode)
- **Manquants :** seulement 1 setting (approval mode), pas de tone/constraints agent

---

## Synthèse par statut

| Page | Statut | Fonctionnalité | Issues |
|---|---|---|---|
| Profile | ✅ | Profile editable | Validation frontend minimale |
| Billing | ✅ | Stripe complete | — |
| Data Model | ✅ | Schema editable | Options select non éditables |
| Evals | ✅ | Dashboard complet | Pas de delete, pas de gate UI |
| ICP | ✅ | Multi-select complet | Pas de templates |
| Knowledge | ✅ | CRUD simple | Pas de RAG config |
| Mailboxes | 🔄 | Redirect | — |
| Mail & Calendar | ✅ | OAuth complet | **BUG endpoint privacy** |
| MCP | ✅ | API keys + setup | Pas de rate limits, pas de gate UI |
| Members | ⚠ | Role management | **Invite stub non fonctionnel** |
| Notifications | ✅ | Multi-channel | Prefs hardcodées |
| Objects | ✅ | Schema-less CRUD | Pas de relationships |
| Privacy | 🔄 | Redirect | — |
| Recording | ✅ | Bot toggle | Pas de provider select |
| Stages | ✅ | Pipeline editable | Pas de reordering |
| Workflows | ⚠ | Builder Beta | **Pas d'édition, single action hardcoded** |
| Workspace | ✅ | Metadata | Delete = contact support only |
| Agent | ✅ | Approval mode | Minimal settings |

---

## Bugs critiques identifiés

### 🐛 1. Mail & Calendar — endpoint mismatch (ligne 151)
```ts
// Actuel :
await fetch("/api/settings/privacy", {
  method: "PUT",
  body: JSON.stringify({ contactCreationMode, backsyncRange, doNotTrackDomains }),
});
// Devrait être :
await fetch("/api/settings/mail-calendar", { ... });
```
**Impact :** les préférences de sync ne sauvegardent pas (requête au mauvais endpoint).

### 🐛 2. Members — Invite button stub (ligne 82)
```tsx
<Button variant="gradient" disabled={!inviteEmail.trim()}>
  Invite
</Button>
```
Pas d'`onClick`. Texte "coming soon". **UX déceptive totale.**

### 🐛 3. Workflows — single-action hardcoded (ligne 112-126)
```ts
actions: [{ type: newWorkflow.actionType, params: { ... } }],  // 1 action only
```
Impossible de faire des workflows multi-steps. Pas de branching / fallback.

---

## Forces globales
- Hiérarchie sidebar claire (Account/Workspace/Developer/Billing)
- Pattern UI cohérent (title, description, cards, inputs, badge Saved)
- State management React standard (useEffect fetch + useState)
- OAuth Mail/Calendar complet
- Stripe intégration complète
- Customization forte (Data Model, Objects, Stages éditables)

## Faiblesses globales
- Validation frontend minimaliste (trim/empty seulement)
- Endpoint inconsistencies (mail-calendar → privacy)
- Features incomplètes (Members invites, Workflows multi-action)
- Beaucoup de constantes hardcodées (industries, notifications, plans billing)
- Pas d'error boundaries par page
- UX complex config primitive (Workflows, fields)
- Pas de undo/rollback (changes immédiats)

---

## Priorités de correction

**High :**
1. Fixer bug endpoint mail-calendar → `/api/settings/mail-calendar`
2. Implémenter Members invites (email + pending list)
3. Workflows multi-actions (array au lieu de single)

**Medium :**
4. Validation frontend (email format, field unicity)
5. Constantes backend-driven (ICP industries, notif prefs, plans billing)
6. Error handling (try-catch + error boundaries)

**Low :**
7. Workflows visual builder (Zapier-like), drag-drop stages
8. Custom notification rules, field relationships, Notion/Drive sync
