# MAITRISE GTM — 06 : Bibliotheque de Scripts Outbound

> 80 scripts production-grade, par stage et canal, avec mecanisme + performance attendue + conditions d'echec. Sources : 30MPC, Jason Bay, Josh Braun, Lemlist, Sam Blond, Steli Efti, Kyle Coleman, Gong Labs. **Chaque script est analyse selon le Theoreme GTM (Morceau 05) :** quel vecteur Aᵢ il optimise, et pourquoi il marche multiplicativement.

> **Phronesis vs Episteme :** ces scripts sont l'episteme — patterns documentes qui marchent statistiquement. Ils ne dispensent pas du jugement contextuel. Le founder qui copie-colle perd. Le founder qui les utilise comme **structure** et personnalise sur les details specifiques au prospect gagne. Chaque script est un point de depart, pas un endpoint.

---

## 1. Premier principe — pourquoi une bibliotheque de scripts au lieu de templates AI

L'industrie 2026 produit des templates AI generiques en quantite industrielle. Resultat : reply rate cold email moyen passe de 8.5% (2019) a 3.43% (2026). Les acheteurs ont developpe un detecteur de patterns AI qui declenche en 1-2 secondes.

Une bibliotheque de scripts pratitioner-grade fait quatre choses qu'un AI generator ne fait pas :

1. **Chaque script optimise un vecteur Aᵢ specifique du Theoreme.** Pas du copy generique. Du copy avec un mecanisme psychologique identifie.
2. **Chaque script vient avec ses conditions d'echec.** Pas "use this template anywhere." Le bon script au mauvais moment underperforme un mauvais script au bon moment.
3. **Chaque script a une performance mesuree** — pas une promesse marketing.
4. **Le founder garde phronesis** : il choisit le script + personnalise les details specifiques. L'AI propose, l'humain dispose.

---

## 2. Cold email — par stage de conversation

### 2.1 First-Touch Signal-Triggered

#### Script 1A : Post-Funding (Series A/B)
**Optimise :** A_buyer_kairos (le funding event est un signal fort), A_signal_relevance (cash flow context).

```
Subject: Quick question after your Series [X]

Hi [First Name],

Saw the Series [A/B] announcement — congrats.

One pattern we see often after a round like this: [ICP company type] 
teams suddenly have budget to fix the [specific pain] they've been 
duct-taping for 18 months, but the hiring plan absorbs the first 90 days.

We help [1-line ICP description] do [specific outcome] without 
adding headcount.

Worth 15 minutes before the hiring scramble kicks in?

[Your name]
```

**Mecanisme :** Tie outreach to a verifiable event they just lived. Names the exact tension that event creates (cash before team). Positions your solution as the bridge.

**Performance :** 12-18% reply rate sur listes well-researched (Lemlist 2024). Signal-triggered emails outperform generic cold by 3-5x (Gong Labs).

**Echec quand :** envoye 3+ semaines apres l'annonce, funding < $1M (pas un buying signal), tu ne peux pas mapper specifically leur pain a l'event.

#### Script 1B : Post-Key-Hire (New VP Sales / CRO / CMO)
**Optimise :** A_buyer_kairos (60-90 jour window post-hire), A_message_resonance (insider knowledge of inherited problems).

```
Subject: [First Name] — one thing the last [role] probably didn't fix

Hi [First Name],

Noticed you joined [Company] as [VP Sales / CRO] last month.

Most [VPs/CROs] we talk to inherit three things from their predecessor: 
a Salesforce instance nobody trusts, a pipeline that's 60% wishful 
thinking, and a team that's been selling on vibes.

We work with [role]s at [2-3 comparable companies] to [specific 
outcome in 90 days].

Happy to share what worked for [comparable company] — 15 minutes?

[Your name]
```

**Mecanisme :** Nouveaux executives dans 30-90 jour window where they're actively diagnosing inherited problems. Tu names les exact ones. Zero pitch.

**Performance :** 15-22% reply rate. New executives reply at 2x rate of tenured ones (30MPC). Window closes fast — envoyer dans 30 jours du LinkedIn start date.

**Echec quand :** sent apres 60 jours, you name wrong inherited problems pour their industry, hire trop junior pour buying authority.

#### Script 1C : Post-Event / Post-Conference
**Optimise :** A_message_resonance (shared context), A_channel_trust (peer-positioning via roundtable).

```
Subject: [Conference name] follow-up — [specific session or topic]

Hi [First Name],

Were you at [Conference] last week? I caught [specific speaker / 
session] — the point about [specific insight] landed differently 
than the usual [topic] take.

It connects directly to something we're seeing with [ICP role] at 
[company size/type]: [one-sentence problem statement].

I'm putting together a 20-minute roundtable with [3-4 practitioners] 
who are dealing with this. Would you want a seat?

[Your name]
```

**Mecanisme :** Shared context cree immediate rapport. Roundtable ask est lower commitment qu'un demo. Positions toi comme un convener, pas un vendor.

**Performance :** 18-25% reply rate quand event est recent (< 7 jours) et session reference est specifique. Josh Braun : "borrowing credibility from the event."

