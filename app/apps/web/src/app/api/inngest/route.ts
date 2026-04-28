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
import { autoPipelineStep } from "@/inngest/autonomous-pipeline";
import { handleAutoPipelineDraft } from "@/inngest/auto-pipeline-email-handler";
import { dailyFounderBrief } from "@/inngest/founder-coach";
import { serviceHealthCheck } from "@/inngest/health-checks";
import { signalAutoEnroll } from "@/inngest/signal-to-sequence";
import { nightlyRelationshipGraphBuild, onDemandRelationshipGraphBuild } from "@/inngest/relationship-graph-builder";
import { customSignalBackfill } from "@/inngest/custom-signal-backfill";
import { dataRetentionPurge } from "@/inngest/data-retention";
import { weeklyAnonymizedSignalAggregation } from "@/inngest/anonymized-signal-aggregation";

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
    autoPipelineStep,
    handleAutoPipelineDraft,
    dailyFounderBrief,
    // Signal → auto-enroll contacts into outbound sequences
    signalAutoEnroll,
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
    // Cross-tenant anonymized benchmarks (#96)
    weeklyAnonymizedSignalAggregation,
  ],
});
