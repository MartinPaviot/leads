import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { enrichCompany, enrichContact, sendSequenceStep, processReply } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichCompany, enrichContact, sendSequenceStep, processReply],
});