**Echec quand :** tu n'as pas attended et tu te fais caught, roundtable n'a pas reellement lieu, ou emailing 2+ semaines post-event.

### 2.2 First-Touch Hyper-Personalized (1:1)

#### Script 1D : Deep Research, Single Insight
**Optimise :** A_signal_relevance (specific inference), A_message_resonance (proof of pre-work).

```
Subject: [Company name] + [specific observation]

Hi [First Name],

I spent 20 minutes on [Company]'s website and noticed [specific 
observation — pricing page structure, job postings pattern, product 
changelog language, recent blog post argument].

That usually means [company type] is dealing with [specific 
inference].

If I'm right, [one sentence on how you help].

Wrong? Tell me what I'm missing — genuinely curious.

[Your name]
```

**Mecanisme :** Shows real pre-work. "Tell me what I'm missing" defuses defensiveness et invites response meme si inference est wrong — Josh Braun's "open question" pattern.

**Performance :** 25-40% reply rate sur 1:1 campaigns. Pas scalable au-dela de 5-10/jour. Reply quality significantly higher.

**Echec quand :** observation est generique ("I noticed you're hiring salespeople"), inference trop aggressive, ou sending at volume.

#### Script 1E : LinkedIn Research to Email
**Optimise :** A_message_resonance (engagement avec leur thinking, pas leur job title).

```
Subject: Your post about [topic] — question

Hi [First Name],

Your post last week about [specific argument from their LinkedIn 
post] — specifically the part about [one sentence] — is exactly the 
tension we see at [ICP company stage].

Most [role]s we talk to resolve it one of two ways: [Option A] or 
[Option B]. Both have real tradeoffs.

We've been helping [ICP] teams find a third path. Worth 15 minutes 
to compare notes?

[Your name]
```

**Mecanisme :** References published thinking, pas company. Positions toi comme quelqu'un qui engage with ideas.

**Performance :** 20-35% reply rate. Kyle Coleman : LinkedIn-referenced cold emails get 40% higher open rates et 2x reply rates vs non-referenced.

**Echec quand :** LinkedIn post > 30 jours, references wrong post at scale, prospect hasn't posted publiquement depuis mois.

### 2.3 First-Touch Broader Cold (avec Specificity)

#### Script 1F : Problem-Led, ICP Cluster
**Optimise :** A_message_resonance (parle leur language interne).

```
Subject: [ICP role] at [company stage/size] — quick question

Hi [First Name],

I work with [ICP role description] at [company type/stage]. The 
problem I hear most often: [specific problem in their language, not 
yours].

Most try to fix it with [common workaround]. It works until [specific 
failure point].

We do it differently: [one sentence, mechanism not features].

[Comparable company] went from [before] to [after] in [timeframe].

15 minutes to see if it maps to what you're dealing with?

[Your name]
```

**Mecanisme :** Pattern-matches contre leur lived experience using language they would use. "Common workaround → failure point" structure triggers recognition. Sam Blond : "speaking their internal monologue."

**Performance :** 8-12% reply rate at scale (1,000+ contacts). Above industry average.

**Echec quand :** "problem in their language" est wrong pour le segment, comparable company isn't actually comparable, CTA asks pour demo plutot qu'une conversation.

#### Script 1G : Competitor Customer Targeting
**Optimise :** A_signal_relevance (tech stack research), A_message_resonance ("not saying they're wrong").

```
Subject: [Competitor name] user?

Hi [First Name],

I noticed [Company] is using [Competitor] — we see that a lot with 
[ICP type].

The thing that sends them to us is usually [specific limitation of 
competitor in that use case].

Not saying [Competitor] is wrong for you. Just curious if that's 
surfaced.

Happy to share how [similar company] made the switch — 15 minutes?

[Your name]
```

**Mecanisme :** Shows homework (job postings, G2, LinkedIn). "Not saying they're wrong" disarms defensiveness. Positions as peer conversation pas pitch.

**Performance :** 10-15% reply rate. Gong Labs : competitor references in subject lines lift open rates 15%.

**Echec quand :** wrong about tool they use, specific limitation doesn't actually affect them, competitor a strong switching costs.

### 2.4 Follow-Up #2 — New Angle / New Value

#### Script 1H : New Angle, No Guilt
**Optimise :** A_message_resonance (breaks pattern of guilt-trip follow-ups).

```
Subject: Re: [original subject] — one more thought

Hi [First Name],

Following up on my last note — not going to rehash it.

One thing I didn't mention: [specific new insight, data point, or 
customer story that's genuinely different from email 1].

[One sentence on why it's relevant to them specifically].

Still worth a quick conversation?

[Your name]
```

**Mecanisme :** Explicitly breaks pattern of guilt-trip follow-ups. Adds new information so prospect a une reason to re-engage qui n'est pas juste social obligation.

**Performance :** 5-8% incremental reply rate sur non-responders. 30MPC : follow-ups avec new information get 3x replies vs "just following up."

**Echec quand :** tu n'as pas reellement new information, references original email passive-aggressively, sent < 48h apres first.

