# Elevay Feature Inventory -- 2026-05-04

Exhaustive scan of `app/apps/web/src/` and `app/apps/admin/src/`.
Source: actual codebase read, not documentation.

---

## 1. API Routes (94 routes)

### Auth & Account
| Route | Method(s) | Description |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth.js handler (Google, Microsoft, Credentials providers) |
| `/api/auth/forgot-password` | POST | Send password reset email |
| `/api/auth/reset-password` | POST | Reset password with token |
| `/api/auth/invite/[token]` | GET | Validate invitation token |
| `/api/auth/invite/accept` | POST | Accept workspace invitation |
| `/api/account` | GET/PUT | Current user account info |
| `/api/account/password` | POST | Change password |
| `/api/settings/profile` | GET/PUT | User profile (name, avatar) |
| `/api/settings/members` | GET | List workspace members |
| `/api/settings/members/invites` | GET/POST/DELETE | Manage pending invitations |
| `/api/user-preferences` | GET/PUT | Per-user display preferences (columns, density) |

### CRM Core
| Route | Method(s) | Description |
|---|---|---|
| `/api/accounts/[id]` | GET/PUT/DELETE | Single account CRUD |
| `/api/accounts/[id]/contacts` | GET | Contacts belonging to an account |
| `/api/accounts/[id]/lifecycle` | GET | Account lifecycle timeline |
| `/api/contacts/merge` | POST | Merge duplicate contacts |
| `/api/deals/[id]/timeline` | GET | Deal activity timeline |
| `/api/opportunities/[id]/auto-progress` | POST | AI-suggest next deal stage |
| `/api/opportunities/[id]/health` | GET | Deal health score & risk signals |
| `/api/opportunities/[id]/timeline` | GET | Opportunity activity timeline |
| `/api/tasks/[id]` | GET/PUT/DELETE | Task CRUD |
| `/api/meetings/[id]/notes` | GET/PUT | Meeting structured notes |
| `/api/meetings/[id]/notes/send-follow-up` | POST | Send meeting follow-up email |
| `/api/meetings/upload-transcript` | POST | Upload meeting transcript |
| `/api/notes` | (notes are entity-scoped) | |
| `/api/custom-objects` | GET/POST | Custom object type instances (schema-less) |
| `/api/custom-objects/[type]/[id]` | GET/PUT/DELETE | Single custom object instance |
| `/api/views` | GET/POST/PUT/DELETE | Saved filter/sort/column views |
| `/api/export` | POST | Export records to CSV |
| `/api/search/quick` | GET | Global quick-search across entities |

### Chat & AI
| Route | Method(s) | Description |
|---|---|---|
| `/api/chat/threads` | GET/POST | List and create chat threads |
| `/api/chat/threads/[id]` | GET/DELETE | Single thread messages / delete |
| `/api/chat/suggestions` | GET | Context-aware message suggestions |

### Sequences & Email
| Route | Method(s) | Description |
|---|---|---|
| `/api/sequences/[id]` | GET/PUT/DELETE | Sequence CRUD |
| `/api/sequences/[id]/steps` | GET/POST | List/add sequence steps |
| `/api/sequences/[id]/steps/[stepId]` | PUT/DELETE | Edit/remove a step |
| `/api/sequences/[id]/autopilot` | POST | Auto-enroll top contacts |
| `/api/sequences/[id]/suggestions` | GET | AI-generated step suggestions |
| `/api/sequences/[id]/export` | GET | Export sequence contacts to CSV |
| `/api/campaigns/prepare` | POST | Prepare campaign (generate emails for all enrollees) |
| `/api/campaigns/generate` | POST | AI-generate campaign email copy |
| `/api/campaigns/[sequenceId]/status` | GET | Campaign status & metrics |
| `/api/campaigns/[sequenceId]/preview` | GET | Preview personalized emails before send |
| `/api/campaigns/[sequenceId]/launch` | POST | Launch campaign (queue drafts for send) |
| `/api/deliverability/verify` | POST | Verify email address deliverability |
| `/api/unsubscribe` | GET | Public unsubscribe link handler |
| `/api/track/click` | GET | Outbound link click tracking pixel |

### Import
| Route | Method(s) | Description |
|---|---|---|
| `/api/import/smart` | POST | Agentic CSV import (chat-driven) |
| `/api/import/smart/preview` | POST | Preview import mapping |
| `/api/import/smart/commit` | POST | Commit previewed import |
| `/api/import/history` | GET | Past import history |

### Enrichment & Scoring
| Route | Method(s) | Description |
|---|---|---|
| `/api/enrich-batch` | POST | Batch-enrich companies |
| `/api/score-contacts` | POST | Score contacts in bulk |
| `/api/score/contacts` | POST | Alternative scoring endpoint |
| `/api/onboarding/enrich-icp` | POST | Analyze website to infer ICP |
| `/api/onboarding/email-intelligence` | POST | Analyze email patterns for intelligence |
| `/api/search/tam` | GET | Search TAM (total addressable market) companies |

