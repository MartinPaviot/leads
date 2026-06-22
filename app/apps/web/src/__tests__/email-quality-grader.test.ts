import { describe, it, expect } from "vitest";
import { gradeEmail } from "@/lib/evals/email-quality-grader";

describe("email-quality-grader: data-backed scoring", () => {
  it("email-001 BASHO: scores high for compliant email", () => {
    const result = gradeEmail({
      email: `Marc,

Cloud infra companies that 3x engineering post-Series B usually hit a pipeline wall around month 4. The founder-led sales motion that closed your first 20 deals stops working at the volume your $18M round demands.

With CloudNova scaling from 50 engineers, how are you thinking about outbound capacity keeping pace with the hiring plan? Worth a quick exchange if it's on your radar.`,
      subjectLine: "post-Series B scaling wall",
      framework: "basho",
      prospectContext: { name: "Marc Laurent", company: "CloudNova", signal: "Series B $18M" },
    });

    console.log("email-001 BASHO:", JSON.stringify({ score: result.score.toFixed(2), issues: result.issues, strengths: result.strengths }, null, 2));
    expect(result.score).toBeGreaterThan(0.8);
  });

  // CTA-strength fix: a concrete low-friction ask must out-score a diagnostic-only
  // question (the soft-CTA tendency the blind eval + leaders research both flagged).
  const ctaOf = (r: { dimensions: Array<{ name: string; score: number }> }) =>
    r.dimensions.find((d) => d.name === "cta_clarity")!.score;
  const ctxM = { name: "Marc", company: "CloudNova" };
  const hook =
    "Marc,\n\nCloud infra teams scaling post-Series B hit a pipeline wall around month 4 as founder-led sales stops covering the volume.\n\n";

  it("cta_clarity: a concrete low-friction ask beats a diagnostic-only question", () => {
    const diagnostic = gradeEmail({ email: hook + "How are you thinking about outbound capacity as you scale?", framework: "basho", prospectContext: ctxM });
    const withAsk = gradeEmail({ email: hook + "How are you thinking about outbound capacity as you scale? Worth a quick 15-min exchange if it's on your radar.", framework: "basho", prospectContext: ctxM });
    expect(ctaOf(diagnostic)).toBeCloseTo(0.75, 5);
    expect(ctaOf(withAsk)).toBe(1.0);
    expect(ctaOf(withAsk)).toBeGreaterThan(ctaOf(diagnostic));
  });

  it("cta_clarity: stacked asks are penalised", () => {
    const stacked = gradeEmail({ email: hook + "Want a demo? Got 15 min Tuesday? Or should I send a deck?", framework: "basho", prospectContext: ctxM });
    expect(ctaOf(stacked)).toBeCloseTo(0.65, 5);
  });

  it("email-001 BAD: detects violations in old mock", () => {
    const result = gradeEmail({
      email: `Marc,

Congrats on CloudNova's $18M Series B. Scaling from 50 to 150 engineers means your sales process needs to keep pace — most cloud infra companies we work with hit a wall when founder-led sales can't cover the new pipeline volume.

We built an AI-powered sales engine specifically for technical founders who need to 10x outbound without hiring an SDR team.

Worth a 15-min look? I can show you how one cloud infra company went from 3 to 30 meetings/month in their first week.

Martin`,
      subjectLine: "Scale-up pain after Series B?",
      framework: "basho",
      prospectContext: { name: "Marc Laurent", company: "CloudNova", signal: "Series B $18M" },
    });

    console.log("email-001 BAD:", JSON.stringify({ score: result.score.toFixed(2), issues: result.issues, strengths: result.strengths }, null, 2));
    expect(result.score).toBeLessThan(0.9);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("email-003 pricing objection: scores well without markdown", () => {
    const result = gradeEmail({
      email: `David,

Appreciate the transparency on budget.

At $36K/year for 15 users, that is $200/user/month. HubSpot at $150/mo gives you CRM and basic sequences but no AI drafting, no autonomous outbound, no deal coaching. Your team would spend 5-8 hours/week on manual tasks that disappear with automation.

One customer at your scale (12-person sales team) measured 22 hours/week saved, roughly $4,400/month in recovered selling time.

Rather than cutting the price, what if we structured a 60-day pilot at the full rate? If the time savings do not materialize, we adjust. Your team sees the real ROI before committing.

Worth discussing?`,
      framework: "problem_solution",
      prospectContext: { name: "David Kim", company: "Apex Solutions", signal: "pricing" },
    });

    console.log("email-003:", JSON.stringify({ score: result.score.toFixed(2), issues: result.issues, strengths: result.strengths }, null, 2));
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("email-005 product-led: scores for minimal context", () => {
    const result = gradeEmail({
      email: `Alex,

Founder-to-founder: most CEOs I talk to spend 30% of their week on CRM busywork instead of selling. The pipeline runs them instead of the other way around.

Want to see what it looks like when that flips? Takes 3 minutes to connect your email and get your first pipeline analysis -- no setup, no call needed.

Martin`,
      subjectLine: "quick question",
      framework: "product_led",
      prospectContext: { name: "Alex Johnson", company: "Unnamed Startup" },
    });

    console.log("email-005:", JSON.stringify({ score: result.score.toFixed(2), issues: result.issues, strengths: result.strengths }, null, 2));
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("terrible email: scores low", () => {
    const result = gradeEmail({
      email: `Hi there!

I hope this finds you well! I noticed that your company is doing great things and I'd love to introduce you to our amazing platform that helps businesses like yours achieve incredible results!!!

We offer a comprehensive suite of tools including CRM, email automation, analytics, reporting, and much more. Our clients have seen up to 500% improvement in their metrics.

Would you be open to a 45-minute demo call next week? I have availability Monday through Friday. Looking forward to connecting!

Best regards,
The Sales Team`,
      subjectLine: "AMAZING OPPORTUNITY - Don't Miss Out!!!",
      framework: "basho",
      prospectContext: { name: "Sarah", company: "TechCorp", signal: "hiring" },
    });

    console.log("terrible email:", JSON.stringify({ score: result.score.toFixed(2), issues: result.issues, strengths: result.strengths }, null, 2));
    expect(result.score).toBeLessThan(0.55);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