#### Script 1I : Re-frame the Problem
**Optimise :** A_message_resonance (insight-based), A_signal_relevance (perspective shift).

```
Subject: Different way to think about [problem]

Hi [First Name],

Tried you last week — no worries if it's not the right time.

One reframe that's been useful for [ICP role]s dealing with 
[problem]: most people think about it as [common framing]. The 
teams that actually fix it think about it as [alternative framing].

That shift changes where you look for the solution — and who you 
buy from.

Happy to walk through the logic if useful.

[Your name]
```

**Mecanisme :** Josh Braun's insight-based follow-up. Pas selling harder — adding perspective que makes them think differently.

**Performance :** 6-10% reply rate. Higher quality replies — prospect often shares current thinking unprompted.

**Echec quand :** reframe isn't actually insightful (juste wordplay), pas credible enough to deliver perspective shift.

### 2.5 Follow-Up #3 — Case Study + Social Proof

#### Script 1J : Peer Company Story
**Optimise :** A_signal_relevance (peer match), A_message_resonance (failure arc credibility).

```
Subject: How [similar company] handled [problem]

Hi [First Name],

Third note — promise I have an actual reason to reach out.

[Similar Company] — [description that makes them feel like a peer: 
same size, same ICP, same stage, same GTM motion] — was dealing 
with [specific problem] about 6 months ago.

They tried [thing they tried]. Didn't work because [specific reason].

What actually moved the needle: [specific mechanism, not product 
feature].

In 90 days they went from [before metric] to [after metric].

Happy to share the full story — 15 minutes?

[Your name]
```

**Mecanisme :** Social proof from peer, pas logo — actual story avec failure arc. "Tried X, failed because Y" structure builds credibility because honest.

**Performance :** 7-12% reply rate at touch 3. Steli Efti at Close : case studies in email 3 get 40% more replies than in email 1.

**Echec quand :** "similar company" isn't actually similar, metrics are vague, ou using a big-brand logo qui makes them feel inferior.

#### Script 1K : ROI-Led
**Optimise :** A_value_mental_account (frames cost in their dollars), A_message_resonance (math invites engagement).

```
Subject: The [ICP role] math on [problem]

Hi [First Name],

Quick math that's been useful for [role]s at [company stage]:

[Problem] typically costs [ICP type]:
- [Line 1: time cost or opportunity cost]
- [Line 2: downstream revenue impact]
- [Line 3: team frustration / retention cost]

At [Company]'s scale, that's roughly [rough estimate in dollars or 
time].

We typically help recover [specific % or $] of that in [timeframe].

Worth checking the math together?

[Your name]
```

**Mecanisme :** Converts abstract pain into number. Anchors conversation on ROI plutot que features. Forces prospect to agree or correct math — both are conversations.

**Performance :** 8-13% reply rate. Kyle Coleman : ROI-framed emails get 35% higher reply rates vs feature-framed at touch 3.

### 2.6 Follow-Up #4 — Objection Preempt / Pattern Interrupt

#### Script 1L : Objection Preempt
**Optimise :** A_message_resonance (confidence + self-disqualification).

```
Subject: The thing people usually say at this point

Hi [First Name],

You've gotten 3 emails from me. The honest thing to say: I don't 
know if this is right for you.

Here's what usually comes up at this point:

"We already have [solution]" — fair. We're not [category]. We 
specifically help when [specific condition].

"Not a priority right now" — also fair. The teams that push back 
on this are usually dealing with [downstream consequence] in Q[X].

"We're too early / too small" — our smallest customer is [benchmark].

If none of those apply, I'd genuinely like to understand why it's 
not a fit. Saves us both time.

15 minutes?

[Your name]
```

**Mecanisme :** Josh Braun's objection preemption. By raising objections yourself, you demonstrate confidence et disarm standard deflection.

**Performance :** 6-10% reply rate. Higher-than-average meeting conversion from replies (self-qualified).

**Echec quand :** raises objections that don't apply, tone feels presumptuous, lists too many objections.

#### Script 1M : Pattern Interrupt — The Honest Email
**Optimise :** A_message_resonance (radical honesty inverts dynamic).

```
Subject: Honest question

Hi [First Name],

I've sent you 3 emails. You haven't responded.

One of these is true:
A. My timing is off.
B. You have no interest in [problem category].
C. My emails haven't been good enough to warrant a reply.

If it's A or B — genuinely no problem. Tell me which one and I'll 
stop.

If it's C — I'd actually appreciate knowing what I missed. I'm 
trying to get better at this.

[Your name]
```

**Mecanisme :** Radical honesty breaks salesperson-prospect dynamic. Option C inverts power dynamic — tu demandes feedback, pas meeting.

**Performance :** 10-18% reply rate (unusually high pour touch 4). 30MPC cites comme highest-performing touch 4 pattern.

**Echec quand :** "C" option comes across comme passive-aggressive fishing for compliments, ou prospect doesn't remember previous emails.

### 2.7 Break-Up Email (Touch 5-6)

#### Script 1N : The Hard Close
**Optimise :** A_buyer_kairos (loss aversion trigger).