### Dashboard & Analytics
| Route | Method(s) | Description |
|---|---|---|
| `/api/dashboard/summary` | GET | Dashboard summary stats |
| `/api/dashboard/pipeline` | GET | Pipeline funnel metrics |
| `/api/dashboard/activity` | GET | Activity feed for dashboard |
| `/api/dashboard/alerts` | GET | Active alerts & recommendations |
| `/api/dashboard/briefs` | GET | Deal briefs (morning brief) |
| `/api/dashboard/performance` | GET | AE performance metrics |
| `/api/pipeline/analytics` | GET | Pipeline analytics (win rate, velocity) |
| `/api/priorities` | GET | Priority action items for today |
| `/api/recommendations` | GET | AI-generated recommendations |
| `/api/inbox` | GET | Unified inbox (replies, tasks, alerts) |
| `/api/voice-of-customer` | GET | Voice of customer aggregation |

### Settings & Admin
| Route | Method(s) | Description |
|---|---|---|
| `/api/settings/stages` | GET/PUT | Customize deal pipeline stages |
| `/api/settings/data-model` | GET/PUT | Custom fields definition |
| `/api/settings/custom-signals` | GET/POST/PUT/DELETE | User-defined signal definitions |
| `/api/settings/workflows` | GET/POST/PUT/DELETE | Automation workflow CRUD |
| `/api/settings/privacy` | GET/PUT | Privacy & data sync settings |
| `/api/settings/oauth` | GET/POST/DELETE | OAuth connection management |
| `/api/notifications/preferences` | GET/PUT | Notification preferences |
| `/api/features` | GET | Feature flags |
| `/api/billing/checkout` | POST | Stripe checkout session |
| `/api/billing/portal` | POST | Stripe billing portal |
| `/api/billing/subscription` | GET | Current subscription status |
| `/api/billing/usage` | GET | Usage metrics against plan limits |
| `/api/audit` | GET | Audit log viewer |
| `/api/skills/[slug]` | POST | Execute a custom skill on-demand |

### Context Graph & Eval
| Route | Method(s) | Description |
|---|---|---|
| `/api/context-graph` | GET | Query context graph |
| `/api/context-graph/stats` | GET | Graph node/edge counts |
| `/api/context-graph/ingest` | POST | Manually ingest episode into graph |
| `/api/context-graph/feedback` | POST | Edge-level feedback (approve/reject facts) |
| `/api/eval/datasets` | GET/POST | Eval dataset CRUD |
| `/api/eval/datasets/[id]/cases` | GET/POST | Eval test cases |
| `/api/eval/runs/[id]` | GET | Eval run results |
| `/api/eval/seed` | POST | Seed eval dataset with defaults |
| `/api/eval/dashboard` | GET | Eval dashboard metrics |
| `/api/recall-test` | GET | Test Recall.ai integration |

### MCP Server
| Route | Method(s) | Description |
|---|---|---|
| `/api/mcp` | GET/POST | MCP JSON-RPC 2.0 endpoint |
| `/api/mcp/keys` | GET/POST/DELETE | MCP API key management |

### Cron Endpoints
| Route | Method(s) | Description |
|---|---|---|
| `/api/cron/email-sync` | GET | Trigger background email sync |
| `/api/cron/graph-maintenance` | GET | Graph community detection & pruning |
| `/api/cron/mailbox-reset` | GET | Daily mailbox counter reset |
| `/api/cron/world-model` | GET | Nightly world-model rebuild |

### Webhooks
| Route | Method(s) | Description |
|---|---|---|
| `/api/webhooks/emailengine` | POST | EmailEngine events (messageNew, bounce, reply) |
| `/api/webhooks/resend` | POST | Resend delivery events (delivered, bounced, opened, clicked) |
| `/api/webhooks/stripe` | POST | Stripe subscription events |
| `/api/webhooks/recall` | POST | Recall.ai bot status & transcript events |

### GDPR & Compliance
| Route | Method(s) | Description |
|---|---|---|
| `/api/gdpr/delete` | POST | GDPR right-to-erasure |
| `/api/gdpr/export` | POST | GDPR data export |

### Internal/Test
| Route | Method(s) | Description |
|---|---|---|
| `/api/admin/purge-fake-data` | POST | Purge seed/fake data |
| `/api/test-e2e/cleanup` | POST | E2E test data cleanup |

---

## 2. Database Schema (48 tables)

### Auth
- `auth_user` -- NextAuth users (id, email, passwordHash, image)
- `auth_account` -- OAuth provider accounts (Google, Microsoft, Credentials)
- `auth_session` -- Active sessions
- `auth_verificationToken` -- Email verification
- `password_reset_tokens` -- SHA-256 hashed reset tokens
- `email_verification_tokens` -- SHA-256 hashed verification tokens
- `failed_signin_attempts` -- Brute-force protection (hashed identifier, IP, rate window)

### Multi-tenancy
- `tenants` -- Workspace/org (name, plan, settings JSONB)
- `users` -- App users scoped to tenant (role: admin/member)

### CRM Core
- `companies` -- Accounts (name, domain, industry, size, revenue, score, scoreReasons, properties JSONB, resolvedLogoUrl, deletedAt soft-delete)
- `contacts` -- People (email, phone, title, linkedinUrl, score, scoreReasons, properties JSONB, deletedAt)
- `deals` -- Opportunities (name, stage enum [lead->won/lost], value, currency, expectedCloseDate, summary, score)
- `activities` -- Interaction timeline (28 activity types, channel enum, direction, sentiment, threadId, intent array)
- `notes` -- Long-form notes on any entity
- `tasks` -- Action items (assignee, dueDate, status, priority)
- `comments` -- Threaded comments on any entity (parentCommentId for replies)

