import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichCompany, enrichContact, sendSequenceStep, processReply } from "@/inngest/functions";
import { syncEmails, syncCalendar, onGoogleOAuthConnected, onMicrosoftOAuthConnected, cronSyncEmails } from "@/inngest/sync-functions";
import { aiAutoFill } from "@/inngest/ai-autofill";
import { executeWorkflow } from "@/inngest/workflow-engine";
import { cronCalendarSync, autoMeetingPrep, generateMeetingPrep } from "@/inngest/meeting-functions";
import { onOnboardingCompleted } from "@/inngest/onboarding-functions";
import { processOutboundEmails, sendSingleEmail } from "@/inngest/email-send-worker";
import { cronFailureToEvalCases, cronFlywheelCycle, runAgentFlywheel, asyncOnlineEval } from "@/inngest/eval-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    enrichCompany,
    enrichContact,
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
    onOnboardingCompleted,
    processOutboundEmails,
    sendSingleEmail,
    // Flywheel: self-improving eval system
    cronFailureToEvalCases,
    cronFlywheelCycle,
    runAgentFlywheel,
    asyncOnlineEval,
  ],
});