```
Subject: Should I close your file?

Hi [First Name],

I've tried reaching you a few times about [one-line problem/solution].

I don't want to keep filling your inbox. Is it safe to assume 
[problem] isn't something you're focused on right now, and I should 
close out your file?

If there's a better time to reconnect — quarter change, after 
[known event] — just let me know and I'll reach back out then.

[Your name]
```

**Mecanisme :** Steli Efti's break-up. "Close your file" framing triggers loss aversion. Genuinely respectful — gives easy out while keeping door open.

**Performance :** 12-20% reply rate — souvent highest-reply email in sequence. Steli : break-up emails recover 15-20% of sequences gone silent.

**Echec quand :** sent break-up email earlier in sequence, "known event" you reference is wrong or too vague, sent too early (touch 3-4 trop tot).

#### Script 1O : The Value Leave-Behind
**Optimise :** A_message_resonance (give without ask = reciprocity creation).

```
Subject: Leaving this with you

Hi [First Name],

Last note from me — I don't want to overstay my welcome.

Before I go: [Genuine resource — benchmark report, calculation tool, 
teardown, framework] that's been useful for [ICP role]s dealing 
with [problem]. No strings. Just something worth having.

[Link or attachment]

If [problem] becomes a priority later, you know where to find me.

[Your name]
```

**Mecanisme :** Ends sequence with give, pas ask. Creates reciprocity et leaves positive final impression.

**Performance :** 5-8% reply rate. 25-30% "saved for later" behavior (reach out 60-120 jours plus tard unprompted). Lemlist : sequences ending avec value assets generate 3x more inbound follow-up.

### 2.8 Re-Engagement Apres Silence

#### Script 1P : Time-Gap Opener
```
Subject: It's been [X months] — still dealing with [problem]?

Hi [First Name],

We connected [X months] ago about [specific problem].

Things change fast. Just curious: is [problem] still on the radar, 
or has the priority shifted?

If it's moved up the list — we've done some work since we last 
spoke that might be relevant: [one sentence on what's new].

Happy to pick up the conversation.

[Your name]
```

**Performance :** 15-25% reply rate sur prospects qui previously showed interest. 8-12% sur fully cold re-engagement.

#### Script 1Q : Product/Company Update Re-Engagement
```
Subject: [Your company] update — relevant to [problem you discussed]

Hi [First Name],

We last connected about [problem/topic].

Since then: [specific, relevant update — new feature, new customer 
in their space, new data, new integration].

I thought of you specifically because [1-sentence direct connection 
to their situation].

Worth picking the conversation back up?

[Your name]
```

**Performance :** 18-28% reply rate sur warm re-engagement.

---

## 3. Cold Call

### 3.1 Permission-Based Opener

#### Script 2A : Jason Bay "Honest Opener"
```
[Ring. They pick up.]

"Hey [First Name], this is [Your Name] from [Company]. Did I catch 
you at a terrible time?"

[They say: "No, what's this about?"]

"I'll be honest — this is a cold call. I'll keep it to 30 seconds 
and you can tell me if it's worth your time. Deal?"

[They agree]

"[30-second pitch: I work with [ICP] who [specific problem]. We 
[one-sentence mechanism]. Before I go — is [problem] anything on 
your radar right now?"
```

**Mecanisme :** En appelant ca un cold call immediately, eliminates "gotcha" feeling. 30-second commitment lowers barrier.

**Performance :** 35-50% des prospects qui don't hang up will give 30 seconds. Connect-to-qualified-conversation rate +40% vs traditional openers (Gong Labs).

**Echec quand :** delivered robotically, used avec senior prospects qui find framing condescending, pitch exceeds promised time.

### 3.2 "Heard the Name Tossed Around" Opener (Gong Data Winner)

#### Script 2C
```
"Hey [First Name], this is [Your Name] from [Company]. How've you 
been?"

[They respond]

"Good to hear. So — I know this is out of the blue. I've actually 
had your name come up a few times recently in conversations with 
[vague peer descriptor — 'other sales leaders at growth-stage SaaS 
companies']. Figured it was worth reaching out directly."

[Brief pause]

"We work with [ICP] on [problem]. Is that anything you're dealing 
with right now?"
```

**Performance :** 10.1% cold call meeting rate (Gong Labs benchmark pour top performers) vs 1-3% average. **Le winner statistical de Gong sur 90,000+ calls.**

### 3.3 Founder-to-Founder Opener

#### Script 2D
```
"Hey [First Name], [Your Name] here — I'm the founder of [Company]. 
I'll be quick.

I build [what you build] for founders doing [specific motion]. I 
called because [specific reason tied to something about them — 
their stage, funding, something they posted].

I'm not trying to sell you anything on this call. I'm genuinely 
curious if [specific problem] is something you've figured out or 
still dealing with.

What's the honest answer?"
```

**Mecanisme :** Founder-to-founder calls carry different social weight. "Not trying to sell you anything" est Sam Blond's pattern — removes defensive posture.

**Performance :** 20-30% better conversion qu'SDR calls quand founder a genuine market credibility. **Works almost exclusively for early-stage (0-30 customers).** Doesn't scale.