### Chat & AI
- `chat_threads` -- Conversation threads (contextType: global/account/contact/deal)
- `chat_messages` -- Messages with tree/fork branching (parentMessageId, branchId)
- `shared_prompts` -- Reusable prompt templates (scope: user/workspace)
- `chat_memories` -- Persistent cross-session agent memory (category, scope, key/content)
- `tool_call_events` -- Every chat tool execution with snapshot for undo
- `code_executions` -- Code sandbox execution log

### Sequences & Email
- `sequences` -- Outbound sequences (name, status, campaignConfig JSONB)
- `sequence_steps` -- Multi-channel steps (stepType: email/linkedin/sms/gift/phone_task, channelConfig JSONB)
- `sequence_enrollments` -- Contact enrollment status tracking
- `connected_mailboxes` -- Sendable mailboxes (provider, healthScore, warmup tracking, send windows)
- `outbound_emails` -- Every outbound email (full lifecycle: draft->queued->sent->delivered->opened->clicked->replied->bounced)
- `warmup_emails` -- Mailbox warmup traffic tracking
- `email_optouts` -- Global opt-out list per tenant
- `meeting_opt_outs` -- Per-meeting attendee opt-outs

### Notifications
- `notifications` -- In-app notifications (10 types)
- `notification_preferences` -- Per-type email/in-app preferences

### Context Graph
- `context_graph_nodes` -- Knowledge graph nodes (person, company, deal, email, meeting, event, topic)
- `context_graph_edges` -- Bi-temporal edges (tValid/tInvalid, confidence, source provenance)
- `context_graph_communities` -- Community clusters

### Eval & Observability
- `eval_datasets` -- Test datasets for agent evaluation
- `eval_cases` -- Individual test cases (input, expectedOutput, tags)
- `eval_runs` -- Eval run metadata (model, graderModel, summary stats)
- `eval_results` -- Per-case scores with grader reasoning
- `agent_traces` -- Every AI call traced (tokens, cost, latency, tool calls)

### Flywheel & Self-Improvement
- `agent_prompt_versions` -- Versioned prompts per agent with canary percent
- `agent_few_shot_examples` -- Curated production examples for few-shot
- `agent_failure_patterns` -- Detected failure patterns with resolution tracking
- `distillation_samples` -- High-quality (input,output) pairs for fine-tuning
- `prompt_experiments` -- A/B testing for prompt variations
- `prompt_experiment_metrics` -- Per-request metrics for experiments

### Scoring & Signals
- `signal_outcomes` -- Signal-to-deal-outcome attribution (won/lost x signal_type)
- `anonymized_signal_benchmarks` -- Cross-tenant anonymized benchmarks (k-anonymity >= 10)
- `custom_signals` -- User-defined boolean signals (description, plan JSONB, backfill tracking)

### Coaching & Performance
- `coaching_insights` -- Per-interaction coaching (pre_send, post_interaction, deal_risk, process_gap)
- `coaching_insights` scores on: tone, completeness, objection_handling, next_step, process_adherence, timing
- `ae_performance_snapshots` -- Weekly AE performance metrics (emails, meetings, deals, scores)

### Trust & Guardrails
- `trust_events` -- Append-only trustScore audit trail
- `agent_actions` -- Reversible agent actions with grace window
- `sending_infra_requests` -- Manual ops handoff for sending domain setup

### Other
- `saved_views` -- Per-user saved filters/sorts/columns
- `user_preferences` -- Per-user resource-level JSONB preferences
- `import_history` -- CSV import audit trail
- `notetaker_exposures` -- Meeting bot brand exposure tracking
- `tenant_referral_credits` -- Referral credit balances
- `referral_credit_events` -- Referral credit event log
- `inbound_write_keys` -- Pixel tracking write keys
- `inbound_visitors` -- Website visitor tracking
- `custom_skill_templates` -- User-defined agent skills
- `pending_invites` -- Workspace invitations
- `knowledge_entries` -- Workspace knowledge base
- `agent_tasks` -- Background agent task queue

---

## 3. Chat Agent Capabilities (17 tool modules, 70+ tools)

### Query Tools (query.ts)
- `searchCRM` -- Vector-similarity semantic search across all entities
- `queryContacts` -- Text search contacts by name/email
- `queryAccounts` -- Text search accounts by name/domain
- `queryDeals` -- Filter deals by stage/name
- `queryActivities` -- Activity history for any entity
- `queryNotes` -- Search notes by entity or content
- `queryTasks` -- Filter tasks by status/priority
- `whoami` -- Current user identity & workspace context
- `listWorkspaceMembers` -- Team member list
- `searchMeetings` -- Search meetings by attendee/date/keywords
- `searchEmailsByMetadata` -- Search emails by from/to/subject/date
- `runBasicReport` -- Aggregate reports (count/sum/avg, group by)
- `getNoteBody` -- Full note content by ID
- `getCallRecording` -- Meeting transcript, structured notes, attendees
- `getEmailContent` -- Full email content by activity ID
- `semanticSearchNotes` -- Vector search over note content
- `semanticSearchEmails` -- Vector search over email bodies
- `semanticSearchCallRecordings` -- Vector search over transcripts
- `getRecordsByIds` -- Batch-get records by type+IDs
- `listComments` / `listCommentReplies` -- Threaded comments
- `findDuplicateContacts` -- Scan for duplicate contacts by email
- `listRecentToolCalls` -- Audit trail of chat actions
- `listSharedPrompts` / `deleteSharedPrompt` -- Prompt template management

