import { registerSkill } from "./registry";

// Enrichment
import { tamBuilderSkill } from "./enrichment/tam-builder";
import { apolloLeadFinderSkill } from "./enrichment/apollo-lead-finder";
import { companyContactFinderSkill } from "./enrichment/company-contact-finder";
import { inboundLeadEnrichmentSkill } from "./enrichment/inbound-lead-enrichment";

// Outreach
import { coldEmailOutreachSkill } from "./outreach/cold-email-outreach";
import { emailDraftingSkill } from "./outreach/email-drafting";
import { leadershipChangeOutreachSkill } from "./outreach/leadership-change-outreach";

// Scoring
import { leadQualificationSkill } from "./scoring/lead-qualification";
import { icpIdentificationSkill } from "./scoring/icp-identification";
import { inboundLeadQualificationSkill } from "./scoring/inbound-lead-qualification";

// Signals
import { signalScannerSkill } from "./signals/signal-scanner";
import { contactCacheSkill } from "./signals/contact-cache";
import { championTrackerSkill } from "./signals/champion-tracker";
import { jobPostingIntentSkill } from "./signals/job-posting-intent";
import { fundingSignalMonitorSkill } from "./signals/funding-signal-monitor";
import { expansionSignalSpotterSkill } from "./signals/expansion-signal-spotter";
import { investorOverlapSkill } from "./signals/investor-overlap";

// Intelligence
import { meetingBriefSkill } from "./intelligence/meeting-brief";
import { pipelineReviewSkill } from "./intelligence/pipeline-review";
import { sequencePerformanceSkill } from "./intelligence/sequence-performance";
import { salesCoachingSkill } from "./intelligence/sales-coaching";
import { salesCallPrepSkill } from "./intelligence/sales-call-prep";
import { battlecardGeneratorSkill } from "./intelligence/battlecard-generator";
import { competitorIntelSkill } from "./intelligence/competitor-intel";
import { churnRiskDetectorSkill } from "./intelligence/churn-risk-detector";
import { scopePocSkill } from "./intelligence/scope-poc";
import { draftProposalSkill } from "./intelligence/draft-proposal";
import { handleObjectionSkill } from "./intelligence/handle-objection";
import { reEngageStalledSkill } from "./intelligence/re-engage-stalled";
import { proposalTemplateDetectSkill } from "./intelligence/proposal-template-detect";
import { proposalFillSkill } from "./intelligence/proposal-fill";

export function registerAllSkills() {
  registerSkill(tamBuilderSkill);
  registerSkill(apolloLeadFinderSkill);
  registerSkill(companyContactFinderSkill);
  registerSkill(inboundLeadEnrichmentSkill);
  registerSkill(coldEmailOutreachSkill);
  registerSkill(emailDraftingSkill);
  registerSkill(leadQualificationSkill);
  registerSkill(icpIdentificationSkill);
  registerSkill(inboundLeadQualificationSkill);
  registerSkill(signalScannerSkill);
  registerSkill(contactCacheSkill);
  registerSkill(meetingBriefSkill);
  registerSkill(pipelineReviewSkill);
  registerSkill(sequencePerformanceSkill);
  registerSkill(salesCoachingSkill);
  registerSkill(salesCallPrepSkill);
  registerSkill(battlecardGeneratorSkill);
  registerSkill(competitorIntelSkill);
  registerSkill(churnRiskDetectorSkill);
  registerSkill(championTrackerSkill);
  registerSkill(jobPostingIntentSkill);
  registerSkill(fundingSignalMonitorSkill);
  registerSkill(leadershipChangeOutreachSkill);
  registerSkill(expansionSignalSpotterSkill);
  registerSkill(investorOverlapSkill);
  registerSkill(scopePocSkill);
  registerSkill(draftProposalSkill);
  registerSkill(handleObjectionSkill);
  registerSkill(reEngageStalledSkill);
  registerSkill(proposalTemplateDetectSkill);
  registerSkill(proposalFillSkill);
}
