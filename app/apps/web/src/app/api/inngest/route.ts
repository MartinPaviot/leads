import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichCompany, enrichContact, sendSequenceStep, processReply } from "@/inngest/functions";
import { syncEmails, syncCalendar, onGoogleOAuthConnected, cronSyncEmails } from "@/inngest/sync-functions";
import { aiAutoFill } from "@/inngest/ai-autofill";
import { executeWorkflow } from "@/inngest/workflow-engine";
import { cronCalendarSync, autoMeetingPrep, generateMeetingPrep } from "@/inngest/meeting-functions";

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
    cronSyncEmails,
    aiAutoFill,
    executeWorkflow,
    cronCalendarSync,
    autoMeetingPrep,
    generateMeetingPrep,
  ],
});