### Create Tools (create.ts)
- `createContact` -- With optional approval mode (propose vs. execute)
- `createAccount` -- With optional approval mode
- `createDeal` -- With optional approval mode
- `createNote` -- Attached to entity, auto-ingests into context graph
- `logActivity` -- Manual activity logging (call, meeting, note)
- `createSequence` -- Create outbound sequence shell
- `addSequenceStep` -- Append step to sequence
- `createTask` -- Create follow-up/reminder
- `createKnowledgeEntry` -- Add to workspace knowledge base (admin only)
- `upsertContact` -- Find-or-create by email (idempotent)
- `upsertAccount` -- Find-or-create by domain (idempotent)
- `upsertDealByCompany` -- Find-or-create deal for company (idempotent)
- `createCustomObjectType` -- Define new object types (admin only)
- `createSavedView` -- Save filter/sort/column view
- `createComment` -- Threaded comments on any entity
- `createSharedPrompt` -- Save reusable prompt template

### Update Tools (update.ts)
- `updateContact` / `updateAccount` / `updateDeal` -- Field-level updates with snapshot for undo
- `updateTaskStatus` -- Complete/cancel tasks
- `updateMeetingNotes` -- Edit meeting structured notes + follow-up draft
- `updateSequenceStep` -- Edit step content/delay
- `setAccountOwner` / `setContactOwner` / `setDealOwner` -- Ownership assignment

### Action Tools (action.ts)
- `draftEmail` -- AI-draft email with interaction context + writing style matching
- `generateFollowUpEmail` -- Follow-up from meeting notes with action items
- `suggestEmailReply` -- 3 reply options (brief/detailed/decline)
- `autoProgressDeal` -- Suggest/apply next pipeline stage
- `sendMeetingFollowUp` -- Send stored follow-up via Resend
- `bookMeeting` -- Create Google Calendar event with Meet link
- `enrollInSequence` -- Enroll contacts in a sequence (batch)
- `runSequenceAutopilot` -- Auto-enroll top-scored contacts
- `launchCampaign` -- Queue approved campaign drafts for send
- `unsubscribeContact` -- Opt-out + pause enrollments
- `proposeCampaign` -- AI-propose outbound campaign (target, steps, copy)
- `inviteMember` / `resendInvite` -- Workspace invitation management
- `addMailbox` -- Connect sendable mailbox (SMTP/IMAP)
- `runAiAttribute` -- Execute AI-computed custom field on a record
- `deleteComment` / `deleteSequenceStep` -- Destructive actions with undo snapshots
- `mergeContacts` -- Merge duplicates with FK re-pointing and undo support

### Intelligence Tools (intelligence.ts)
- `getDealCoaching` -- Comprehensive deal context for coaching advice
- `scoreBuyerIntent` -- Behavioral scoring (response time, questions, after-hours)
- `predictStalls` -- Stall prediction for deals

### Briefing Tools (briefing.ts)
- `briefAllDeals` -- Morning brief across all open deals (risk, promises, objections, next actions)
- `briefDeal` -- Single-deal deep brief
- `getEnrichedProspectContext` -- Full prospect dossier with enrichment data

### Coaching Tools (coaching.ts)
- `getCoachingInsights` -- Pre-send reviews, post-interaction feedback, process adherence
- `getPerformanceSnapshot` -- AE metrics (emails, meetings, win rate, scores)
- `searchActivityBodies` -- Full-text search over activity content
- `detectTrends` -- Performance trend analysis

### Research Tools (research.ts)
- `buildCompanyDossier` -- Comprehensive company research (leadership, funding, tech stack, ICP fit, outreach strategy)

### Forecast Tools (forecast.ts)
- `getRevenueForcast` -- Monte Carlo revenue forecast (p10/p50/p90 confidence intervals)

### Stakeholder Tools (stakeholder.ts)
- `mapDealStakeholders` -- Classify buying committee roles (champion, blocker, etc.) with engagement scores

### Workflow Tools (workflow.ts)
- `createWorkflow` -- Natural language to automation (trigger + action steps)
- `listWorkflows` / `deleteWorkflow` -- Manage automations

### Memory Tools (memory.ts)
- `exploreGraph` -- Navigate context graph around an entity
- `findPaths` / `findSharedConnections` / `findRelatedEntities` -- Graph reasoning
- `rememberFact` / `recallMemory` / `forgetMemory` -- Persistent agent memory
- `listRelationTypes` -- Available graph edge types

### Skills Tools (skills.ts)
- `analyzePipeline` -- Full pipeline review (stage breakdown, stuck deals, win rate, velocity)

### Import Tools (import.ts)
- `smartImportCSV` -- Chat-driven CSV import with column mapping, dedup, relationship wiring

### Code Execution Tools (code-execution.ts)
- `executeCode` -- Write & run JavaScript on CRM data in sandbox (with chart() support)

### Undo Tools (undo.ts)
- `undoLastAction` -- Reverse the last tool call using stored snapshot

---

## 4. Inngest Functions (52 background jobs)

