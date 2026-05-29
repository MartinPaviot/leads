import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichCompany, enrichBatch, sendSequenceStep, processReply } from "@/inngest/functions";
import { syncEmails, syncCalendar, onGoogleOAuthConnected, onMicrosoftOAuthConnected, cronSyncEmails } from "@/inngest/sync-functions";
import { aiAutoFill } from "@/inngest/ai-autofill";
import { executeWorkflow } from "@/inngest/workflow-engine";
import { cronCalendarSync, autoMeetingPrep, generateMeetingPrep } from "@/inngest/meeting-functions";
import { scheduleRecallBots } from "@/inngest/recall-functions";
import { onOnboardingCompleted } from "@/inngest/onboarding-functions";
import { processOutboundEmails, sendSingleEmail, cronDailyMailboxReset } from "@/inngest/email-send-worker";
import { cronTriggerSequenceSteps } from "@/inngest/sequence-cron";
import { cronFailureToEvalCases, cronFlywheelCycle, runAgentFlywheel, asyncOnlineEval } from "@/inngest/eval-functions";
import { prepareCampaign } from "@/inngest/campaign-functions";
import { handleReplyIntelligently } from "@/inngest/reply-handler";
import { weeklySignalScan, weeklyChurnRiskScan, weeklyExpansionScan, weeklyFundingMonitor, monthlyChampionTracker } from "@/inngest/skill-crons";
import { onContactCreatedEnrichAndQualify } from "@/inngest/skill-events";
import { researchAgent } from "@/inngest/research-agent";
import { memoryAutoExtract } from "@/inngest/memory-auto-extract";
import { enrichmentEmailExtractFunction, enrichmentEmailExtractBatchFunction } from "@/inngest/enrichment-email-extract-functions";
import { generateDealBrief, scheduledDealDigest } from "@/inngest/deal-briefing";
import { autoBriefingTrigger } from "@/inngest/auto-briefing-trigger";
import { analyzeOutgoingEmail, postInteractionCoaching, analyzeDealEvent, weeklyPerformanceSnapshot } from "@/inngest/coaching-engine";
import { signalToDealAlert } from "@/inngest/signal-to-deal-alert";
import { syncSignalsToDeal } from "@/inngest/deal-signal-sync";
import { dealPropertyLlmSynthesize } from "@/inngest/deal-property-llm-synthesize";
import { routeSequenceStepToDraft } from "@/inngest/sequence-draft-router";
import { cronExpireSequenceDrafts } from "@/inngest/sequence-draft-expiry";
import { draftRejectionLearner } from "@/inngest/sequence-draft-rejection-learner";
import { autoPipelineStep } from "@/inngest/autonomous-pipeline";
import { handleAutoPipelineDraft } from "@/inngest/auto-pipeline-email-handler";
import { dailyFounderBrief } from "@/inngest/founder-coach";
import { serviceHealthCheck } from "@/inngest/health-checks";
import { signalAutoEnroll } from "@/inngest/signal-to-sequence";
import { signalAccelerateCadence } from "@/inngest/signal-accelerate-cadence";
import { nurtureRecycleD30 } from "@/inngest/nurture-recycle-d30";
import { meetingCapacityCheck } from "@/inngest/meeting-capacity-check";
import { playbookCapturePostCall } from "@/inngest/playbook-capture-post-call";
import { playbookExtractFromActivity } from "@/inngest/playbook-extract-from-activity";
import { sequenceDraftToOutbound } from "@/inngest/sequence-draft-to-outbound";
import { signalScoreDaily } from "@/inngest/signal-score-daily";
import { visitorPhoneEnrichRequest } from "@/inngest/visitor-phone-enrich-request";
import { phoneTaskNotification } from "@/inngest/phone-task-notification";
import { nightlyRelationshipGraphBuild, onDemandRelationshipGraphBuild } from "@/inngest/relationship-graph-builder";
import { customSignalBackfill } from "@/inngest/custom-signal-backfill";
import { dataRetentionPurge } from "@/inngest/data-retention";
import { evictSignalUrlCache } from "@/inngest/signal-url-cache-evict";
import { identifyVisit } from "@/inngest/identify-visit";
import { weeklyEvalHarness } from "@/inngest/eval-harness-cron";
import { dailyTranscriptFreshnessAlert } from "@/inngest/transcript-freshness-alert";
import { dailyCsHealthSnapshots } from "@/inngest/cs-health-cron";
import { weeklyAnonymizedSignalAggregation } from "@/inngest/anonymized-signal-aggregation";
import { extractThreadIntelligenceBatch, extractSingleThreadIntelligence } from "@/inngest/thread-intelligence";
import { weeklyModelTraining, trainScoringModelOnDemand } from "@/inngest/scoring-model-trainer";
import { weeklyPromptOptimizer } from "@/inngest/prompt-optimizer-cron";
import { generateDossier } from "@/inngest/dossier-builder";
import { executeCustomWorkflow } from "@/inngest/custom-workflow-executor";
import { analyzeClosedDeal } from "@/inngest/win-loss-analysis";
import { dailyStallPrediction, onDemandStallPrediction } from "@/inngest/stall-prediction-cron";
import { evaluateRealtimeSignals } from "@/inngest/realtime-signal-handler";
import { agentTaskExecute, agentTaskCleanup } from "@/inngest/agent-task-runner";
import { agentReactor, agentDailySweep } from "@/inngest/agent-reactor";
import { outcomeDetectorCron } from "@/inngest/outcome-detector";
import { weeklyTrustRecalculation } from "@/inngest/trust-recalculator";
// Campaign Engine 1000x
import { replyAgent } from "@/inngest/reply-agent";
import { campaignDecisionEngine, bridgeTrackingEvents } from "@/inngest/campaign-decision-engine";
import { signalMonitorCron, signalTriggeredOutreach } from "@/inngest/signal-monitor";
import { deliverabilityHealthCron } from "@/inngest/deliverability-monitor";
import { campaignWeeklyReport } from "@/inngest/campaign-weekly-report";
// voice-cold-call Phase 1 — post-call LLM extraction + CRM sync
import { postProcessCall } from "@/inngest/calls-post-process";