### 3.4 Objection Handling

#### Script 2E : "Not Interested"
```
Them: "Not interested."

You: "Totally fair — can I ask, is it not interesting because the 
timing is off, or because it genuinely doesn't apply to what 
you're dealing with?"

[Pause]

[If timing]: "Got it. What would make it the right time — is there 
a trigger I should look for?"

[If doesn't apply]: "What is the [problem] you're actually focused 
on right now?"
```

**Performance :** 20-30% des "not interested" sont actually timing objections. Recovering even fraction significantly increases qualified pipeline per dial.

#### Script 2F : "Send Me an Email"
```
Them: "Just send me an email."

You: "Happy to. Before I do — two quick questions so it's worth 
your time to open: [Question 1 — most relevant qualifying question]. 
And [Question 2]. That way I can make it actually useful instead 
of generic."
```

**Performance :** Converts 30-40% des "send an email" deflections en qualified email opens (30MPC).

#### Script 2G : "We Use [Competitor]"
```
Them: "We already use [Competitor]."

You: "Makes sense — they're solid. A lot of the teams I work with 
came from [Competitor]. Can I ask — are you using them for 
[specific use case A] or more for [specific use case B]?"

[Listen]

"Got it. The reason I ask — where we're different is specifically 
in [use case they mentioned]. Not trying to replace [Competitor] — 
but there's a specific gap [similar company] found that's worth 
knowing about. Worth 10 minutes?"
```

**Performance :** 15-20% conversion sur cette objection en conversation.

#### Script 2H : "No Budget"
```
Them: "We don't have budget for this."

You: "I hear that a lot — usually it means one of two things: 
either it's genuinely not in the plan, or it's not in the plan 
yet. Which is it for you?"

[If genuinely not in plan]: "When does your budget cycle open? 
Worth keeping in touch so you're not starting from scratch when 
it does."

[If not yet budgeted]: "What would need to be true for you to 
make a case for this internally? I'd rather help you build the 
business case than pitch you something you can't buy."
```

**Performance :** 25-35% des "no budget" objections reveal it's prioritization issue, pas real constraint.

#### Script 2I : "Bad Time / Call Back Later"
```
Them: "This is a really bad time."

You: "Completely understand. Quick question before I let you go — 
is it a bad time right now today, or is there a broader thing 
going on that makes this month a bad time?"

[If just today]: "What's a better time this week or next? I'll 
put it in the calendar now."

[If broader thing]: "What's the trigger that would make this 
conversation worth having — quarter close, budget cycle? I'll 
set a reminder and come back then."
```

**Performance :** Specific callback commitments convert at 40-60%. Vague "call me next month" converts at < 10%.

### 3.5 Voicemail 15-Second

#### Script 2J : Curiosity-Based
```
"Hey [First Name], [Your Name] from [Company]. Quick voicemail — I 
was reaching out because [one specific reason tied to their 
situation or a signal]. Curious if [one-sentence question that's 
genuinely interesting to them]. My number is [number]. [Your Name] 
from [Company]."

[Total: 12-15 seconds]
```

**Mecanisme :** Leave question, pas pitch. Voicemails qui ask question they want to answer get 3x more callbacks que product-description voicemails (Gong Labs).

**Performance :** 4-8% callback rate vs 1-2% pour product-description voicemails.

#### Script 2K : Pattern Interrupt
```
"Hey [First Name], [Your Name] — [Company]. This is a cold call 
voicemail, which means you're probably going to delete this. 
Before you do: [one-sentence insight or question that's genuinely 
relevant]. That's it. [Number]. [Your Name]."
```

**Performance :** 6-10% callback rate quand insight is sharp.

---

## 4. LinkedIn

### 4.1 Connection Request

#### Script 3A : Signal-Based, No Pitch
```
[First Name] — saw your post about [specific topic]. [One-sentence 
genuine reaction]. Would be good to connect.

[118 characters]
```

**Performance :** 35-50% acceptance rate vs 10-20% pour generic requests (Kyle Coleman benchmark).

**Echec quand :** post reference vague ("great content!"), tu n'as pas read content, you add any form of pitch.

#### Script 3B : Shared Context
```
[First Name] — we were both at [Event] / both in [Group] / both 
connected to [Mutual]. Figured worth connecting.

[Under 130 characters]
```

**Performance :** 40-55% acceptance quand context accurate et recent. Falls to 15-20% quand context old or tangential.

#### Script 3C : Role/Company Trigger
```
[First Name] — just saw you joined [Company] as [Role]. Congrats. 
Would be good to have you in my network — a lot of [ICP peers] in 
here.

[Under 150 characters]
```

**Performance :** 30-45% acceptance. Strongest dans first 30 jours apres role change.

### 4.2 Post-Connection First DM

#### Script 3D : Curiosity, No Ask (Xenia Pattern)
```
[First Name] — thanks for connecting.

I noticed [specific thing from their profile, post, or company] and 
had a genuine question: [specific, open-ended question that's 
interesting to them — not a qualifying question for you].

No agenda — just something I've been thinking about in [their space].
```