### Enrichment
| Function | Trigger | Description |
|---|---|---|
| `enrich-company` | company/created | Enrich via Apollo -> LLM fallback |
| `enrich-contact` | contact/created | Enrich contact via Apollo |
| `enrich-company-batch` | company/enrich-batch | Fan-out batch enrichment |
| `enrichment-email-extract` | enrichment/email-extract | LLM signal extraction from email |
| `enrichment-email-extract-batch` | enrichment/email-extract-batch | Batch email signal extraction |

### Sequences & Email
| Function | Trigger | Description |
|---|---|---|
| `send-sequence-step` | sequence/step-due | Send personalized sequence email |
| `process-reply` | email/reply-received | Classify reply (interested/objection/ooo/unsub) |
| `cron-trigger-sequence-steps` | cron (every 5 min) | Scan for due enrollments |
| `process-outbound-emails` | cron (every 1 min) | Send queued outbound emails via EmailEngine |
| `send-single-email` | email/send | Send one email through connected mailbox |
| `cron-daily-mailbox-reset` | cron (daily) | Reset daily send counters |
| `prepare-campaign` | campaign/prepare | Generate personalized emails for campaign enrollees |
| `handle-reply-intelligently` | reply/classified | Post-classification reply handling (create task, draft response, escalate) |
| `auto-pipeline-email-handler` | auto-pipeline/draft | Draft auto-pipeline response |
| `signal-to-sequence` | (from inngest dir) | Auto-enroll high-signal companies into sequences |

### Sync
| Function | Trigger | Description |
|---|---|---|
| `sync-emails` | sync/emails | Sync emails from connected accounts |
| `sync-calendar` | sync/calendar | Sync Google Calendar events |
| `google-oauth-connected` | oauth/google-connected | Initial sync after Google OAuth |
| `microsoft-oauth-connected` | oauth/microsoft-connected | Initial sync after Microsoft OAuth |
| `cron-sync-emails` | cron (every 15 min) | Background email sync for all accounts |
| `cron-calendar-sync` | cron (every 15 min) | Background calendar sync (Google + Microsoft) |

### Meetings
| Function | Trigger | Description |
|---|---|---|
| `auto-meeting-prep` | (triggered before meetings) | Auto-generate meeting prep documents |
| `generate-meeting-prep` | meeting/prep-requested | Generate meeting prep with company dossier |
| `schedule-recall-bots` | cron (hourly) | Schedule Recall.ai bots for upcoming meetings |

### Coaching & Analysis
| Function | Trigger | Description |
|---|---|---|
| `coaching-pre-send-analysis` | email/pre-send | Pre-send email coaching (tone, completeness, objection handling) |
| `coaching-post-interaction` | activity/completed | Post-interaction coaching feedback |
| `coaching-deal-event` | deal/stage-changed | Deal-event coaching insights |
| `coaching-weekly-performance` | cron (weekly) | Weekly AE performance snapshot |
| `analyze-closed-deal` | deal/closed | Win/loss analysis on deal closure |

### Scoring & Signals
| Function | Trigger | Description |
|---|---|---|
| `weekly-scoring-model-training` | cron (weekly) | Train predictive scoring model from outcomes |
| `train-scoring-model-on-demand` | scoring/train-model | On-demand model training |
| `evaluate-realtime-signals` | signals/evaluate-realtime | Real-time signal evaluation after events |
| `signal-to-deal-alert` | signals/deal-alert | Create notification when signal fires on deal |
| `cron-daily-signal-scan` | cron (daily) | Scan all companies for new signals |
| `cron-weekly-churn-risk` | cron (weekly) | Detect churn risk patterns |
| `cron-weekly-expansion` | cron (weekly) | Spot expansion opportunities |
| `cron-weekly-funding-monitor` | cron (weekly) | Monitor funding events |
| `cron-monthly-champion-tracker` | cron (monthly) | Track champion job changes |
| `custom-signal-backfill` | custom-signal/backfill | Backfill user-defined signals across TAM |
| `sync-signals-to-deal` | deal/signals-sync | Sync company signals to associated deals |

### AI Self-Improvement (Flywheel)
| Function | Trigger | Description |
|---|---|---|
| `cron-failure-to-eval-cases` | cron | Convert agent failures into eval test cases |
| `cron-flywheel-cycle` | cron | Pattern analysis + prompt refinement |
| `run-agent-flywheel` | flywheel/run | Run flywheel for specific agent |
| `async-online-eval` | eval/online-sample | Sample-based online eval scoring |
| `weekly-prompt-optimizer` | cron (weekly) | Self-improving prompt optimization cycle |
| `cron-anonymized-signal-aggregation` | cron (weekly) | Cross-tenant anonymized signal benchmarks |

### Context Graph & Memory
| Function | Trigger | Description |
|---|---|---|
| `relationship-graph-nightly` | cron (nightly) | Rebuild relationship graph from activities |
| `relationship-graph-ondemand` | graph/rebuild | On-demand graph rebuild |
| `memory-auto-extract` | chat/conversation-ended | Extract memories from chat conversations |
| `extract-thread-intelligence-batch` | intelligence/batch | Extract intelligence from email threads (batch) |
| `extract-single-thread-intelligence` | intelligence/single | Extract intelligence from single thread |