// Register task executors so Inngest runner can dispatch by type
import("@/lib/import/agentic-executor").then((m) => m.registerImportExecutor()).catch(() => {});

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    enrichCompany,
    enrichBatch,
    sendSequenceStep,
    processReply,
    syncEmails,
    syncCalendar,
    onGoogleOAuthConnected,
    onMicrosoftOAuthConnected,
    cronSyncEmails,
    aiAutoFill,
    executeWorkflow,
    cronCalendarSync,
    autoMeetingPrep,
    generateMeetingPrep,
    scheduleRecallBots,
    onOnboardingCompleted,
    processOutboundEmails,
    sendSingleEmail,
    cronDailyMailboxReset,
    cronTriggerSequenceSteps,
    // P0-1 sequence-draft queue : routes events to draft / direct
    routeSequenceStepToDraft,
    cronExpireSequenceDrafts,
    draftRejectionLearner,
    // Campaign pipeline
    prepareCampaign,
    handleReplyIntelligently,
    // Flywheel: self-improving eval system
    cronFailureToEvalCases,
    cronFlywheelCycle,
    runAgentFlywheel,
    asyncOnlineEval,
    // Skills: scheduled scans
    weeklySignalScan,
    weeklyChurnRiskScan,
    weeklyExpansionScan,
    weeklyFundingMonitor,
    monthlyChampionTracker,
    // Skills: event-driven
    onContactCreatedEnrichAndQualify,
    // CHAT-06: Research agent (AI attribute long-running compute)
    researchAgent,
    // CHAT-07: Memory auto-extraction from conversations
    memoryAutoExtract,
    // Enrichment: deep LLM signal extraction from emails
    // (SOURCES_ANALYSIS.md §6.3 Module 1)
    enrichmentEmailExtractFunction,
    enrichmentEmailExtractBatchFunction,
    // Deal briefing: on-demand + scheduled daily digest
    generateDealBrief,
    scheduledDealDigest,
    // FINDING-008: 24h auto-briefing — meeting prep + deal brief before meetings
    autoBriefingTrigger,
    // Coaching engine: pre-send review, post-interaction, deal events, weekly snapshot
    analyzeOutgoingEmail,
    postInteractionCoaching,
    analyzeDealEvent,
    weeklyPerformanceSnapshot,
    // Differentiation: proactive deal intelligence, autonomous pipeline, founder coaching
    signalToDealAlert,
    syncSignalsToDeal,
    dealPropertyLlmSynthesize,
    autoPipelineStep,
    handleAutoPipelineDraft,
    dailyFounderBrief,
    // Signal → auto-enroll contacts into outbound sequences
    signalAutoEnroll,
    // Kairos accelerator (B3) — fresh high-weight signal bumps
    // active enrollments' next_step_at to NOW. Producer now wired
    // into signal-monitor.ts (B3b).
    signalAccelerateCadence,
    // Priority score recompute (B3b) — daily 06:00 UTC. For each
    // tenant, walks eligible companies and persists priority_score
    // (multiplier × fit × accessibility) used by the call queue.
    signalScoreDaily,
    // Nurture recycle (B6) — daily 07:00 UTC. Completed enrollments
    // with lastStepAt > 30d ago re-enroll into the tenant's Nurture
    // sequence. Skips contacts already in nurture (no recycle loop).
    nurtureRecycleD30,
    // Deep-dive capacity check (B7) — weekly Monday 00:30 UTC. Counts
    // this week's deep-dive meetings per tenant and persists the
    // load + level (ok/tight/saturated) on tenants.settings.deepDiveLoad.
    meetingCapacityCheck,
    // Playbook capture (B4) — validates a batch of candidate entries
    // (from an LLM extractor over a call/meeting/reply) and inserts
    // the survivors into playbook_entries.
    playbookCapturePostCall,
    // Playbook LLM extractor (B4-extractor) — fans from
    // coaching/post-interaction. Loads the activity content, calls
    // Claude to extract objection/accroche/question candidates,
    // emits playbook/capture-from-activity to the sink above.
    playbookExtractFromActivity,
    // Bridge: approved sequence_drafts → outbound_emails. Closes the
    // loop on single + bulk approve — without this, drafts sat in
    // `approved` forever and never sent. Fires on email.send.queued.
    sequenceDraftToOutbound,
    // Stub producer: 5-min cron that scans identified visits and
    // emits phone/enrich-requested for callable-but-phoneless contacts.
    // Consumer (Apollo→Kaspr→Lusha waterfall) lives on
    // feat/voice-cold-call — drop-in when that merges.
    visitorPhoneEnrichRequest,
    // Consumer of phone/task-queued — inserts a notification per
    // tenant user so the agent sees the phone task and dials via
    // the existing softphone. Voice Phase 1 is pull-based so this
    // is the smallest bridge between push event and pull queue.
    phoneTaskNotification,
    // Health checks: service status monitoring every 6h
    serviceHealthCheck,
    // Relationship graph: KNOWS edges for warm-intro discovery
    nightlyRelationshipGraphBuild,
    onDemandRelationshipGraphBuild,
    // Custom TAM signals — user-defined boolean chips, backfilled
    // over the full TAM via the three-tier detector.
    customSignalBackfill,
    // GDPR data-retention: purge canceled tenant data after 30 days
    dataRetentionPurge,
    // MONACO-PARITY-01: evict expired URL-verification cache rows
    // (7-day TTL). Runs at 03:30 UTC daily.
    evictSignalUrlCache,
    // MONACO-PARITY-04: visitor-ID identification on `visit/created`.
    identifyVisit,
    // Sprint-1 audit follow-up: weekly LLM eval harness — Mondays 02:00 UTC.
    weeklyEvalHarness,
    // P0-4 follow-up : daily check for tenants whose Recall.ai bot
    // silently stopped indexing — drops a notification at severity
    // 1 (degraded) or 2 (silent) so the founder reconnects fast.
    dailyTranscriptFreshnessAlert,
    // Sprint-2 audit follow-up: daily CS account health snapshots — 04:00 UTC.
    dailyCsHealthSnapshots,
    // Cross-tenant anonymized benchmarks (#96)
    weeklyAnonymizedSignalAggregation,
    // Email thread intelligence — thread-level buying signal extraction
    extractThreadIntelligenceBatch,
    extractSingleThreadIntelligence,
    // Predictive deal scoring — weekly Naive Bayes model training
    weeklyModelTraining,
    trainScoringModelOnDemand,
    // Prompt optimizer — weekly self-improvement via evaluator-optimizer pattern
    weeklyPromptOptimizer,
    // Research dossier — autonomous company intelligence builder
    generateDossier,
    // Custom NL workflows — user-defined automations created via chat
    executeCustomWorkflow,
    // Win/Loss analysis — automatic post-mortem on deal close
    analyzeClosedDeal,
    // Stall prediction — daily cron + on-demand for dashboard
    dailyStallPrediction,
    onDemandStallPrediction,
    // Real-time signal detection (competitive gap #3: event-driven, not batch)
    evaluateRealtimeSignals,
    // Agent tasks: long-running background operations with progress tracking
    agentTaskExecute,
    agentTaskCleanup,
    // F001: Agent event loop — real-time autonomous decision reactor
    agentReactor,
    agentDailySweep,
    // F003: Outcome tracking — feedback loop for agent actions
    outcomeDetectorCron,
    // F005: Learned trust — weekly threshold recalculation from outcomes
    weeklyTrustRecalculation,
    // Campaign Engine 1000x
    replyAgent,
    campaignDecisionEngine,
    bridgeTrackingEvents,
    signalMonitorCron,
    signalTriggeredOutreach,
    deliverabilityHealthCron,
    campaignWeeklyReport,
    // voice-cold-call Phase 1 — post-call LLM extraction + CRM sync
    postProcessCall,
  ],
});