**Mecanisme :** First message est genuine question, no CTA, no soft pitch. Goal est de start conversation about leur world, pas to qualify them.

**Performance :** 25-40% reply rate sur first DM vs 5-10% pour pitch DMs. Eventual conversion to pipeline est 2-3x higher (30MPC LinkedIn data).

#### Script 3E : Value First, No Ask
```
[First Name] — glad to be connected.

Saw you're working on [problem area]. We published something 
relevant last week: [link to genuinely useful content — benchmark, 
framework, teardown].

Worth 5 minutes if [problem] is on your radar. No reply needed.
```

**Performance :** 15-25% reply rate. 35-50% click rate sur le resource.

### 4.3 Comment That Opens Dialogue

#### Script 3F : Respectful Disagreement
```
Interesting take. I've seen the opposite in [specific context] — 
[1-2 sentences on your counterpoint]. Curious if you're seeing 
[question that invites their perspective].
```

**Performance :** 30-50% reply rate from post author. High visibility via LinkedIn algorithm.

#### Script 3G : Specific Additive Insight
```
This. Especially [specific point from their post]. One thing I'd 
add from what I've seen with [specific cohort]: [1-2 sentence 
insight that's genuinely additive]. Does [question about their 
experience] factor into your thinking here?
```

**Performance :** 25-40% reply rate from post author.

---

## 5. Discovery / Demo

### 5.1 Pre-Meeting Qualification Email (24h avant)

#### Script 4A
```
Subject: [First Name] — quick prep for tomorrow

Hi [First Name],

Looking forward to our call tomorrow at [time].

To make sure the 30 minutes is worth your time:

1. What I'll cover: "I'll focus on [specific use case] vs. a 
   product walkthrough. If there's another area you'd rather 
   explore, let me know."

2. Honest expectation: "We're not the right fit if [clear 
   disqualifier]. I'd rather know upfront."

3. One prep question: "If you can have a rough answer to [one 
   qualifying question] — it'll make the conversation much more 
   useful."

See you tomorrow.

[Your name]
```

**Performance :** 15-20% reduction in no-shows. 25-30% improvement in discovery call quality. Steli Efti : one of the highest-ROI emails in a sales sequence.

### 5.2 Discovery Opener

#### Script 4B : Set the Frame Before the Questions
```
"Before we dive in — let me tell you what I'm hoping to get out of 
this call, and you can tell me if that's right for you.

My goal is to understand whether what we do actually maps to what 
you're dealing with. Not to pitch you. If it doesn't map — I'll 
tell you that.

Does that work?

[Yes]

Great. [Name], walk me back to where this [problem/initiative] 
started. What triggered the conversation internally?"
```

**Mecanisme :** Explicit framing removes "this is a pitch, defenses up" posture. Open-ended "walk me back" gets origin story, where real pain et urgency live.

**Performance :** Calls where reps set agenda upfront outperform those that don't by 36% (Gong Labs).

#### Script 4C : The Pain-First Discovery
```
"[Name] — before I ask you a bunch of questions, can I share what 
brought you to the call based on what I know, and you tell me if 
I have it right?

[State what you know about their situation based on research]

How close is that?

[They correct or confirm]

Tell me more about the [piece they corrected or confirmed]. 
Specifically — what does it cost you when that goes wrong?"
```

**Performance :** Significantly higher quality discovery data. Prospects who feel understood share 40% more information dans same call time (Gong Labs).

### 5.3 Demo Opener

#### Script 4D : Set Agenda, Get Buy-In
```
"Before I show you anything — I want to make sure we cover what 
matters to you, not what I normally show.

Based on our last call, you mentioned [3 specific things]:
1. [Problem/goal 1]
2. [Problem/goal 2]
3. [Question they raised]

I'll orient the demo around those. At the end, I want to hear your 
honest take — whether it solves those or doesn't.

Does that sound right? Anything you'd add or change?"
```

**Performance :** Demo-to-next-step conversion increases 20-30% quand demo est anchored to pre-stated priorities (Gong Labs).

### 5.4 Demo Close + Next Steps

#### Script 4E : The Specific Next Step Close
```
"Based on what you saw today — what's your reaction?" 
[Pause and listen without filling the silence]

[Positive reaction]

"Good. What I typically suggest as a next step is [specific 
option — not open-ended]:
Option A: narrow-scope pilot with specific success criteria
Option B: technical eval with [specific person]
Option C: bring in [stakeholder] for a second conversation

Which of those makes sense given where you are internally?

[They choose or redirect]

Let's put a specific date on it now — [day/time]. What works for 
you?"
```

**Mecanisme :** Steli Efti's next-step framework. Never leave demo sans specific committed next step.

**Performance :** Demo-to-opportunity conversion increases 2-3x quand specific next step est agreed sur le call. Steli's data : deals avec defined next steps a chaque stage close at 2.4x rate of deals without.

---

## 6. Closing

### 6.1 Mutual Action Plan Email