### Other Background Jobs
| Function | Trigger | Description |
|---|---|---|
| `generate-deal-brief` | deal/brief-requested | Generate structured deal brief |
| `scheduled-deal-digest` | cron (daily) | Morning deal digest |
| `daily-founder-brief` | cron (daily) | Founder-specific daily brief |
| `auto-briefing-trigger-24h` | cron (daily) | Pre-meeting + deal brief generation |
| `generate-dossier` | dossier/build | Async company research dossier |
| `ai-autofill-fields` | custom-field/autofill | AI-compute custom field values |
| `research-agent-run` | research/run | AI attribute computation |
| `data-retention-purge` | cron (daily) | GDPR data retention purge |
| `onboarding-completed` | onboarding/completed | Post-onboarding: find contacts + embeddings |
| `daily-stall-prediction` | cron (daily) | Predict stalling deals |
| `on-demand-stall-prediction` | stall/predict | On-demand stall prediction |
| `contact-created-enrich-qualify` | contact/created | Auto-enrich and qualify new contacts |
| `auto-pipeline-step` | auto-pipeline/step | Autonomous pipeline step execution |
| `execute-custom-workflow` | workflow/execute | Execute NL-defined workflow |
| `execute-workflow` | workflow/run | Execute user workflow (trigger-based) |
| `agent-task-execute` | agent-task/run | Background agent task runner |
| `agent-task-cleanup` | cron (daily) | Clean up old agent tasks |
| `service-health-check` | cron (every 5 min) | Service health monitoring |

---

## 5. Signal Detectors

### TAM Build Signals (per-company during TAM build)
| Signal | Source | Description |
|---|---|---|
| `investor_overlap` | Apollo investors | Checks if company shares investors with the tenant's cap table |
| `funding_recent` | Apollo funding data | Detects recent funding rounds (within configurable window) |
| `funding_crunchbase` | Crunchbase adapter | Crunchbase-sourced funding round detection |
| `hiring_intent` | Apollo job postings | Detects active hiring in relevant departments |
| `yc_company` | Apollo/enrichment | Identifies Y Combinator portfolio companies |

### Live Scoring Signals (from company properties)
| Signal | Detection | Description |
|---|---|---|
| `funding` | `latest_funding_stage` property | Any funding stage present |
| `funding_crunchbase` | `tamSignals.funding_crunchbase` | Crunchbase funding signal |
| `hiring` | `jobPostingIntent.signalStrength` | Active job posting intent |
| `tech_stack_change` | `techStackChange.detectedAt` | Technology stack changes detected |
| `leadership_change` | `leadershipChange.detectedAt` | C-level/VP leadership changes |
| `investor_overlap` | `investorOverlap.commonInvestors` | Shared investors with tenant |

### Custom Signals
- User-defined boolean signals stored in `custom_signals` table
- Description-to-detection-plan via LLM (`lib/custom-signals/generator.ts`)
- Backfill across entire TAM via `custom-signal-backfill` Inngest function
- Results stored in `companies.properties.customSignals[signalId]`

### Signal-Outcome Attribution
- `signal_outcomes` table records which signals fired before deal close
- Per-tenant lift multipliers computed from historical win/loss data
- Minimum N >= 10 per signal type before multiplier is applied
- Used by `scoreSignals()` to weight live signal bonuses

### Buyer Intent Scoring (contact-level)
- Response time analysis
- Meeting acceptance rate
- Questions asked (engagement)
- Email length trend
- Forwarded to colleagues (expansion)
- Document requests (pricing, case studies)
- After-hours engagement (urgency)
- Score: 0-100, trend: heating/stable/cooling

---

## 6. Email/Sequence System

### Outbound Infrastructure
- **EmailEngine** integration for SMTP/IMAP mailbox management
- **Resend** as backup email provider (transactional + sequence)
- Connected mailboxes with warmup tracking (warmupStartedAt, warmupDailyTarget, warmupCompletedAt)
- Daily send limits per mailbox with health scoring
- Send window configuration (start/end hours, days of week)
- Mailbox rotation across tenant's connected mailboxes

### Sequence Engine
- Multi-step sequences with configurable delays (business days)
- Multi-channel support: email, linkedin_message, sms, gift, phone_task
- Template variable substitution ({{firstName}}, {{lastName}}, etc.)
- AI personalization via prospect context (company enrichment, interaction history)
- Writing style matching from historical sent emails
- Outbound methodology-driven step strategies

### Campaign System
- Campaign preparation pipeline (generate personalized emails per enrollee)
- Preview all emails before launch
- Launch transitions drafts to queued
- Campaign status tracking with metrics

### Reply Processing
- Reply classification: interested, meeting_request, objection_price/timing/competitor/authority, ooo, unsubscribe
- Objection detail extraction + recommended next action + urgency scoring
- OOO handling: parse return date, reschedule next step
- Auto-unsubscribe: opt-out list + enrollment pause
- Intelligent reply handler: auto-create tasks, draft responses, escalate

### Deliverability
- Email verification endpoint
- Bounce tracking (7-day rolling count)
- Hard bounce -> auto opt-out
- Click tracking pixel
- Unsubscribe link handling

### Webhooks
- EmailEngine: messageNew (inbound reply detection), bounce, delivery
- Resend/Svix: delivered, bounced, opened, clicked events

---

## 7. Enrichment Providers

