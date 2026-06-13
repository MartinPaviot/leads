import type { DocStep } from "../types";

/**
 * Phase: Run outbound (steps 8-12). The cadence that combines channels,
 * one playbook per channel, and the brand layer that multiplies all of
 * them. Sources: outbound framework research (multi-million-send and
 * multi-million-dial datasets), founder cold-call playbook research, and
 * the modern-GTM practitioner interview (multi-channel doctrine, brand
 * campaigns, gifting, launch playbook).
 */
export const runSteps: DocStep[] = [
  {
    slug: "design-the-cadence",
    step: 8,
    phase: "Run outbound",
    title: "Design the cadence",
    description:
      "Channel strategy by stage, the multi-channel rhythm where one plus one equals four, follow-up discipline, and what happens in the minutes after a reply.",
    blocks: [
      {
        type: "p",
        text:
          "First, remember what outbound buys you that no other motion does: **you choose your customers**. Inbound takes whoever shows up; outbound works the exact companies your TAM says you should win. And the buyers who matter most rarely come to you: a senior decision maker at a serious company does not fill in demo forms. If you want that customer, you go get them, which is why even self-serve products keep running outbound toward the segment that will never sign itself up.",
      },
      {
        type: "p",
        text:
          "Channel strategy at the early stage is then two decisions: which channel you lead with, and when you add the second. Lead with the channel where **you are credible and your buyer actually answers**. Then add the second sooner than feels comfortable: properly sequenced, channels do not add, they compound. Email plus social in the same sequence is not one plus one equals two; it is closer to four, because the touches reference each other (\"following up from my note on LinkedIn\") and the prospect assembles them into one persistent, real person. Phone is the third channel; gifting (Step 12) can be a fourth. One non-negotiable: real domains, your real name. Spraying the universe from lookalike domains is how reply rates reach zero.",
      },
      {
        type: "callout",
        title: "The 2026 edge",
        text:
          "Outbound is not dead; it molts. It went from door-knocking to phone to handwritten email to sequencers, and each wave died of its own success: a tactic stops working the day everyone copies it. The 2026 version: inboxes are flooded with machine-written mail, templated AI campaigns lose more than half their reply rate within 18 months as buyers pattern-match them, and domains running full-volume AI burn their reputation in a quarter. What compounds instead of decaying: real signals, a recognized name, the founder's own voice, and the channels automation cannot fake, starting with a human on the phone. The only durable AI arrangement is the one this method assumes: the machine drafts and researches, a human judges and signs. And expect this paragraph itself to age: when a tactic here stops working, re-derive from the doctrine (Step 1), not from nostalgia.",
      },
      { type: "h2", text: "What each channel returns" },
      {
        type: "table",
        headers: ["Channel", "Median performance", "Notes"],
        rows: [
          ["Cold email", "~3.4% reply (top decile 10%+; signal-led runs reach 15 to 25%)", "Cheap and scalable, capped by deliverability. The middle is disappearing: generic runs sit at 1 to 3%."],
          ["Cold calling", "~6% connect; 1 to 3 meetings per 50 to 60 dials", "Highest-bandwidth feedback in B2B. Emotionally hard, which is why it is uncrowded."],
          ["Social (professional network)", "~10% DM reply on warm profiles", "The credibility layer woven between email and call touches."],
        ],
      },
      {
        type: "p",
        text:
          "Geography moves these numbers: European inboxes are far less saturated than US ones (reply rates often run 2 to 3 times higher) but cycles run 30 to 50 percent longer, and calling culture varies by country. Write in the prospect's language, always.",
      },
      { type: "h2", text: "Routing by stage" },
      {
        type: "table",
        headers: ["Stage", "Mode", "Volume", "Cadence"],
        rows: [
          ["Pre-PMF (under 10 customers)", "Learning mode: validate the wedge", "10 to 15 conversations per week", "No automation. 50 discovery conversations beat any sequence."],
          ["Founder-led, deal size under $50K", "Signal-based, hyper-relevant, founder as sender", "10 to 15 new prospects per week", "5 to 8 touches over 14 to 21 days, email + call + social"],
          ["Founder-led, deal size $50K to $100K", "Deeper research, multi-threaded accounts", "5 to 8 new prospects per week", "8 to 12 touches over 30 to 45 days, add video"],
          ["Scaling team, deal size over $100K", "Named accounts, coordinated plays", "3 to 5 accounts per week", "12 to 18 touches over 45 to 90 days"],
        ],
      },
      {
        type: "example",
        title: "Example: Elevay's reference cadence (14 to 21 days)",
        lines: [
          "Day 1: email 1 built on the live signal (the SDR job post). Same day: view the founder's profile, react to a recent post.",
          "Day 3: call + voicemail + email 2 referencing the call, same day. The same-day triple touch is the strongest pattern in the data.",
          "Day 5: connection request, under 150 characters, no pitch.",
          "Day 10: value email: one insight from conversations with similar founders, no meeting ask.",
          "Day 14: a binary question (\"is automating the SDR work a this-quarter topic or a someday topic?\"), or a 45-second video.",
          "Day 21: break-up email. Closing the file honestly earns outsized reply rates on this final touch.",
        ],
      },
      { type: "h2", text: "The volume trap" },
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
          "Most replies arrive on touches 2 through 5. Around 80 percent of conversions need five or more touches, while roughly half of senders never follow up once: that gap is the opportunity. But returns fall off a cliff on a silent thread after the fourth follow-up, and \"just following up\" with nothing new has reached diminishing returns everywhere: everyone knows it is automated. Every follow-up adds something (a new fact, a new resource, a new angle), the cadence runs to the break-up, stops, and the prospect recycles on the next live trigger.",
      },
      { type: "h2", text: "After the reply: where outbound is actually won" },
      {
        type: "ul",
        items: [
          "**Respond in minutes, not hours.** Research on millions of inbound leads shows contacting within 5 minutes multiplies qualification odds by an order of magnitude versus waiting half an hour. Treat replies with the same urgency.",
          "**Propose times, never \"when works for you\".** Two concrete slots plus a booking link, meeting within 5 business days.",
          "**Confirm with a 3-point agenda.** It cuts no-shows and frames you as prepared.",
          "**Stop the sequence instantly on any reply.** Nothing destroys trust like a follow-up that ignores an answer.",
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: email cadences run with caps, windows and warm-up enforced, every touch logged automatically, replies detected and classified, and sequences stopped on reply. Running calls and social inside the same cadence (today calls run as their own campaign and the social channel is in integration), and pacing the day to your real meeting capacity, are on the build path.",
      },
    ],
  },
  {
    slug: "cold-email",
    step: 9,
    phase: "Run outbound",
    title: "Cold email",
    description:
      "Deliverability foundations, list quality, the four-line message anatomy, sequence design and honest testing.",
    blocks: [
      {
        type: "p",
        text:
          "Cold email is not dead; lazy cold email is. Thousands of identical messages from a no-name domain to an unsegmented list earn fractions of a percent. Signal-led, genuinely relevant email from a founder's real mailbox still earns double-digit reply rates. The difference is built in layers: infrastructure, then list, then message, then sequence. A failure in a lower layer makes everything above it irrelevant.",
      },
      { type: "h2", text: "Layer 1: deliverability, the oxygen" },
      {
        type: "ul",
        items: [
          "**Authenticate** the sending domain: SPF, DKIM and DMARC, all three. Unauthenticated mail loses 30 to 50 percent of delivery before content is even evaluated.",
          "**Warm up** any new mailbox for 2 to 4 weeks, starting around 5 sends a day and ramping gradually.",
          "**Cap volume** at 30 to 50 cold sends per inbox per day. The cap is physics, not policy.",
          "**Send like a human.** Plain text, at most one link, no attachments, business hours in the recipient's timezone, weekdays.",
          "**Watch two dials.** Bounce rate above 2 percent or spam complaints above 0.1 percent: pause and fix before sending more. An honest, working opt-out is non-negotiable.",
        ],
      },
      { type: "h2", text: "Layer 2: the list" },
      {
        type: "p",
        text:
          "Verified emails only: verified addresses reply at roughly twice the rate of unverified ones, and unverified lists both waste sends and burn the domain through bounces. Two to three contacts per account, current roles confirmed, a real trigger attached to each prospect. The best subject line in the world cannot rescue a prospect who should never have been on the list.",
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
          "**The trigger.** The observed fact that makes this email exist, with the receipt. Timeline hooks (\"you just...\") outperform problem hooks by more than 2x on replies.",
          "**The question.** One line that makes them think about their situation, not about your product. Pitching in a first email cuts reply rates roughly in half.",
          "**The proof.** One peer plus one number.",
          "**The soft ask.** \"Worth a conversation?\" outperforms \"do you have 30 minutes Tuesday\" by about 3x. You are asking for interest, not for calendar.",
        ],
      },
      {
        type: "p",
        text:
          "Subject lines: 1 to 4 words, lowercase, a question or the trigger itself. Short subjects (under about 40 characters) open best; a first name in the subject adds measurably. Never fake a thread with \"Re:\": it opens well and burns trust on contact, which is the wrong trade.",
      },
      {
        type: "example",
        title: "Example: an Elevay first touch (72 words)",
        lines: [
          "Subject: your sdr posting",
          "Hi Lena, your Founding SDR posting went up this week, the one listing prospecting, list building and follow-ups.",
          "Before that salary is committed: which half of the role do you actually want a human for, the lists or the conversations?",
          "A 9-person founder we work with kept the conversations, automated the rest, and runs the same pipeline in about 6 hours a week, without the hire.",
          "Worth a conversation while you interview?",
        ],
      },
      {
        type: "p",
        text:
          "Read it against the four rules: line one is the trigger, dated and specific, with nothing about us. Line two makes her think about **her** decision, and never pitches (the product is not even named: naming it in a first email is pitching). Line three is one peer plus one number. Line four asks for interest, not for calendar. Seventy-two words, one question mark she can answer in one line.",
      },
      {
        type: "callout",
        title: "What kills replies, measured",
        text:
          "Pitching the product: roughly minus 57 percent. Going past 200 words: roughly minus 60 percent. A hard calendar ask instead of a soft one: about a third of the replies. Irrelevant personal trivia before the pitch: worse than the pitch alone.",
      },
      { type: "h2", text: "Layer 4: the sequence" },
      {
        type: "ul",
        items: [
          "**3 to 4 emails over 2 to 3 weeks**, woven with call and social touches rather than running alone.",
          "**Every step adds something new**: a different angle, a fresh resource, a new fact.",
          "**Stop on reply, instantly.** Any reply, including a no, ends the sequence.",
          "**End with a break-up.** \"I am closing your file; busy or priorities changed are both fine. May I close it?\" Loss aversion makes this the single highest-reply touch in most sequences.",
        ],
      },
      { type: "h2", text: "Objections in the reply (the booking stage)" },
      {
        type: "p",
        text:
          "A reply with an objection is a live conversation, not a rejection. Answer within minutes (Step 8), keep it shorter than the original email, and always end on a question:",
      },
      {
        type: "table",
        headers: ["They reply", "You answer"],
        rows: [
          ["Not interested", "\"Understood, and thanks for answering at all. So I close the right file: already solved, handled internally, or just not now? One word is plenty.\""],
          ["Send me more info", "\"Happy to send exactly the right thing rather than a brochure: is the question [dimension A] or [dimension B]? One line back and I will keep it to one page.\""],
          ["We already use [tool]", "\"Good choice for [what it does well]. Most teams we help kept it and fixed [the adjacent gap]. Is [gap] solved for you too, honestly?\""],
          ["What does it cost?", "\"[Exact price], most people land at [plan]. Whether it is worth it depends on [the one variable from their world]: what does [that] look like for you?\""],
          ["Not the right person", "\"Thanks, that saves us both time. Who owns [the problem] so I stop guessing? Happy to mention you sent me or leave you out of it, your call.\""],
          ["Timing is bad, try in Q3", "\"Noted for [month], in the calendar. One question so the Q3 email is worth opening: will [trigger they mentioned] still be the driver then?\""],
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
          "In Elevay: drafts are generated from cited, verifiable context in your voice, sent from your own mailbox with warm-up, caps and windows enforced, replies classified, sequences stopped on reply, and every rejection you give the drafts is learned so the next batch needs less editing.",
      },
    ],
  },
  {
    slug: "cold-calling",
    step: 10,
    phase: "Run outbound",
    title: "Cold calling",
    description:
      "The founder posture, session discipline, the five phases of a founder call, objection reflexes, and the post-call loop that compounds.",
    blocks: [
      {
        type: "p",
        text:
          "\"Cold calling is dead\" is the worst advice in circulation, and it is given exclusively by people who do not dial. In 2026 it is more alive than it has been in a decade: the inbox is where AI fights AI, and the phone is where a human being stands out. The phone is also the highest-bandwidth feedback instrument an early-stage founder has. Nobody answers a cold email to explain why you are wrong; on a call they tell you, and that explorable negative feedback is the rarest data in the company. **Twenty calls into one segment is a market answer**: the same answer a month of landing-page iterations and ad spend buys, for the price of an afternoon. It is also the least crowded channel, precisely because it is emotionally hard: for every thousand founders posting, five are dialing, and the five are talking directly to their market.",
      },
      { type: "h2", text: "The founder posture" },
      {
        type: "ul",
        items: [
          "**You are not a seller.** You are someone who chose to solve a business problem, calling people who have it. Acting like a rep while being the founder wastes the one advantage you have.",
          "**Say \"founder\" in the first sentence**, without leaning on it. The trust gap versus an unknown rep is structural.",
          "**Detach from the outcome.** One piece of information learned makes the call a win; a meeting is a bonus. Prospects hear need in a voice, and it triggers resistance.",
          "**Slight imperfection reads human.** Over-polished delivery sounds like a script; a founder who is a little unsure sounds real, and it works for you.",
          "**Never take a bad call personally.** They will not remember your name tomorrow; you can even call again the next day.",
          "**A founder can close, not just book.** You can answer every question on the spot, and sometimes finish the job in one call.",
        ],
      },
      { type: "h2", text: "Prepare the session, not each call" },
      {
        type: "ul",
        items: [
          "**A list of 100, not 1,000.** The inclusion bar: you genuinely believe this person will be glad to have talked.",
          "**One segment hypothesis per session.** The session exists to validate it; never mix sectors in one block.",
          "**Batch immersion beats per-prospect research.** 30 to 60 minutes on the sector before a block of 50 to 100 calls; with auto-generated briefs the per-call context costs nothing extra.",
          "**A recurring block, non-negotiable.** Same slot every week, hours long. Regularity beats heroic one-offs.",
          "**Reread your FAQ before dialing**, and keep one script per target visible even once memorized: lived, not recited, like an actor with a text. The script is a method, not a monument: new target or new feature means re-deriving it, never stretching one generic script across every audience.",
          "**Do not wait to be ready.** The first hundred meetings need a phone, a printed list and a paper script; operators who own every tool in the category still revert to exactly that. Perfection comes from dialing, not before it. Do not overkill the subject.",
        ],
      },
      { type: "h2", text: "The call in five phases" },
      {
        type: "h3",
        text: "1. Opening: founder plus permission (first 30 seconds)",
      },
      {
        type: "p",
        text:
          "\"Hello [first name], [your name], founder of [company]. I can see you [specific observation]. Can I take 30 seconds to tell you why I am calling?\" The observation is the reason for the call and it doubles meeting rates versus no reason. The permission question is the only sentence that rises in tone. Never open with \"did I catch you at a bad time\": the worst-performing opener ever measured. An early no is a reflex against the interruption, not a verdict; offer a callback and exit cleanly.",
      },
      { type: "h3", text: "2. Collect: their state of the art, before any pitch" },
      {
        type: "p",
        text:
          "After permission, do not pitch. One half-sentence of context, then: \"how do you handle this today: what is the process, what are the tools?\" You are mapping how the problem lives at their company, and giving them room to tell you where you are wrong. Early on, this phase can legitimately dominate the call: it is product discovery as much as sales.",
      },
      { type: "h3", text: "3. Illuminate pains: through peers, never frontally" },
      {
        type: "p",
        text:
          "Never \"do you have problems with X?\": nobody says yes to that. Tell what peers live and let them recognize themselves. Name at most 2 or 3 specific pains, validate one at a time, stop at the first that bites. Then, and only then, the solution in one sentence.",
      },
      {
        type: "example",
        title: "Example: an Elevay peer-pain line",
        lines: [
          "\"What we hear from founders at your stage: one tells us he spends Sunday evenings building prospect lists that are stale by Thursday. For others it is follow-ups: three interested replies from last month that nobody ever wrote back to. Which one is closer to you, or neither?\"",
        ],
      },
      { type: "h3", text: "4. The pivot: choose one of three exits" },
      {
        type: "ul",
        items: [
          "**(a) Extend hot.** It bites hard, they have time, the account is clearly in target: keep going 10 to 15 minutes. People who say they have two minutes sometimes have thirty. For a simple self-serve offer that can mean a proposal the same hour; for an implementation-heavy offer it means a hot pre-diagnosis (tools in place, volumes, deadlines, who decides) so the real meeting starts half-filled. Condition: you can answer every question instantly. \"I need to check with my CTO\" is the signal to switch to (b).",
          "**(b) Book the meeting.** It bites but the moment is short or a decider is missing: a 45-minute meeting with an announced deliverable. Give enough to want it, never enough to make it unnecessary.",
          "**(c) Collect and exit.** Nothing bites: one last learning question, thanks, door open. The call still paid for itself.",
        ],
      },
      {
        type: "p",
        text:
          "On an account that is obviously in target, do not over-qualify: go straight to (a) or (b). Shortening a cycle never means pressure; it means answering everything the moment it is asked.",
      },
      { type: "h3", text: "5. Lock it in live, never in deferred" },
      {
        type: "p",
        text:
          "A meeting that is not in the calendar is not a meeting. Send the invitation while still on the phone and ask them to accept it now. Then take 30 more seconds for **two closed questions** whose answers genuinely prepare the meeting: the prospect sees the session will be prepared, you leave with two concrete facts, and no-shows drop. Proposal exit: recap the validated points aloud, send the same day, set on the phone the moment you will decide together.",
      },
      { type: "h2", text: "Voicemail and objection reflexes" },
      {
        type: "p",
        text:
          "Voicemail, 15 to 20 seconds: name, founder of X, one trigger line, \"I am sending you an email\", number said twice. Its real value is familiarity: connect rates rise 30 to 40 percent on the second attempt. For objections, remember half are reflex dismissals of the interruption:",
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
      { type: "h2", text: "More than pipeline: what founder dials produce" },
      {
        type: "p",
        text:
          "A founder's cold calls compound beyond revenue, and the by-products are not anecdotes; plan for them. Senior operators **like** being called by a founder: it casts them as the experienced peer, and helping feels good at that altitude. Founders have had early customers ask to join the advisory board, make angel checks, and open their networks, all originating from a cold dial. Every call also feeds the market map (who uses what, what broke, what they pay) and the messaging loop: the phrases that made prospects lean in become the website (Step 3). Track these side-products like pipeline; over a year they are worth as much.",
      },
      { type: "h2", text: "After the call: two minutes, then next" },
      {
        type: "ul",
        items: [
          "**Disposition immediately.** \"Call me tomorrow\" becomes a scheduled task, not a memory.",
          "**No-answer cadence:** about 8 attempts spread over 2 weeks.",
          "**Document every new question word for word**, with the answer that worked. This FAQ is the asset that makes the hot exit possible and will one day train your first hires.",
          "**Harvest the phrasing.** The words that made prospects react become your website and email copy (Step 3).",
          "**Weekly: relisten to your 3 best and 3 worst calls** and fix one lever at a time. One corrected lever can multiply booked meetings.",
        ],
      },
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
          "In Elevay: the day's list is built from score and live signals, every prospect comes with a grounded brief and call script, you dial from the product, and the transcript, qualification facts and disposition are captured automatically, with the cadence scheduling the next attempt. The point is the oldest waste in the trade: unassisted calling teams lose five hours of an eight-hour day to research and data entry. Those five hours are what the machine gives back to the conversation.",
      },
    ],
  },
  {
    slug: "linkedin-and-content",
    step: 11,
    phase: "Run outbound",
    title: "LinkedIn and content",
    description:
      "Profile as landing page, connection and DM discipline, the founder content cadence, and where social touches sit inside the rhythm.",
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
          "**Headline says what you fix for whom**, not your job title.",
          "**About section states the problem in the customer's words**, then who you are. Write it for the prospect who just got your email and clicked.",
          "**Featured links:** one case study or one demo, not twelve.",
        ],
      },
      { type: "h2", text: "Connections and DMs" },
      {
        type: "ul",
        items: [
          "**Connection note under 150 characters, no pitch.** Acceptance is the goal; the conversation comes later.",
          "**After acceptance, still no pitch.** A thank you plus one question tied to their situation.",
          "**Stay under 80 to 100 connection requests a week.** Beyond that the platform restricts accounts, and automation tools get accounts banned. This channel does not scale by volume, by design.",
          "**DM when warm.** Replies run around 10 percent, roughly 3x cold email, but the channel saturates fast: reserve DMs for tier A and B with one real reason, shorter than your emails.",
          "**A 45 to 60 second video DM** mid-cadence is a strong pattern interrupt: about 3x the reply rate of the same words as text, and almost nobody does it well.",
        ],
      },
      {
        type: "example",
        title: "Example: Elevay connect note and first DM",
        lines: [
          "Connect note (under 150 characters): \"Lena, your post on hiring a first SDR matched what 30 founders told us this quarter. Building in this space. Worth connecting.\"",
          "First DM after acceptance: \"Thanks for connecting. Genuine question, no pitch: when you scoped the SDR role, which half worried you more, the list building or the follow-up discipline?\"",
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
          "**Talk about the problem and the process, never your product.** The product shows up in the DMs that follow, not in the posts. The moment your feed reads like a brochure, the compounding stops.",
          "**Give until they ask.** Share the method openly; sell the implementation.",
          "**Engage before you connect.** A thoughtful comment on a tier A prospect's post days before your first touch changes how every later touch lands.",
        ],
      },
      { type: "h2", text: "Where social sits in the cadence" },
      {
        type: "table",
        headers: ["Moment", "Social touch"],
        rows: [
          ["Before the first email", "Follow, view the profile, leave one substantive comment"],
          ["Day 1, with email 1", "Profile view; react to a recent post"],
          ["Day 5", "Connection request, no pitch"],
          ["After acceptance or any warm signal", "Short DM with the one real reason, or the 45-second video"],
          ["During the silence after touch 4", "Keep engaging lightly; recycle on the next trigger"],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: cadences plan social touches alongside email and call steps with the suggested note drafted for you. You stay the one who connects and posts: on this channel, being visibly human is the entire point.",
      },
    ],
  },
  {
    slug: "brand-gifts-launches",
    step: 12,
    phase: "Run outbound",
    title: "Brand, gifts and launches",
    description:
      "The demand layer that multiplies every channel: creative campaigns judged by anecdotes, gifts that pass the keep-it test, and launches you can run more than once.",
    blocks: [
      {
        type: "p",
        text:
          "Outbound efficacy is not independent of brand. The same company, same product, same message gets exponentially higher reply rates once the target market has heard of you: name recognition converts cold outreach into warm. And the effect does not stop at the reply: a name people have seen carries inherent credibility into every demo and every negotiation, which moves close rates too. That is why brand work belongs in an outbound method, and why the founders who skip it pay for it twice.",
      },
      { type: "h2", text: "Anecdotes beat attribution" },
      {
        type: "p",
        text:
          "At the early stage, do not try to measure brand campaigns scientifically. You will spend more effort measuring than doing, the result will be wrong (you cannot see the group chat where six people mention you), and wrong takeaways steer you badly. Judge campaigns by **anecdotes**: the things prospects spontaneously bring up (\"I see you everywhere lately\", \"I heard about your event\"). When the anecdotes are silent, the campaign did not work; cross it out, take the learning, try the next thing. Trying things that fail is the process working, not failing.",
      },
      { type: "h2", text: "The monthly creative ritual" },
      {
        type: "p",
        text:
          "The channels that cost money are easy (you enter a credit card), which is exactly why they are crowded. The edge is in things that are **creative and operationally hard**. Once a month, force the ritual: the whole team (even if that is three people) brings two or three ideas, whiteboard them, vote, set a budget per campaign, execute the best one. The worst thing to do is nothing.",
      },
      {
        type: "ul",
        items: [
          "**Spend a meaningful share on the customer, not on advertisers.** Of every marketing dollar, push 30 to 50 percent toward things that directly benefit the target customer (a genuinely good gift, an event they enjoy) instead of paying a platform to interrupt them.",
          "**Events people actually want to attend.** Generic dinners and panels compete on the restaurant. Things people genuinely enjoy (a poker night, a comedy show) get attendance, memory and retelling, and almost nobody does them.",
          "**Different and hard beats polished and standard.** If any company could do it by entering a card number, it is not a moat.",
        ],
      },
      { type: "h2", text: "Gifting that works" },
      {
        type: "ul",
        items: [
          "**It is NOT the thought that counts.** A logo t-shirt or a cheap trinket is negative value. The bar: would you, honestly, think this is cool?",
          "**Visible or social wins.** The best gifts either sit where the recipient sees them every day (a desk object, a framed piece) or get shared with the team (a great bottle on a fundraise: \"enjoy it with the team\"). Both keep working long after delivery.",
          "**Tie it to a moment.** A congratulations gift on a fundraise lands as celebration, not solicitation: same signal discipline as Step 7.",
          "**The math is reasonable.** A genuinely good object at $100, sent to 100 perfectly targeted founders, is $10K: less than most ad experiments, and people remember who sent it.",
        ],
      },
      {
        type: "example",
        title: "Example: an Elevay gifting play",
        lines: [
          "Trigger: a tier A account announces a seed round (Step 7 signal, 180-day window).",
          "Gift: a genuinely good object a founder keeps on the desk, with a handwritten card from the founder of Elevay: congratulations first, no pitch, one line of origin story.",
          "Follow-up: ten days later, the cadence's first email references neither the gift nor a favor owed; it stands on the SDR-posting signal. The gift did its job already: the name is known when the email lands.",
        ],
      },
      { type: "h2", text: "The launch playbook" },
      {
        type: "ul",
        items: [
          "**You can launch many times.** Product launch, fundraise announcement, major release, general availability: each is a point-in-time attention event. Use them all.",
          "**45 days out, assemble a launch committee** (your whole company, if that is five people). Everyone brings two or three ideas, the crazier the better, budget caps per campaign. Whiteboard, pick the best three or four, execute.",
          "**Distribution matters as much as content.** A launch video or post without a distribution plan is a tree falling in a forest. Build the spreadsheet with four tabs: employees, investors, friends of the company, customers. Outreach to each group the day before and the day of. Ask every employee: who are the three to five most influential people in your network?",
          "**Concentrate, do not dribble.** Going from unknown to visible all at once (\"suddenly I see them everywhere\") beats spreading the same budget over nine months. The concentrated version creates the moment people talk about.",
          "**Opportunism is a budget multiplier.** Excess inventory exists everywhere: the ad space, trucks or screens nobody booked this week go for a fraction of list price to whoever asks. The founders who get famous cheaply are the ones who ask.",
          "**Know your phase.** Design partners (private, feedback-first), then a metered public beta (waitlist, only the customers you can make successful), then general availability. Each phase transition is a launch.",
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: brand work stays human (it is creative and operationally hard, which is the point), but its effects are visible in the machine: reply-rate shifts after campaigns, accounts that arrive warm, and inbound interest landing in the same TAM and the same cadences as everything else.",
      },
    ],
  },
];
