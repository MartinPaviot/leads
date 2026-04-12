import { z } from "zod";

export const meetingBriefInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID for the meeting attendee"),
  meetingContext: z.string().optional().describe("Additional context: agenda, meeting type, etc."),
});

export type MeetingBriefInput = z.infer<typeof meetingBriefInputSchema>;

export const meetingBriefOutputSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  companyName: z.string().nullable(),
  brief: z.object({
    personSummary: z.string(),
    companySummary: z.string(),
    recentActivity: z.string(),
    keySignals: z.array(z.string()),
    talkingPoints: z.array(z.string()),
    potentialObjections: z.array(z.string()),
    questionsToAsk: z.array(z.string()),
  }),
});

export type MeetingBriefOutput = z.infer<typeof meetingBriefOutputSchema>;