### Waterfall Architecture
Priority-ordered provider waterfall with saturation-based early exit:
1. **Apollo** (priority 10) -- Broadest firmographics, cheapest. Company + contact enrichment
2. **Crunchbase** (priority 20) -- Funding rounds, investors, categories
3. **Hunter** (priority 30) -- Email patterns, location, org name
4. **LLM Fallback** (priority 100) -- Last resort when APIs miss

### Enriched Fields
Scalar: domain, name, industry, description, employeeCount, sizeRange, annualRevenue, revenueRange, foundedYear, city, state, country, fundingStage, totalFunding, linkedinUrl, logoUrl
Arrays: technologies, keywords, investors (union-deduplicated, capped at 20)

### Provenance Tracking
- Per-field provenance (which provider contributed which field)
- Cost tracking per provider call
- Full raw response preserved for audit

### Additional Enrichment Clients
- `crunchbase-client.ts` -- Direct Crunchbase API client
- `hunter-client.ts` -- Direct Hunter.io API client
- `instantly-client.ts` -- Instantly email warming provider

---

## 8. MCP Server

Elevay exposes an **MCP (Model Context Protocol)** server at `/api/mcp`.

### Protocol
- JSON-RPC 2.0 over HTTP POST
- Bearer token authentication with `mcp_` prefixed API keys
- bcrypt-hashed keys stored in tenant settings
- API key management via `/api/mcp/keys`

### Available Tools (12)
| Tool | Description |
|---|---|
| `search_records` | Search contacts/companies/deals by query |
| `get_contact` | Get contact by ID with company name |
| `get_company` | Get company by ID with contact count |
| `get_deal` | Get deal by ID with company/contact names |
| `list_contacts` | Paginated contact list with search |
| `list_companies` | Paginated company list with search |
| `list_deals` | Paginated deal list with stage filter |
| `create_contact` | Create new contact |
| `create_deal` | Create new deal |
| `log_note` | Add note to any entity |
| `list_activities` | Recent activities for entity |
| `search_crm` | Semantic vector search (OpenAI embeddings) |

### Server Info
- Name: `elevay-crm`
- Version: 1.0.0
- Protocol version: 2024-11-05
- Capabilities: tools

---

## 9. Settings & Admin Pages

### User-Facing Settings (apps/web)
| Page | Path | Description |
|---|---|---|
| Settings Hub | `/settings` | Settings navigation |
| Workspace | `/settings/workspace` | Workspace name, defaults |
| ICP | `/settings/icp` | Ideal Customer Profile definition |
| Mailboxes | `/settings/mailboxes` | Connected mailbox management |
| Mail & Calendar | `/settings/mail-calendar` | Email/calendar sync settings |
| Data Model | `/settings/data-model` | Custom fields (text, number, date, select, boolean, ai_computed) |
| Stages | `/settings/stages` | Pipeline stage customization |
| Custom Signals | `/settings/signals` | User-defined signal management |
| Knowledge Base | `/settings/knowledge` | Workspace knowledge entries |
| Workflows | `/settings/workflows` | Automation rules (NL-defined) |
| Agent | `/settings/agent` | Agent behavior settings (approval mode, autonomy level) |
| Agent Memory | `/settings/agent-memory` | View/manage agent learned preferences |
| Guardrails | `/settings/guardrails` | Agent action guardrails & trust score |
| Sending Infrastructure | `/settings/sending-infrastructure` | Managed sending domain setup |
| Plays | `/settings/plays` | Custom skill templates (plays/playbooks) |
| Objects | `/settings/objects` | Custom object type definitions |
| Recording | `/settings/recording` | Meeting recording settings (Recall.ai bot) |
| Notifications | `/settings/notifications` | Per-type notification preferences |
| Members | `/settings/members` | Team members + invitation management |
| Privacy | `/settings/privacy` | Data sync scope, retention settings |
| Security | `/settings/security` | Password, sessions, audit log |
| Billing | `/settings/billing` | Subscription, usage, plan limits |
| LLM Budget | `/settings/llm-budget` | AI usage budget & cost tracking |
| MCP | `/settings/mcp` | MCP API key management |
| Evals | `/settings/evals` | Agent eval datasets & run history |

### Admin Dashboard (apps/admin -- separate app)
| Page | Path | Description |
|---|---|---|
| Overview | `/` | Admin overview metrics |
| Agents | `/agents/[agentId]` | Per-agent performance (traces, latency, costs, errors) |
| Business | `/business` | Business metrics dashboard |
| Channel | `/channel` | Notetaker/referral channel metrics |
| Costs | `/costs` | LLM cost breakdown by agent/tenant |
| Evals | `/evals` | Cross-tenant eval results |
| Flywheel | `/flywheel` | Prompt versioning, A/B experiments, failure patterns |
| Graph | `/graph` | Context graph admin view |
| Intelligence | `/intelligence` | Thread intelligence metrics |
| Scoring | `/scoring` | Scoring model performance |
| SLA | `/sla` | Service level monitoring |

---

## 10. Onboarding Flow

