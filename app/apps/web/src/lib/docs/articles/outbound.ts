import type { DocArticle } from "../types";

/**
 * Category: Outbound. Channel strategy by stage plus one playbook per
 * channel (email, calling, social). Distilled from the outbound research
 * corpus: multi-million-send and multi-million-dial benchmark datasets,
 * founder-led practitioner playbooks, and the diagnostic waterfall.
 */
export const outboundArticles: DocArticle[] = [
  {
    slug: "outbound-channel-strategy",
    category: "Outbound",
    title: "Outbound channel strategy by stage",
    description:
      "Which channels to run at pre-seed, seed and Series A, the cadences that combine them, the volume traps, and the diagnostic waterfall for reading your numbers.",
    blocks: [
      {
        type: "p",
        text:
          "Channel strategy at the early stage is two decisions: which channel you lead with, and when you add the second. Lead with the channel where **you are credible and your buyer actually answers**. Then add a second channel sooner than feels comfortable: properly sequenced, two channels do not add, they compound. Bi-channel cadences out-reply single-channel ones by far more than the sum of the parts.",
      },
      { type: "h2", text: "What each channel returns" },
      {
        type: "table",
        headers: ["Channel", "Median performance", "Notes"],
        rows: [
          ["Cold email", "~3.4% reply (top decile 10%+; signal-led and truly relevant runs reach 15 to 25%)", "Cheap and scalable, capped by deliverability. The middle is disappearing: generic runs sit at 1 to 3%."],
          ["Cold calling", "~6% connect rate; 1 to 3 meetings per 50 to 60 dials", "Highest-bandwidth feedback in B2B. Emotionally hard, which is why it is uncrowded."],
          ["Social (professional network)", "~10% DM reply on warm profiles", "Best as the credibility and warm-up layer woven between email and call touches."],
        ],
      },
      {
        type: "p",
        text:
          "Geography moves these numbers: European inboxes are far less saturated than US ones (reply rates often run 2 to 3 times higher) but sales cycles run 30 to 50 percent longer, and calling culture varies by country. Write in the prospect's language, always.",
      },
      { type: "h2", text: "Routing by stage" },
      {
        type: "table",
        headers: ["Stage", "Mode", "Volume", "Cadence"],
        rows: [
          ["Pre-PMF (under 10 customers)", "Learning mode: validate the wedge, do not scale anything", "10 to 15 conversations per week", "No automation. 50 discovery conversations beat any sequence."],
          ["Founder-led, deal size under $50K", "Signal-based, hyper-relevant, founder as sender", "10 to 15 new prospects per week", "5 to 8 touches over 14 to 21 days, email + call + social"],
          ["Founder-led, deal size $50K to $100K", "Deeper research, multi-threaded accounts", "5 to 8 new prospects per week", "8 to 12 touches over 30 to 45 days, add video"],
          ["Scaling team, deal size over $100K", "Named accounts, coordinated plays", "3 to 5 accounts per week", "12 to 18 touches over 45 to 90 days"],
        ],
      },
      { type: "h3", text: "A reference founder cadence (14 to 21 days)" },
      {
        type: "ol",
        items: [
          "Day 1: email 1, built on the trigger. Same day: view their profile, engage their content.",
          "Day 3: call + voicemail + email 2 referencing the call. The same-day triple touch is the strongest pattern in the data.",
          "Day 5: connection request, under 150 characters, no pitch.",
          "Day 10: value email: a case study or insight, no meeting ask.",
          "Day 14: a binary question, or a 45-second video.",
          "Day 21: break-up email. Closing the file honestly earns outsized reply rates on this final touch.",
        ],
      },
      { type: "h2", text: "The volume trap" },
      {
        type: "p",
        text:
          "Doubling outreach does not double pipeline. Three saturation mechanisms guarantee it:",
      },
      {
        type: "ul",
        items: [
          "**Deliverability tax.** Past roughly 30 to 50 cold sends per inbox per day, spam reputation degrades and effective reply rates head toward zero. Past the cap, more volume is negative, not neutral.",
          "**Relevance dilution.** Your 51st to 100th best prospects reply at a fraction of the top 50. Each added name comes from a weaker filter.",
          "**Follow-through bandwidth.** A reply is only worth what your response speed makes of it. Doubling outreach without doubling reply-handling capacity collapses the meeting rate.",
        ],
      },
      {
        type: "p",
        text:
          "Quality has the higher exponent: a 10 percent improvement in targeting beats a 10 percent increase in volume roughly twice over. The industry average is around 300 emails per meeting booked; disciplined operators do it in under 50. The difference is never volume.",
      },
      { type: "h2", text: "Follow-up discipline" },
      {
        type: "p",
        text:
          "Most replies arrive on touches 2 through 5. Around 80 percent of conversions need five or more touches, while roughly half of senders never follow up once: the gap is the opportunity. But returns fall off a cliff on a silent thread after the fourth follow-up. Run the cadence to the break-up, stop, and recycle the prospect on the next live trigger instead of grinding.",
      },
      { type: "h2", text: "After the reply: where outbound is actually won" },
      {
        type: "ul",
        items: [
          "**Respond in minutes, not hours.** Classic research on millions of inbound leads shows contacting within 5 minutes multiplies qualification odds by an order of magnitude versus waiting half an hour. Treat replies with the same urgency.",
          "**Propose times, never \"when works for you\".** Two concrete slots plus a booking link, meeting within 5 business days.",
          "**Confirm with an agenda.** Three bullet points; it cuts no-shows and frames you as prepared.",
        ],
      },
      { type: "h2", text: "Reading your numbers: the waterfall" },
      {
        type: "table",
        headers: ["Per 1,000 sends", "Healthy", "If below, fix"],
        rows: [
          ["Delivered", "950+ (95%)", "Infrastructure: authentication, warm-up, volume per inbox"],
          ["Opened", "~380 (40%)", "Subject lines, sender reputation"],
          ["Replied", "35 to 50 (3.5 to 5%)", "Targeting or message: change the angle, not the adjectives"],
          ["Positive replies", "60 to 70% of replies", "Offer-audience fit"],
          ["Meetings", "5 to 10", "Response speed, scheduling friction"],
          ["Qualified opportunities", "2 to 4", "Discovery quality, wrong persona in the room"],
          ["Closed", "0.5 to 1", "Urgency, multi-threading, quantified case"],
        ],
      },
      {
        type: "p",
        text:
          "Diagnose top-down and change one variable at a time: subjects, then the hook, then the angle, then the call to action. Give each variant 250+ sends and 5 to 7 business days before declaring anything, and only believe lifts above roughly 15 to 30 percent relative.",
      },
      {
        type: "callout",
        title: "Kill thresholds",
        text:
          "Reply rate under 0.5 percent after 200+ sends: kill that variant or channel and rework targeting. Volume past the inbox cap with declining opens: stop sending and repair the domain. Meetings booked beyond your real capacity: stop prospecting and go close.",
      },
      {
        type: "p",
        text:
          "Elevay runs this strategy natively: tiered daily lists sized to your capacity, multi-channel cadences with caps and windows enforced, reply detection that stops sequences, and the waterfall measured from real events rather than self-reported activity.",
      },
    ],
  },
  {
    slug: "cold-email-playbook",
    category: "Outbound",
    title: "The cold email playbook",
    description:
      "Deliverability foundations, list quality, the four-line message anatomy, sequence design and testing: how founders earn replies in saturated inboxes.",
    blocks: [
      {
        type: "p",
        text:
          "Cold email rewards discipline in layers: infrastructure, then list, then message, then sequence. A failure in a lower layer makes everything above it irrelevant, which is why most cold email fails before anyone reads a word.",
      },
      { type: "h2", text: "Layer 1: deliverability, the oxygen" },
      {
        type: "ul",
        items: [
          "**Authenticate** your sending domain: SPF, DKIM and DMARC, all three. Unauthenticated mail loses 30 to 50 percent of delivery on the major inbox providers before content is even evaluated.",
          "**Warm up** any new mailbox for 2 to 4 weeks, starting around 5 sends a day and ramping gradually.",
          "**Cap volume** at 30 to 50 cold sends per inbox per day. The cap is physics, not policy: past it, reputation decays and the effective reply rate of everything you send approaches zero.",
          "**Send like a human.** Plain text, at most one link, no attachments, no tracking pixels you would be embarrassed to explain, business hours in the recipient's timezone, weekdays.",
          "**Watch two dials.** Bounce rate above 2 percent or spam complaints above 0.1 percent: pause and fix before sending more. An honest, working opt-out is non-negotiable.",
        ],
      },
      { type: "h2", text: "Layer 2: the list" },
      {
        type: "p",
        text:
          "Verified emails only: verified addresses reply at roughly twice the rate of unverified ones, and unverified lists both waste sends and burn the domain through bounces. Two to three contacts per account, current roles confirmed, and a real trigger attached to each prospect. The best subject line in the world cannot rescue a prospect who should never have been on the list.",
      },
      { type: "h2", text: "Layer 3: the message" },
      {
        type: "p",
        text:
          "Fifty to eighty words. Above the fold on a phone. Four lines, each with one job:",
      },
      {
        type: "ol",
        items: [
          "**The trigger.** The observed fact that makes this email exist: their job posting, their announcement, their stack change. Timeline hooks (\"you just...\") outperform problem hooks by more than 2x on replies. Not \"I saw you work at X\".",
          "**The question.** One line that makes them think about their situation, not about your product. Pitching in a first email cuts reply rates roughly in half.",
          "**The proof.** One peer plus one number. \"[A company like theirs] cut [metric] by [amount].\"",
          "**The soft ask.** \"Worth a conversation?\" outperforms \"do you have 30 minutes Tuesday\" by about 3x. You are asking for interest, not for calendar.",
        ],
      },
      {
        type: "p",
        text:
          "Subject lines: 1 to 4 words, lowercase, a question or the trigger itself. Short subjects (under about 40 characters) open best, and a first name in the subject adds measurably. Never fake a thread with \"Re:\".",
      },
      {
        type: "callout",
        title: "What kills replies, measured",
        text:
          "Pitching the product: roughly minus 57 percent. Going past 200 words: roughly minus 60 percent. A hard calendar ask instead of a soft one: about a third of the replies. Generic flattery and fake personalization: the read-and-delete default.",
      },
      { type: "h2", text: "Layer 4: the sequence" },
      {
        type: "ul",
        items: [
          "**3 to 4 emails over 2 to 3 weeks**, woven with call and social touches rather than running alone.",
          "**Every step adds something new**: a different angle, a fresh resource, a new fact. \"Just following up\" with nothing new reads as automation, because it is.",
          "**Stop on reply, instantly.** Any reply, including a no, ends the sequence. Nothing destroys trust like a follow-up that ignores an answer.",
          "**End with a break-up.** \"I am closing your file; busy or priorities changed are both fine. May I close it?\" Loss aversion makes this the single highest-reply touch in most sequences.",
        ],
      },
      { type: "h2", text: "Testing without fooling yourself" },
      {
        type: "p",
        text:
          "One variable at a time, in order of leverage: subject (do they open), first line (do they keep reading), angle (does it resonate), call to action (do they act). 250 to 500 sends per variant, 5 to 7 business days, and only adopt winners showing at least 15 to 30 percent relative lift. Below that is noise wearing a trophy.",
      },
      {
        type: "p",
        text:
          "In Elevay: drafts are generated from cited, verifiable context and your own voice, sent from your own mailbox with warm-up, caps and windows enforced. Replies are detected and classified, sequences stop on reply, and every rejection you give the drafts is learned so the next batch needs less editing.",
      },
    ],
  },
  {
    slug: "cold-calling-playbook",
    category: "Outbound",
    title: "The cold calling playbook for founders",
    description:
      "Why founders should dial, the session discipline, the five phases of a founder call, objection reflexes, and the post-call loop that compounds.",
    blocks: [
      {
        type: "p",
        text:
          "The phone is the highest-bandwidth feedback instrument an early-stage founder has. Nobody answers a cold email to explain why you are wrong; on a call they tell you, and that explorable negative feedback is the rarest data in the company. Twenty calls into one segment is a market answer. It is also the least crowded channel, precisely because it is emotionally hard.",
      },
      { type: "h2", text: "The founder posture" },
      {
        type: "ul",
        items: [
          "**You are not a seller.** You are someone who chose to solve a business problem, calling people who have it. Acting like a rep while being the founder wastes the one advantage you have.",
          "**Say \"founder\" in the first sentence**, without leaning on it. The trust gap versus an unknown rep is structural: a founder is presumed serious about their own company.",
          "**Detach from the outcome.** One piece of information learned makes the call a win; a meeting is a bonus. Prospects can hear need in a voice, and it triggers resistance.",
          "**Slight imperfection reads human.** Over-polished delivery sounds like a script. A founder who is a little unsure sounds real, and that works for you.",
          "**Never take a bad call personally.** They will not remember your name tomorrow. You can even call again the next day.",
          "**A founder can close, not just book.** Unlike a rep whose job ends at the meeting, you can answer every question on the spot, and sometimes finish the job in one call.",
        ],
      },
      { type: "h2", text: "Prepare the session, not each call" },
      {
        type: "ul",
        items: [
          "**A list of 100, not 1,000.** The inclusion bar: you genuinely believe this person will be glad to have talked. That conviction is audible at the opening.",
          "**One segment hypothesis per session.** \"I think this product fits this segment.\" The session exists to validate it. Never mix sectors in one block.",
          "**Batch immersion beats per-prospect research.** Fifteen minutes researching someone who does not pick up is fifteen minutes lost. Spend 30 to 60 minutes on the sector before a block of 50 to 100 instead: a few websites, a few profiles, the patterns. With auto-generated prospect briefs the marginal cost of per-call context is near zero, so you get both.",
          "**A recurring block, non-negotiable.** Same slot every week, hours long. Regularity beats heroic one-offs.",
          "**Reread your FAQ before dialing**, and keep one script per target visible even once memorized. A script is learned like an actor learns a text: lived, not recited.",
        ],
      },
      { type: "h2", text: "The call in five phases" },
      { type: "h3", text: "1. Opening: founder plus permission (first 30 seconds)" },
      {
        type: "p",
        text:
          "\"Hello [first name], [your name], founder of [company]. I can see you [specific observation about them]. Can I take 30 seconds to tell you why I am calling?\" The observation is the reason for the call and it doubles meeting rates versus no reason. The permission question is the only sentence that rises in tone; everything else stays low and unhurried. Never open with \"did I catch you at a bad time\": it is the worst-performing opener ever measured. An early no is a reflex against the interruption, not a verdict; offer a callback and exit cleanly.",
      },
      { type: "h3", text: "2. Collect: their state of the art, before any pitch" },
      {
        type: "p",
        text:
          "After permission, do not pitch. One half-sentence of context (\"I am building [category]\"), then: \"how do you handle this today: what is the process, what are the tools?\" You are mapping how the problem lives at their company, and giving them room to tell you where you are wrong. Early on, this phase can legitimately dominate the call: it is discovery for the product as much as for the deal.",
      },
      { type: "h3", text: "3. Illuminate pains: through peers, never frontally" },
      {
        type: "p",
        text:
          "Never \"do you have problems with X?\": nobody says yes to that. Tell what peers live: \"what we hear from [same role] is [pain, concrete and dated]. For others it is more [pain 2]. Which one is closer to you, or neither?\" Name at most two or three pains, validate them one at a time, and stop at the first that bites. Then, and only then, the solution in one sentence: \"we built [one phrase]. Does that resonate?\"",
      },
      { type: "h3", text: "4. The pivot: choose one of three exits" },
      {
        type: "ul",
        items: [
          "**(a) Extend hot.** It bites hard, they have time, the account is clearly in target: keep going 10 to 15 minutes. For a simple self-serve offer that can mean proposal the same hour; for an implementation-heavy offer it means a hot pre-diagnosis (tools in place, volumes, deadlines, who decides) so the real meeting starts half-filled. Condition: you can answer every question instantly. \"I need to check with my CTO\" is the signal to switch to (b).",
          "**(b) Book the meeting.** It bites but the moment is short or a decider is missing: a 45-minute meeting with an announced deliverable. Give enough to want it, never enough to make it unnecessary.",
          "**(c) Collect and exit.** Nothing bites: one last learning question, thanks, door open. The call still paid for itself.",
        ],
      },
      {
        type: "p",
        text:
          "On an account that is obviously in target, do not over-qualify: go straight to (a) or (b). And shortening a cycle never means pressure; it means answering everything the moment it is asked.",
      },
      { type: "h3", text: "5. Lock it in live, never in deferred" },
      {
        type: "p",
        text:
          "A meeting that is not in the calendar is not a meeting. Send the invitation while still on the phone and ask them to accept it now. Then take 30 more seconds for **two closed questions** whose answers genuinely prepare the meeting: the prospect sees the session will be prepared, you leave with two concrete facts, and no-shows drop. Proposal exit: recap the validated points aloud, send the same day, and set on the phone the moment you will decide together.",
      },
      { type: "h2", text: "Voicemail and objection reflexes" },
      {
        type: "p",
        text:
          "Voicemail, 15 to 20 seconds: name, founder of X, one trigger line, \"I am sending you an email\", number said twice. Its real value is familiarity: connect rates rise 30 to 40 percent on the second attempt. For objections, remember half are reflex dismissals of the interruption, not considered positions:",
      },
      {
        type: "table",
        headers: ["They say", "You say"],
        rows: [
          ["Not interested", "\"Understood. So nobody calls you again: you already have a solution, you handle it internally, or just bad timing?\""],
          ["Send me an email", "\"Happy to, and so it is actually relevant: [one discovery question]?\""],
          ["We already use X", "\"Good. What do you like about it, and what do you wish worked better?\""],
          ["No time", "\"Totally. Thirty seconds: [the one-line problem]. If it is not relevant I leave you alone.\""],
          ["Is this a cold call?", "\"Yes. Thirty seconds and you decide. Deal?\""],
        ],
      },
      { type: "h2", text: "After the call: two minutes, then next" },
      {
        type: "ul",
        items: [
          "**Disposition immediately.** \"Call me tomorrow\" becomes a scheduled task, not a memory.",
          "**No-answer cadence:** about 8 attempts spread over 2 weeks. A call that went badly can be retried the next day; memories are short.",
          "**Document every new question word for word**, with the answer that worked. This FAQ is the asset that makes the hot exit possible and will one day train your first hires.",
          "**Harvest the phrasing.** The words that made prospects react become your website and email copy. Founders who do this ship sharper positioning within weeks.",
          "**Weekly: relisten to your 3 best and 3 worst calls** and fix one lever at a time. One corrected lever can multiply booked meetings.",
        ],
      },
      { type: "h2", text: "Calibration numbers" },
      {
        type: "table",
        headers: ["Metric", "Reference"],
        rows: [
          ["Dials per session (team benchmark)", "50 to 60 a day yields 10 to 15 conversations and 1 to 3 meetings"],
          ["Dials per held meeting, starting out", "~70 on verified mobile data"],
          ["Talk ratio", "You ~55%, them ~45%; no monologue past a minute"],
          ["Connect coverage", "Single-source phone data covers 25 to 30% of a list; cascaded sources reach 50 to 70% on mobiles"],
          ["Win condition per call", "One piece of information learned; meetings and signatures are bonuses"],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the day's list is built from score and live signals, every prospect comes with a grounded brief and call script, you dial from the product, and the transcript, qualification facts and disposition are captured into the record automatically, with the cadence scheduling the next attempt.",
      },
    ],
  },
  {
    slug: "linkedin-playbook",
    category: "Outbound",
    title: "The LinkedIn playbook",
    description:
      "Profile as landing page, connection and DM discipline, the founder content cadence, and where social touches fit inside a multi-channel cadence.",
    blocks: [
      {
        type: "p",
        text:
          "Social is rarely the channel that books the meeting by itself; it is the **credibility layer** that makes your email get answered and your call get taken. Prospects check your profile within minutes of a good cold touch. What they find either confirms the message or quietly kills it.",
      },
      { type: "h2", text: "Profile as landing page" },
      {
        type: "ul",
        items: [
          "**Headline says what you fix for whom**, not your job title. \"Helping [persona] do [outcome]\" beats \"CEO at [startup nobody knows]\".",
          "**About section states the problem in the customer's words**, then who you are. Write it for the prospect who just got your email and clicked.",
          "**Featured links**: one case study or one demo, not twelve.",
        ],
      },
      { type: "h2", text: "Connections and DMs" },
      {
        type: "ul",
        items: [
          "**Connection note under 150 characters, no pitch.** Reference their context: \"[First name], [observation about their post or company]. I am building in this space. Worth connecting.\" Acceptance is the goal; the conversation comes later.",
          "**After acceptance, still no pitch.** A thank you plus one question tied to their situation. Value first, always.",
          "**Stay under 80 to 100 connection requests a week.** Beyond that the platform restricts accounts, and automation tools get them banned. This channel does not scale by volume, by design.",
          "**DM when warm.** Direct messages to engaged or connected prospects reply around 10 percent, roughly 3x cold email, but the channel saturates fast. Reserve DMs for tier A and B prospects with one real reason, and keep them shorter than your emails.",
          "**A 45 to 60 second video DM** mid-cadence is a strong pattern interrupt: video earns about 3x the reply rate of the same words as text, and almost nobody does it well.",
        ],
      },
      { type: "h2", text: "The founder content cadence" },
      {
        type: "p",
        text:
          "Content is outbound's demand layer. Prospects who already know your name reply at multiples of pure cold: inbound-led outbound converts around 8x better than cold alone. The discipline:",
      },
      {
        type: "ul",
        items: [
          "**2 to 5 posts a week, 30 minutes a day, cap it there.** Consistency beats brilliance.",
          "**Each post is one insight from your real prospect conversations**: the pattern you keep hearing, the mistake you keep seeing, the number that surprised you. Never generic thought leadership.",
          "**Give until they ask.** Share the method openly; sell the implementation. The founders who teach their playbook in public are the ones whose DMs fill up.",
          "**Engage before you connect.** A thoughtful comment on a tier A prospect's post days before your first touch changes how every later touch lands.",
        ],
      },
      { type: "h2", text: "Where social sits in the cadence" },
      {
        type: "table",
        headers: ["Moment", "Social touch"],
        rows: [
          ["Before the first email", "Follow, view the profile, leave one substantive comment"],
          ["Day 1, with email 1", "Profile view; like or comment on a recent post"],
          ["Day 5", "Connection request, no pitch"],
          ["After acceptance or any warm signal", "Short DM with the one real reason, or the 45-second video"],
          ["During the silence after touch 4", "Keep engaging content lightly; recycle on the next trigger"],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: cadences plan social touches alongside email and call steps with the suggested note drafted for you, so the channel runs as one rhythm instead of three disconnected tools. You stay the one who connects and posts: on this channel, being visibly human is the entire point.",
      },
    ],
  },
];