#### Script 5A
```
Subject: [Company A] + [Company B] — close plan

Hi [First Name],

Following up on our conversation — I wanted to put together a 
shared view of what it takes to get from here to a decision.

CLOSE PLAN — [Your Company] + [Their Company]

Goal: [Outcome they stated in discovery — their language, not yours]
Decision date: [Date agreed]
Decision makers: [Names + roles confirmed]

Steps:
Week 1: [Technical review with [Name], security questionnaire]
Week 2: [Reference call with [customer name]]
Week 3: [Commercial review with [CFO/VP Finance]]
Week 4: [Contract execution / go-live planning]

On our side, I'll handle: [Your commitments]
On your side, we'll need: [Their commitments]

Let me know if any of this is off — I'd rather adjust the plan 
than have it be a surprise on either end.

[Your name]
```

**Mecanisme :** Sam Blond's mutual close plan (Brex). Collaborative document forces both sides to commit to timeline. Surfaces hidden stakeholders avant qu'ils ne blow up the deal.

**Performance :** Deals avec mutual action plan close 25-35% faster (Sam Blond, public interviews).

### 6.2 Verbal-Yes Follow-Up

#### Script 5B : Verbal Yes to Contract
```
Subject: Great call — next steps to make it official

Hi [First Name],

Really good conversation today. Here's where we landed:

Decision: Move forward with [specific package/scope]
Start date: [Date]
Contract: Sending via [DocuSign/PandaDoc] in the next [2 hours / 
by EOD]

Two things I need from you:
1. Billing contact: [name/email]
2. Legal entity name for the contract: [Company legal name]

I'll hold [onboarding slot] for you — [date/time] with [name].

Looking forward to getting started.

[Your name]
```

**Performance :** Verbal-yes to signature within 24h closes at 70-80%. Sans same-day contract drops to 40-50% within 7 jours. Each day of delay reduces close probability by ~8% (Steli Efti).

### 6.3 "Closing the File" / Break-Up

#### Script 5C : Deal Break-Up Email
```
Subject: Closing [Company] + [Their Company] opportunity

Hi [First Name],

I haven't heard back since [last touchpoint]. I don't want to 
keep pinging you, so I'm going to close out this opportunity on 
our end.

If timing was the issue — I'm happy to revisit in [Q3 / after 
[event]].

If the deal isn't going forward, I'd genuinely appreciate knowing 
why. Not to re-open it — just to learn.

Either way, no hard feelings.

[Your name]
```

**Performance :** 20-30% response rate apres silence. 10-15% des responses result in re-opened deals.

#### Script 5D : The "Honest Conversation" Close (Verbal)
```
"[Name], I want to be direct.

We've been talking for [X weeks]. I think there's a real fit here. 
But I get the sense something's holding this up.

Is it something I haven't addressed? Or something internally that 
makes this hard to move forward right now?

I'd rather have that conversation than keep doing the follow-up 
dance."
```

**Performance :** Surfaces real objection in 40-60% of stalled deals. Conversion from "real objection surfaced" to closed : 30-40% (Kyle Coleman).

### 6.4 Renewal Conversation Opener

#### Script 5E : 90 Days Out Renewal
```
Subject: [Company] + [Your Company] — 90-day conversation

Hi [First Name],

Your renewal is coming up in [month] — 90 days out. I want to get 
ahead of it rather than have it be a surprise.

Before we talk numbers, I want to make sure we've earned it. Three 
things I want to cover:

1. What's working well and what we should double down on
2. Anything that hasn't delivered what you expected
3. What's changed in your business that affects how you use [product]

I'd rather hear the hard stuff now than at renewal time.

Can we get 30 minutes on the calendar before [date]? I'll come 
with data on your usage and outcomes on our side.

[Your name]
```

**Performance :** Proactive renewal conversations 90 jours out convert at 2-3x rate of reactive 30-day conversations (Gainsight). 80-90% renewal rate sur proactively managed accounts vs 60-70% reactive.

### 6.5 Referral Request Post-Value

#### Script 5G : Specific Referral Ask
```
Subject: Quick ask — one name

Hi [First Name],

Really happy with how [specific milestone or outcome] came together.

I have one ask: is there one person at [peer company type] — not 
a dozen, just one — who you think would get value from a 
conversation like the one we had?

You don't have to intro us if you'd rather not. Even just a name 
is helpful.

[Your name]
```

**Performance :** 30-40% response rate quand asked at specific value moment. Referred leads close at 3-5x rate of cold outreach (Sam Blond). Convert to meetings at 60-70% vs cold at 3-8%.

#### Script 5H : Warm Introduction Request
```
Subject: [First Name], intro to [Specific Name at Company]?

Hi [First Name],

I saw you're connected to [Specific Person] at [Company]. I've 
been trying to reach them about [1-sentence reason that's relevant 
to them, not just your pipeline].

Would you be comfortable making a quick intro? Happy to draft the 
note if it makes it easier — just say the word.

[Your name]
```

**Performance :** 40-60% des specific intro requests are fulfilled vs 5-10% of generic "who do you know" requests. Referred intros convert to meetings at 60-80%.

---

## 7. Tableau de performance synthetique