### Steps (7 steps)
| Step | Key | Description |
|---|---|---|
| 1 | `welcome` | User profile: name, company name, company website |
| 2 | `connect` | Connect Google or Microsoft OAuth (email + calendar) |
| 3 | `privacy` | Configure sync scope: which emails/calendar events to sync, retention |
| 4 | `product` | Product description: AI analyzes website to infer company description, product description, tone. User reviews and corrects confidence gaps |
| 5 | `icp` | Define ICP: target industries, company sizes, geographies, job seniorities, job departments, sales motions. Pre-populated from website analysis |
| 6 | `building` | TAM build: streams companies from Apollo, enriches, scores, detects signals. Real-time SSE progress showing companies found, scored, and signal chips |
| 7 | `ready` | Dashboard ready: shows TAM summary, top accounts, signal counts. Links to dashboard |

### Technical Details
- Website analysis via `/api/onboarding/enrich-icp` (LLM-powered)
- Email intelligence analysis via `/api/onboarding/email-intelligence`
- TAM build via `/api/tam/build` with Server-Sent Events streaming
- Resumable: persists current step, shows "Welcome back" on return
- PostHog analytics: tracks latency per API call, step completion
- Companies from Apollo org search, enriched via waterfall providers
- Signals computed per-company during build (investor_overlap, funding, hiring, yc)
- ICP scoring (0-100) based on industry/size/geography/technology fit
- Custom signal columns appear alongside built-in signals

---

## 11. Dashboard Pages

### Main Navigation
| Page | Path | Description |
|---|---|---|
| Home | `/home` | Dashboard with pipeline, activity feed, alerts, briefs, performance |
| Chat | `/chat` | AI chat interface (full-page) |
| Accounts | `/accounts` | Company list with scoring, signals, filters, saved views |
| Account Detail | `/accounts/[id]` | Single account with contacts, activities, notes, enrichment |
| Contacts | `/contacts` | Contact list with search, scoring, filters |
| Contact Detail | `/contacts/[id]` | Single contact with activities, deals, notes |
| Contact Merge | `/contacts/merge` | Duplicate contact merger |
| Opportunities | `/opportunities` | Deal pipeline board/list |
| Opportunity Detail | `/opportunities/[id]` | Single deal with timeline, health, stakeholders |
| Sequences | `/sequences` | Sequence list management |
| Sequence Detail | `/sequences/[id]` | Sequence editor (steps, enrollments) |
| Sequence Review | `/sequences/[id]/review` | Review sequence emails before send |
| Inbox | `/inbox` | Unified inbox (replies, tasks, alerts) |
| Tasks | `/tasks` | Task management |
| Notes | `/notes` | Notes browser |
| Meetings | `/meetings` | Meeting list |
| Meeting Detail | `/meetings/[id]` | Meeting with transcript, notes, follow-up |
| Reports | `/reports` | Analytics & reporting |
| Insights | `/insights` | AI coaching insights |
| Deliverability | `/deliverability` | Email deliverability monitoring |
| Graph | `/graph` | Context graph visualization |
| Voice of Customer | `/voice-of-customer` | VoC aggregation from interactions |
| Custom Objects | `/objects/[type]` | Custom object type browser |
| Pricing | `/pricing` | Plan comparison & upgrade |

---

## 12. Scoring System

### Company Scoring (ICP Fit)
- Industry match against tenant ICP
- Company size match (employee count ranges)
- Revenue range match
- Geography match
- Technology stack overlap
- Score: 0-100

### Signal Bonus (layered on top)
- 5 base points per fired signal
- Multiplied by tenant-specific learned lift multipliers
- Capped at 20 bonus points max
- Multipliers from `signal_outcomes` (requires N >= 10 observations)

### Predictive Scoring
- `predictive-scorer.ts` -- ML-style scoring model
- `company-model-trainer.ts` -- Weekly model training from deal outcomes
- `company-scorer.ts` -- Company-level scoring combining ICP + signals + model

### Contact Scoring (Buyer Intent)
- Behavioral signals: response time, meeting acceptance, questions, engagement
- Score: 0-100, with heating/stable/cooling trend

---

## 13. Additional Notable Systems

### Code Execution Sandbox
- Agent writes and runs JavaScript on CRM data
- Pre-loaded globals: contacts[], accounts[], deals[], activities[], notes[]
- Helper functions: groupBy(), sum(), avg(), median(), chart()
- Results stored in `code_executions` table

### Workflow Automation
- Natural language to structured workflow (LLM-parsed)
- Triggers: deal stage change, contact created, email received, etc.
- Actions: create task, send email, update field, notify, etc.
- Stored in tenant settings, executed via Inngest

### Stall Prediction
- Daily cron predicts which deals will stall
- On-demand prediction via chat tool
- Creates alerts/notifications for at-risk deals

### Meeting Intelligence
- Calendar sync (Google + Microsoft)
- Recall.ai bot scheduling for recordings
- Transcript upload and processing
- AI-generated structured notes (summary, action items, objections)
- Follow-up email generation from notes
- Attendee-to-contact matching

### Trust Score & Guardrails
- Trust score tracks agent reliability (0-100)
- Every autonomous action logged with grace window
- Reversible actions can be undone within window
- Trust events audit trail (approved, rejected, undone)

### Distillation Pipeline
- High-quality production outputs captured for fine-tuning
- PII stripping before storage
- Quality sources: user approval, eval score >= 0.85, explicit feedback

### Prompt A/B Testing
- Experiments define base vs. variant prompt
- Traffic split by tenant hash
- Metrics: eval_score, approved, rejected per variant
- Auto-conclude with winner determination
