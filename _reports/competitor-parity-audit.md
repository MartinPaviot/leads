# Audit de Parité Concurrentielle — LeadSens vs Monaco vs Lightfield

**Date**: 2026-04-08
**Méthode**: Lecture exhaustive des teardowns v2 + vérification code actuel
**Source**: teardown-monaco-v2/teardown.md, teardown-lightfield-v2/*.md

---

## MONACO — Point par point

### M1: Build TAM — Table Comptes
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Checkbox de sélection par row | Non implémenté | ❌ MANQUANT |
| Company name + small colored icon/logo | CompanyLogo Clearbit + initiales | ✅ FAIT |
| Status pill "New"/"Prospecting" (vert) | Lifecycle stage badges colorés | ✅ FAIT |
| Score "A 🔥 Burning" | Cercle coloré + emoji + heat label | ✅ FAIT |
| Industries multi-tags colorés | PropertyBadge auto-colored | ✅ FAIT |
| Colonne "Connected to" (team members) | Non implémenté — pas de concept de "qui connaît qui dans l'équipe" | ❌ MANQUANT |
| Custom boolean "Common Investor?" | Custom signal columns configurables | ✅ FAIT |
| Custom boolean "Sales-led growth?" | Custom signal columns | ✅ FAIT |
| Custom boolean "YC Company?" | Idem | ✅ FAIT |
| Row height ~36px compact | padding 7px 10px → ~36px | ✅ FAIT |
| Sort icons on every column | Headers cliquables avec sort | ✅ FAIT |

### M2: Signal Reasoning Panel
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Two tabs: "Reasoning" / "Sources" | Tabs ajoutés dans Phase 7 | ✅ FAIT |
| Source cards with site favicons | Clearbit favicon sur les source URLs | ✅ FAIT |
| Reasoning text AI-generated | Signal reasoning + sources dans popover | ✅ FAIT |

### M3: Execute Sequences
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Vertical step timeline with connecting lines | Ligne verticale continue + dots | ✅ FAIT |
| "Wait X business days" between steps | "Wait X days" (calendar, pas business) | ⚠️ PARTIEL — pas de distinction business days |
| Header "Sam Blond to Alex Shan (Co-Founder)" | Pas de header sender→recipient dans les séquences | ❌ MANQUANT |
| Physical gift (Veuve Clicquot) integration | Non implémenté | ❌ SKIP (logistics complexe) |
| Start/Reject buttons (thumbs-down + "Start") | Pas de boutons approve/reject inline | ⚠️ PARTIEL — autopilot existe mais UX différente |

### M4: Meeting Notes + Structured Extraction
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Video call recording with playback | Recall.ai integration | ✅ FAIT |
| AI Meeting Notes: Summary + Key Points | Meeting summaries + structured notes | ✅ FAIT |
| Auto-extract: Budget ($30K) | Extraction budget → deal + account | ✅ FAIT (Phase 7) |
| Auto-extract: Team Size (4) | Extraction teamSize → deal + account | ✅ FAIT (Phase 7) |
| Auto-extract: Current CRM (Hubspot) | Extraction currentTools → deal + account | ✅ FAIT (Phase 7) |
| Auto-extract: Point Solutions (Apollo, Fireflies) | Extraction competitors → deal + account | ✅ FAIT (Phase 7) |
| Structured card view (👥 Size, 📋 CRM, 💰 Budget) | Extraction stockée dans properties JSONB, pas de card view dédiée | ⚠️ PARTIEL — data extraite mais pas affichée dans un card view structuré sur la page account |
| "Updating..." loading state pendant extraction en temps réel | Non implémenté — extraction post-call, pas en temps réel | ❌ MANQUANT |

### M5: Pipeline Kanban
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Deal cards: name + $value + company icon | CompanyLogo + name + value | ✅ FAIT |
| Selected deal: blue left border | Risk-based left border (red/orange/green) | ✅ FAIT (variante) |
| Lightning bolt ⚡ momentum indicator | ⚡ emoji si 3+ activités récentes | ✅ FAIT |
| Deal overview panel: Summary + Timeline | Deal summary + activity timeline | ✅ FAIT |
| Auto-generated timeline from interactions | Timeline avec dates et types d'interaction | ✅ FAIT |
| Owner assigned | Owner avec avatar + nom | ✅ FAIT |
| Expected close date | Close date avec alerte overdue | ✅ FAIT |

### M6: Ask Monaco — CRO Copilot
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Floating overlay chat (~400x350px) | Full-page chat (pas overlay) | ⚠️ DIFFÉRENT — design choice, pas un gap |
| "Ask AI" header with sparkle | "Ask Elevay..." input avec sparkle | ✅ FAIT |
| Bold heading coaching ("You Lost Control") | Prompt coaching direct + confrontational | ✅ FAIT (Phase 7) |
| Specific behavioral bullets | Prompt exige citations exactes des emails/meetings | ✅ FAIT (Phase 7) |
| Follow-up input | Chat input persistant | ✅ FAIT |
| Quick-action menu (Overview, Sequences, Summary, Opps) + freeform | Suggestions data-driven par rôle/challenge | ✅ FAIT |

### M7: Daily Dashboard (HERO VIDEO DISCOVERY)
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| "Good morning, Sam" greeting | "Good afternoon, Martin" greeting | ✅ FAIT |
| Weekly summary banner (45 sequences, 12 responses, 2 meetings, 8 closed) | Stats conditionnelles (outbound si actif, founder sinon) | ✅ FAIT |
| "Your priorities today" with stall detection | Priority cards avec "Stalled" badges | ✅ FAIT |
| Deal-specific priorities: "Nudge Alex Shan" + $30K + "Stalled 3 days" (red) | Cards avec dealValue + daysSilent | ✅ FAIT (Phases 1+2) |
| Task priorities: "Set up Slack channel" + due date + deal value | Tasks avec account name + overdue badge | ✅ FAIT |
| "Your 2 meetings today" | Today's meetings section | ✅ FAIT |
| Inline email preview on click priority | Non implémenté — clic route vers la page entité | ❌ MANQUANT |
| AI-drafted nudge email dans le panel | Non implémenté — pas de rédaction automatique de nudge inline | ❌ MANQUANT |
| "Respond from inbox" button | Non implémenté | ❌ MANQUANT |
| Bottom navigation toolbar (8 icons) | Sidebar navigation | ✅ FAIT (design choice différent) |

### M8: Contact Expansion Under Account
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Expand account row → show suggested contacts | API /suggested-contacts existe, UI sur detail page | ⚠️ PARTIEL — pas d'expansion inline dans la table, seulement sur detail page |
| "Suggested" status badge (green) | Badge "Suggested" sur les suggestions | ✅ FAIT |

### M9: Email Thread + Suggested Reply
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Email thread view avec réponses | Inbox page avec emails + reply snippets | ✅ FAIT |
| Suggested reply pre-drafted | API suggested-replies existe (brief/detailed/decline) | ✅ FAIT |
| Formatting toolbar (B/I) | EmailComposer existe mais pas de rich text toolbar | ⚠️ PARTIEL |

### M10: Auto-Generated Follow-Up Email
| Détail Monaco | LeadSens | Status |
|--------------|----------|--------|
| Post-meeting auto follow-up avec action items | Post-call route génère follow-up email | ✅ FAIT |
| "Send" button vert | EmailComposer avec send button | ✅ FAIT |

---

## LIGHTFIELD — Point par point

### L1: Entity Scoping Badge
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Colored badge "🟦 Meridian Labs" above chat input on entity pages | ScopedChat avec context badge | ✅ FAIT |

### L2: Confirmation Cards
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Create cards with editable fields | ActionCard avec champs éditables | ✅ FAIT |
| "Ask every time" / "Auto-run" permission dropdown | agentApprovalMode dans settings | ⚠️ PARTIEL — setting global, pas per-action dropdown |
| Sequential creation (account → contact) | Sequential workflow via system message | ✅ FAIT |
| Buttons disabled after approval | Status tracking (pending→approved→dismissed) | ✅ FAIT |

### L3: Inline Entity Links
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Clickable badges in chat responses | EntityLink component + ChatMarkdown | ✅ FAIT |
| Opens slide-over panel | SlideOver integration | ✅ FAIT |

### L4: Process Transparency
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| "Ran code" / "Retrieved data" / "Analyzed data" panels | ToolCallGroup avec labels de transparence | ✅ FAIT |
| Collapsible with expandable raw data | Collapsible panels | ✅ FAIT |

### L5: Email Composer Slide-Over
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Full composer: To (pills), From, Subject, Body | EmailComposer avec tous les champs | ✅ FAIT |
| Auto-populated from CRM | Pré-rempli depuis le chat | ✅ FAIT |
| Real Send button | Send fonctionnel | ✅ FAIT |

### L6: Multi-Language
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| French queries → French responses | G10 multi-language détection | ✅ FAIT |
| French table headers (Opportunité, Compte, Étape) | Dépend de la réponse LLM — pas de contrôle UI direct | ⚠️ PARTIEL — le LLM répond en français mais les headers de table UI sont en anglais |
| Language preference in settings | language field dans tenant settings | ✅ FAIT (Phase 2) |

### L7: Account Detail Page
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| AI-generated "Account summary" | API /summarize existe | ✅ FAIT |
| AI-generated "About their business" | Description enrichie | ✅ FAIT |
| Inline-editable fields (click to set) | Pas d'édition inline — nécessite formulaire | ❌ MANQUANT |
| Scoped chat on account page | ScopedChat | ✅ FAIT |
| Two view modes: side panel + full page | SlideOver + full page (/accounts/[id]) | ✅ FAIT |

### L8: Data Model / Custom Fields
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Custom field creation UI | Data model settings page | ✅ FAIT |
| 8 field types (Text, Date, Select, etc.) | Types supportés dans custom-fields.ts | ✅ FAIT |
| Per-field AI fill mode (Auto/Suggest/Off) | aiFillMode per field | ✅ FAIT |
| "Create field" button | Create field dans settings | ✅ FAIT |
| Fields rendered in tables | Custom field columns | ✅ FAIT |

### L9: Opportunity Stages
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Configurable stage names | Pipeline stages settings | ✅ FAIT |
| Stage descriptions as AI training | Descriptions + aiFillMode | ✅ FAIT |
| AI auto-progression based on descriptions | Deal progression cron | ✅ FAIT (Phase 2) |

### L10: Settings Completeness
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Profile (name, email) | Profile settings | ✅ FAIT |
| Language/timezone | Language + timezone settings | ✅ FAIT (Phase 2) |
| Mail & Calendar config | Mail-calendar settings page | ✅ FAIT |
| Backsync range (1-24mo) | Backsync range setting | ✅ FAIT |
| Do-not-track domains | Do-not-track domains | ✅ FAIT |
| Auto-creation mode | Contact creation mode | ✅ FAIT |
| Agent permissions | Agent approval mode | ✅ FAIT |
| Knowledge base (multi-topic) | Knowledge page multi-topic | ✅ FAIT |
| Notification preferences (3 channels) | 3-channel notifications | ✅ FAIT |
| Data model | Data model settings | ✅ FAIT |
| Opportunity stages | Stages settings | ✅ FAIT |
| Workspace settings | Workspace settings | ✅ FAIT |
| Domain exclusion | Company domains exclusion | ✅ FAIT |
| Members/roles | Members page | ✅ FAIT |
| MCP connectors | MCP settings | ✅ FAIT |
| Workflows (Beta) | Workflow automation | ✅ FAIT |
| Recording settings | Pas de settings recording | ❌ MANQUANT |
| Import history | Import history UI | ✅ FAIT (Phase 6) |
| API keys (Beta) | MCP API keys | ✅ FAIT |

### L11: Chat Suggestions
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| 8 suggested prompts | 6 suggestions data-driven | ✅ FAIT |
| Vertical full-width buttons | Grille 1-2 colonnes avec pills | ⚠️ STYLE DIFFÉRENT |
| Clickable → pre-fill | Click → send message | ✅ FAIT |

### L12: Upload File
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Upload button in chat | Non implémenté | ❌ MANQUANT |

### L13: Microphone (voice input)
| Détail Lightfield | LeadSens | Status |
|------------------|----------|--------|
| Microphone icon on chat input | Non implémenté | ❌ MANQUANT |

---

## RÉSUMÉ DES GAPS RÉELS RESTANTS

### ❌ MANQUANTS (features non implémentées)

| # | Gap | Concurrent | Impact | Effort |
|---|-----|-----------|--------|--------|
| 1 | Row checkbox selection (bulk actions UI) | Monaco | Medium | M |
| 2 | "Connected to" column (team relationship mapping) | Monaco | Medium | L |
| 3 | Inline email preview on dashboard priority click | Monaco | High | L |
| 4 | AI-drafted nudge inline dans le dashboard | Monaco | High | L |
| 5 | "Respond from inbox" button sur priorities | Monaco | Medium | S |
| 6 | Real-time extraction "Updating..." pendant meeting | Monaco | Low | XL |
| 7 | Structured extraction card view sur account page | Monaco | Medium | M |
| 8 | Inline-editable fields sur account detail (click to set) | Lightfield | Medium | L |
| 9 | Recording settings (toggle, custom name, avatar) | Lightfield | Low | S |
| 10 | File upload dans le chat | Lightfield | Low | M |
| 11 | Voice input (microphone) dans le chat | Lightfield | Low | M |

### ⚠️ PARTIELS (implémentés mais pas au même niveau)

| # | Gap | Détail | Effort |
|---|-----|--------|--------|
| 12 | Business days vs calendar days dans les séquences | Monaco utilise "business days", nous "days" | S |
| 13 | Sequence header "From X to Y (Title)" | Monaco montre sender→recipient avec titre | S |
| 14 | Rich text toolbar dans email composer | Monaco a B/I/listes, nous avons textarea | M |
| 15 | Per-action permission dropdown | Lightfield a "Ask every time"/"Auto-run" par action | M |
| 16 | French UI table headers (pas juste réponses) | Lightfield traduit les headers de table dans le chat | S |
| 17 | Contact expansion inline dans la table accounts | Monaco expand la row, nous c'est sur la page detail | M |
| 18 | Structured extraction affiché comme card (👥📋💰) | Data extraite mais pas de card dédiée | M |
