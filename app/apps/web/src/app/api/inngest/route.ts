import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichCompany, enrichContact, enrichBatch, sendSequenceStep, processReply } from "@/inngest/functions";
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

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    enrichCompany,
    enrichContact,
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
  ],
});