| Script | Channel | Touch | Performance attendue |
|---|---|---|---|
| Signal-triggered cold email | Email | 1 | 12-18% reply |
| Hyper-personalized 1:1 | Email | 1 | 25-40% reply |
| Broader cold (ICP cluster) | Email | 1 | 8-12% reply |
| Competitor targeting | Email | 1 | 10-15% reply |
| Follow-up, new angle | Email | 2 | 5-8% reply |
| Follow-up, re-frame | Email | 2 | 6-10% reply |
| Follow-up, peer story | Email | 3 | 7-12% reply |
| Follow-up, ROI math | Email | 3 | 8-13% reply |
| Objection preempt | Email | 4 | 6-10% reply |
| Pattern interrupt (honest) | Email | 4 | **10-18% reply** |
| Break-up (close file) | Email | 5-6 | **12-20% reply** |
| Value leave-behind | Email | 5-6 | 5-8% + 25-30% later inbound |
| Re-engagement (time gap) | Email | Re-eng | 15-25% reply |
| Permission-based opener | Call | 1 | 35-50% listen |
| "Heard name tossed around" | Call | 1 | **~10% meeting rate** |
| Founder-to-founder | Call | 1 | 20-30% above SDR baseline |
| Curiosity voicemail | VM | - | 4-8% callback |
| Pattern interrupt voicemail | VM | - | 6-10% callback |
| Connection request (signal) | LinkedIn | 1 | 35-50% accept |
| Post-connection DM (xenia) | LinkedIn | 2 | 25-40% reply |
| Pre-meeting qual email | Email | Pre-demo | -15-20% no-shows |
| Mutual action plan | Email | Close | -25-35% time to close |
| Verbal-yes to contract | Email | Close | **70-80% close (same day)** |
| Referral ask (post-value) | Email | Post-sale | 30-40% response |

---

## 8. Sequencing guide

**Recommended spacing (30MPC) :**

- Day 1 : Email
- Day 3 : Call + voicemail
- Day 5 : LinkedIn connection request
- Day 7 : Email (new angle)
- Day 10 : Call (no voicemail)
- Day 14 : Email (case study)
- Day 21 : LinkedIn DM (post-connection)
- Day 28 : Email (objection preempt or pattern interrupt)
- Day 35 : Break-up email

**Regles non-negociables :**
- Never send break-up before touch 5
- Follow-up always adds new information — never "just bumping this"
- One variable at a time in A/B tests (subject, opener, or CTA — pas all three)
- Personalization floor : signal-triggered needs one verifiable signal + one inference minimum
- Verbal yes → contract same day, no exceptions

---

## 9. Application philosophique

### 9.1 Phronesis vs Episteme

Ces scripts sont l'episteme — patterns documentes qui marchent. **La phronesis du founder** est : choisir le BON script pour CE prospect a CE moment, et personnaliser les details specifiques. Un script copie-colle a 0% de personalisation underperformera un mauvais script bien personnalise.

Le produit Elevay surface les scripts pertinents (suggestion). Le founder personnalise et envoie (decision).

### 9.2 Theoreme GTM applique

Chaque script optimise un Aᵢ specifique. Quand un founder voit son funnel underperform :
- A_buyer_kairos low → utiliser scripts 1A/1B (signal-triggered)
- A_message_resonance low → 1L/1M (objection preempt, honest)
- A_signal_relevance low → 1D/1E (deep research, LinkedIn referenced)
- A_channel_trust low → switch channel (LinkedIn 3D-3E si email saturated)
- A_value_mental_account low → Script 1K (ROI-led) pour reframe

Le diagnostic surgical (Morceau 01) identifie le bottleneck Aᵢ. La script library (Morceau 06) propose le script optimise pour ce vecteur.

### 9.3 Polytropos

Aucun script ne marche pour tous les verticals/personas. Devtools rejette les "AI-powered" quoi que. RevOps rejette les "transform your sales process." DTC rejette les corporate B2B language. **Les scripts sont des templates structurels** — le founder swap les tokens specifiques au vertical (cf. Morceau 03).

### 9.4 Kleos

Quand un founder envoie un script signal-triggered (1A) qui produit 18% reply rate, il experiences directly que le script marche. Ses peers le voient closer des deals. **Les scripts deviennent kleos** — ils sont portees par les voix des founders qui les utilisent. Pas par marketing.

---

## 10. Sources & confidence

**Confidence :**
- Performance numbers : **moyenne-haute** — sourced de practitioners + plateformes mais varient par segment
- Mecanismes : **haute** — fondes sur recherches Gong/Lavender + practitioners verifiables
- Conditions d'echec : **haute** — observations cumulees pratitioners

**Sources primaires :**
- 30 Minutes to President's Club (Nick Cegelski / Armand Farrokh)
- Jason Bay (Outbound Squad)
- Josh Braun (Braun Training)
- Lemlist email benchmark reports 2023-2024
- Sam Blond (Brex/Front, public interviews)
- Steli Efti (Close)
- Kyle Coleman (Looker, Clari, Copy.ai, ClickUp)
- Gong Labs published research (300M+ calls, 85M+ emails)
- Gainsight customer success benchmarks
