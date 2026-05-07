// ---------------------------------------------------------------------------
// vertical-eval-cases.ts
// 40 realistic prospect evaluation cases across 4 verticals.
// All companies and people are fictional.
// ---------------------------------------------------------------------------

export interface VerticalEvalCase {
  id: string;
  vertical: "saas" | "fintech" | "devtools" | "services";
  contact: {
    fullName: string;
    title: string;
    seniority: string; // c_suite, vp, director, manager, senior
    email: string;
  };
  company: {
    name: string;
    domain: string;
    industry: string;
    size: string; // "11-50", "51-200", etc.
    description: string;
    fundingStage?: string;
    totalRaised?: string;
  };
  signals: Array<{
    type:
      | "funding"
      | "hiring"
      | "leadership_change"
      | "tech_change"
      | "expansion"
      | "news";
    title: string;
    description: string;
    relevance: "high" | "medium" | "low";
  }>;
  dealContext?: {
    stage: string;
    value: number;
    daysSinceActivity: number;
  };
  expectations: {
    emailShouldReference: string[];
    briefShouldInclude: string[];
    industrySpecificLanguage: string[];
  };
}

// ── SaaS B2B (saas-001 → saas-010) ─────────────────────────────────────────

const saasCases: VerticalEvalCase[] = [
  {
    id: "saas-001",
    vertical: "saas",
    contact: {
      fullName: "Nadia Okafor",
      title: "CEO & Co-founder",
      seniority: "c_suite",
      email: "nadia@clarityhq.io",
    },
    company: {
      name: "ClarityHQ",
      domain: "clarityhq.io",
      industry: "Customer Success Software",
      size: "11-50",
      description:
        "ClarityHQ provides customer health scoring and churn prediction for mid-market SaaS companies. The platform integrates with CRMs and support tools to surface at-risk accounts before renewal.",
      fundingStage: "Seed",
      totalRaised: "$3.2M",
    },
    signals: [
      {
        type: "funding",
        title: "Seed round closed",
        description:
          "ClarityHQ closed a $3.2M seed round led by Gradient Ventures with participation from two angel investors.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "First sales hire posted",
        description:
          "Job listing for Head of Sales appeared on LinkedIn, indicating move from founder-led sales to a dedicated team.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "seed round",
        "first sales hire",
        "founder-led sales transition",
      ],
      briefShouldInclude: [
        "company overview",
        "funding context",
        "go-to-market stage",
        "competitive landscape",
      ],
      industrySpecificLanguage: [
        "churn prediction",
        "customer health score",
        "NRR",
        "expansion revenue",
      ],
    },
  },
  {
    id: "saas-002",
    vertical: "saas",
    contact: {
      fullName: "Derek Hollis",
      title: "VP of Sales",
      seniority: "vp",
      email: "derek.hollis@formspark.com",
    },
    company: {
      name: "FormSpark",
      domain: "formspark.com",
      industry: "Form & Survey Software",
      size: "51-200",
      description:
        "FormSpark builds embeddable form and survey infrastructure for SaaS products. Customers use their SDK to add data collection flows without building from scratch.",
      fundingStage: "Series A",
      totalRaised: "$12M",
    },
    signals: [
      {
        type: "hiring",
        title: "Scaling SDR team",
        description:
          "Four new SDR roles posted in the last two weeks across US and EMEA time zones.",
        relevance: "high",
      },
      {
        type: "tech_change",
        title: "Migrated CRM to HubSpot",
        description:
          "Technographic data shows FormSpark recently moved from Pipedrive to HubSpot Sales Hub.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Discovery",
      value: 18000,
      daysSinceActivity: 4,
    },
    expectations: {
      emailShouldReference: [
        "SDR team expansion",
        "HubSpot migration",
        "outbound scaling",
      ],
      briefShouldInclude: [
        "current CRM stack",
        "SDR hiring velocity",
        "deal stage context",
        "pain points with scaling outbound",
      ],
      industrySpecificLanguage: [
        "SDR",
        "pipeline coverage",
        "sequences",
        "outbound cadence",
      ],
    },
  },
  {
    id: "saas-003",
    vertical: "saas",
    contact: {
      fullName: "Lena Petrova",
      title: "Head of Growth",
      seniority: "director",
      email: "lena@routestack.io",
    },
    company: {
      name: "RouteStack",
      domain: "routestack.io",
      industry: "Logistics SaaS",
      size: "51-200",
      description:
        "RouteStack provides route optimization and fleet management software for regional delivery companies. The platform handles dispatch, driver tracking, and proof-of-delivery workflows.",
      fundingStage: "Series B",
      totalRaised: "$28M",
    },
    signals: [
      {
        type: "expansion",
        title: "Opened EMEA office",
        description:
          "RouteStack announced a new London office and plans to expand into UK and Western European markets.",
        relevance: "high",
      },
      {
        type: "leadership_change",
        title: "New CRO joined",
        description:
          "Former Samsara executive joined as CRO to lead international go-to-market.",
        relevance: "high",
      },
      {
        type: "news",
        title: "Partnership with logistics provider",
        description:
          "Announced integration partnership with a mid-market 3PL provider operating in 12 European countries.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "EMEA expansion",
        "new CRO",
        "international GTM",
      ],
      briefShouldInclude: [
        "international expansion plan",
        "leadership changes",
        "competitive landscape in logistics SaaS",
        "EMEA go-to-market considerations",
      ],
      industrySpecificLanguage: [
        "route optimization",
        "fleet management",
        "last-mile delivery",
        "3PL",
      ],
    },
  },
  {
    id: "saas-004",
    vertical: "saas",
    contact: {
      fullName: "Marcus Webb",
      title: "Revenue Operations Manager",
      seniority: "manager",
      email: "marcus.webb@pulseboard.io",
    },
    company: {
      name: "PulseBoard",
      domain: "pulseboard.io",
      industry: "Revenue Intelligence",
      size: "201-500",
      description:
        "PulseBoard aggregates revenue data from CRM, billing, and product usage into a single dashboard for SaaS finance and RevOps teams. The platform calculates key SaaS metrics automatically.",
      fundingStage: "Series B",
      totalRaised: "$42M",
    },
    signals: [
      {
        type: "tech_change",
        title: "Evaluating sales engagement tools",
        description:
          "G2 intent data shows PulseBoard researching sales engagement and outbound automation platforms.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "sales engagement evaluation",
        "RevOps alignment",
        "data-driven outbound",
      ],
      briefShouldInclude: [
        "current tech stack",
        "RevOps maturity",
        "intent signal details",
      ],
      industrySpecificLanguage: [
        "RevOps",
        "ARR",
        "pipeline velocity",
        "win rate",
        "sales engagement",
      ],
    },
  },
  {
    id: "saas-005",
    vertical: "saas",
    contact: {
      fullName: "Angela Tran",
      title: "Senior Account Executive",
      seniority: "senior",
      email: "angela.tran@notebird.co",
    },
    company: {
      name: "NoteBird",
      domain: "notebird.co",
      industry: "Meeting Productivity",
      size: "11-50",
      description:
        "NoteBird records, transcribes, and summarizes sales meetings. The product generates follow-up action items and syncs notes to CRM deal records automatically.",
      fundingStage: "Pre-seed",
      totalRaised: "$800K",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "meeting transcription",
        "CRM sync",
        "early-stage growth",
      ],
      briefShouldInclude: [
        "company overview",
        "competitive landscape",
        "early-stage considerations",
      ],
      industrySpecificLanguage: [
        "call recording",
        "conversation intelligence",
        "deal intelligence",
        "CRM hygiene",
      ],
    },
  },
  {
    id: "saas-006",
    vertical: "saas",
    contact: {
      fullName: "Jordan Meier",
      title: "CTO",
      seniority: "c_suite",
      email: "jordan@canvasflow.dev",
    },
    company: {
      name: "CanvasFlow",
      domain: "canvasflow.dev",
      industry: "Design Collaboration",
      size: "51-200",
      description:
        "CanvasFlow offers a browser-based design tool for product teams to create UI mockups, prototypes, and design systems collaboratively. Positioned as a lighter alternative to Figma for non-designers.",
      fundingStage: "Series A",
      totalRaised: "$15M",
    },
    signals: [
      {
        type: "funding",
        title: "Series A announced",
        description:
          "CanvasFlow raised $15M Series A led by Acme Capital to expand product-led growth motion and launch self-serve tier.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "First GTM hires",
        description:
          "Posting for VP Marketing and two Growth Engineers, suggesting a shift from organic to structured GTM.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Proposal",
      value: 24000,
      daysSinceActivity: 12,
    },
    expectations: {
      emailShouldReference: [
        "Series A",
        "product-led growth",
        "GTM hiring",
      ],
      briefShouldInclude: [
        "funding context",
        "PLG motion",
        "deal stage and stall risk",
        "technical buyer considerations",
      ],
      industrySpecificLanguage: [
        "PLG",
        "self-serve",
        "activation",
        "product-qualified lead",
        "design system",
      ],
    },
  },
  {
    id: "saas-007",
    vertical: "saas",
    contact: {
      fullName: "Rachel Dominguez",
      title: "Director of Partnerships",
      seniority: "director",
      email: "rachel.d@integranow.com",
    },
    company: {
      name: "IntegraNow",
      domain: "integranow.com",
      industry: "Integration Platform",
      size: "201-500",
      description:
        "IntegraNow provides embedded integration infrastructure that lets SaaS companies offer native integrations to their customers without building connectors from scratch. Serves mid-market ISVs.",
      fundingStage: "Series C",
      totalRaised: "$78M",
    },
    signals: [
      {
        type: "expansion",
        title: "Launched marketplace",
        description:
          "IntegraNow launched a public connector marketplace, opening distribution beyond direct sales.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "connector marketplace",
        "partnership opportunities",
        "embedded integrations",
      ],
      briefShouldInclude: [
        "partnership model",
        "marketplace strategy",
        "ISV ecosystem",
      ],
      industrySpecificLanguage: [
        "embedded iPaaS",
        "connector",
        "ISV",
        "integration marketplace",
        "API",
      ],
    },
  },
  {
    id: "saas-008",
    vertical: "saas",
    contact: {
      fullName: "Samuel Achebe",
      title: "VP of Marketing",
      seniority: "vp",
      email: "samuel@metricpath.io",
    },
    company: {
      name: "MetricPath",
      domain: "metricpath.io",
      industry: "Marketing Attribution",
      size: "51-200",
      description:
        "MetricPath is a multi-touch attribution platform for B2B marketers. It tracks the impact of content, ads, and events on pipeline by combining CRM and ad platform data.",
      fundingStage: "Series A",
      totalRaised: "$9.5M",
    },
    signals: [
      {
        type: "news",
        title: "Published attribution benchmark report",
        description:
          "MetricPath released a public industry report on B2B attribution showing benchmarks across 200+ companies.",
        relevance: "low",
      },
      {
        type: "hiring",
        title: "Hiring demand gen manager",
        description:
          "New demand gen role posted, indicating investment in their own pipeline generation.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "attribution benchmarks",
        "demand gen investment",
        "pipeline visibility",
      ],
      briefShouldInclude: [
        "marketing maturity",
        "attribution approach",
        "competitive landscape",
      ],
      industrySpecificLanguage: [
        "multi-touch attribution",
        "demand gen",
        "pipeline influence",
        "marketing-sourced pipeline",
      ],
    },
  },
  {
    id: "saas-009",
    vertical: "saas",
    contact: {
      fullName: "Kim Takahashi",
      title: "Founder & CEO",
      seniority: "c_suite",
      email: "kim@deskpilot.app",
    },
    company: {
      name: "DeskPilot",
      domain: "deskpilot.app",
      industry: "IT Service Management",
      size: "11-50",
      description:
        "DeskPilot is a modern ITSM tool for lean IT teams. It handles ticketing, asset tracking, and change management with a focus on fast setup and minimal configuration.",
      fundingStage: "Seed",
      totalRaised: "$2.1M",
    },
    signals: [
      {
        type: "funding",
        title: "Seed round closed",
        description:
          "Closed a $2.1M seed round and announced plans to hire first go-to-market team members.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "seed funding",
        "founder-led sales",
        "GTM team building",
      ],
      briefShouldInclude: [
        "stage of company",
        "founder context",
        "GTM readiness",
      ],
      industrySpecificLanguage: [
        "ITSM",
        "ticketing",
        "change management",
        "IT operations",
      ],
    },
  },
  {
    id: "saas-010",
    vertical: "saas",
    contact: {
      fullName: "Priya Bhandari",
      title: "Head of Sales",
      seniority: "director",
      email: "priya@clearcontract.io",
    },
    company: {
      name: "ClearContract",
      domain: "clearcontract.io",
      industry: "Contract Management",
      size: "51-200",
      description:
        "ClearContract automates contract creation, review, and renewal tracking for legal and procurement teams. Integrates with e-signature providers and ERP systems.",
      fundingStage: "Series A",
      totalRaised: "$11M",
    },
    signals: [
      {
        type: "leadership_change",
        title: "New VP Sales hired",
        description:
          "ClearContract hired a new VP Sales from DocuSign to lead enterprise expansion.",
        relevance: "high",
      },
      {
        type: "expansion",
        title: "Enterprise tier launched",
        description:
          "Announced a new enterprise pricing tier with SOC 2 compliance and SSO, targeting companies over 500 employees.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "enterprise expansion",
        "new VP Sales",
        "upmarket move",
      ],
      briefShouldInclude: [
        "go-to-market shift",
        "enterprise readiness",
        "competitive positioning vs DocuSign/Ironclad",
      ],
      industrySpecificLanguage: [
        "CLM",
        "contract lifecycle",
        "e-signature",
        "procurement",
        "SOC 2",
      ],
    },
  },
];

// ── Fintech (fintech-001 → fintech-010) ─────────────────────────────────────

const fintechCases: VerticalEvalCase[] = [
  {
    id: "fintech-001",
    vertical: "fintech",
    contact: {
      fullName: "Thomas Greer",
      title: "Chief Revenue Officer",
      seniority: "c_suite",
      email: "tgreer@ledgerly.com",
    },
    company: {
      name: "Ledgerly",
      domain: "ledgerly.com",
      industry: "Accounting & Bookkeeping Software",
      size: "51-200",
      description:
        "Ledgerly provides automated bookkeeping and financial reporting for small businesses. The platform connects to bank feeds and categorizes transactions using rule-based and ML classification.",
      fundingStage: "Series A",
      totalRaised: "$14M",
    },
    signals: [
      {
        type: "funding",
        title: "Series A closed",
        description:
          "Ledgerly raised $14M Series A to expand sales team and add payroll integrations.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "Compliance officer hired",
        description:
          "Hired first dedicated compliance officer, suggesting preparation for regulated product features.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "Series A",
        "compliance investment",
        "SMB financial automation",
      ],
      briefShouldInclude: [
        "regulatory environment",
        "competitive landscape",
        "SMB fintech market",
      ],
      industrySpecificLanguage: [
        "bank feeds",
        "reconciliation",
        "compliance",
        "SOX",
        "financial reporting",
      ],
    },
  },
  {
    id: "fintech-002",
    vertical: "fintech",
    contact: {
      fullName: "Sandra Liu",
      title: "VP of Business Development",
      seniority: "vp",
      email: "sandra.liu@paybridge.co",
    },
    company: {
      name: "PayBridge",
      domain: "paybridge.co",
      industry: "Payment Processing",
      size: "201-500",
      description:
        "PayBridge offers payment orchestration for e-commerce platforms, routing transactions across multiple PSPs to optimize authorization rates and minimize fees.",
      fundingStage: "Series B",
      totalRaised: "$55M",
    },
    signals: [
      {
        type: "expansion",
        title: "Launched in Latin America",
        description:
          "PayBridge added support for local payment methods in Brazil, Mexico, and Colombia.",
        relevance: "high",
      },
      {
        type: "tech_change",
        title: "Added real-time fraud scoring",
        description:
          "Announced new ML-based fraud detection layer integrated directly into the payment flow.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Negotiation",
      value: 45000,
      daysSinceActivity: 8,
    },
    expectations: {
      emailShouldReference: [
        "LatAm expansion",
        "payment orchestration",
        "fraud scoring",
      ],
      briefShouldInclude: [
        "payment landscape in LatAm",
        "deal stage and negotiation context",
        "competitive positioning",
        "regulatory considerations",
      ],
      industrySpecificLanguage: [
        "PSP",
        "authorization rate",
        "payment orchestration",
        "chargeback",
        "PCI DSS",
        "local payment methods",
      ],
    },
  },
  {
    id: "fintech-003",
    vertical: "fintech",
    contact: {
      fullName: "James Okoro",
      title: "Director of Digital Banking",
      seniority: "director",
      email: "j.okoro@northerntrustbank.com",
    },
    company: {
      name: "Northern Trust Bancorp",
      domain: "northerntrustbank.com",
      industry: "Commercial Banking",
      size: "1001-5000",
      description:
        "Northern Trust Bancorp is a regional commercial bank serving mid-market businesses across the Midwest. The bank operates 85 branches and manages $12B in assets.",
    },
    signals: [
      {
        type: "leadership_change",
        title: "New Chief Digital Officer",
        description:
          "Hired a CDO from a neobank to lead digital transformation of customer-facing services.",
        relevance: "high",
      },
      {
        type: "news",
        title: "Digital transformation initiative announced",
        description:
          "CEO announced a three-year digital transformation plan in the annual report, citing customer acquisition costs.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "digital transformation",
        "new CDO",
        "customer acquisition efficiency",
      ],
      briefShouldInclude: [
        "bank size and profile",
        "digital maturity assessment",
        "regulatory constraints",
        "enterprise sales considerations",
      ],
      industrySpecificLanguage: [
        "digital banking",
        "core banking system",
        "AML",
        "KYC",
        "customer acquisition cost",
        "branch network",
      ],
    },
  },
  {
    id: "fintech-004",
    vertical: "fintech",
    contact: {
      fullName: "Elena Vasquez",
      title: "Head of Product",
      seniority: "director",
      email: "elena@claimstack.io",
    },
    company: {
      name: "ClaimStack",
      domain: "claimstack.io",
      industry: "Insurance Technology",
      size: "51-200",
      description:
        "ClaimStack automates insurance claims processing for P&C carriers. The platform uses document extraction and rules engines to adjudicate simple claims without human review.",
      fundingStage: "Series A",
      totalRaised: "$18M",
    },
    signals: [
      {
        type: "hiring",
        title: "Sales team tripling",
        description:
          "Six new AE positions posted in the last month, up from a team of three.",
        relevance: "high",
      },
      {
        type: "news",
        title: "SOC 2 Type II certification",
        description:
          "Achieved SOC 2 Type II certification, removing a common blocker for enterprise insurance clients.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "sales team growth",
        "SOC 2 certification",
        "insurance claims automation",
      ],
      briefShouldInclude: [
        "insurtech landscape",
        "regulatory environment",
        "enterprise readiness",
        "sales scaling challenges",
      ],
      industrySpecificLanguage: [
        "P&C",
        "claims adjudication",
        "underwriting",
        "loss ratio",
        "SOC 2",
        "carrier",
      ],
    },
  },
  {
    id: "fintech-005",
    vertical: "fintech",
    contact: {
      fullName: "Robert Nakamura",
      title: "CEO",
      seniority: "c_suite",
      email: "robert@vaultchain.io",
    },
    company: {
      name: "VaultChain",
      domain: "vaultchain.io",
      industry: "Digital Asset Custody",
      size: "11-50",
      description:
        "VaultChain provides institutional-grade custody and staking infrastructure for digital assets. Clients include crypto funds, family offices, and RIAs seeking qualified custodian solutions.",
      fundingStage: "Seed",
      totalRaised: "$5M",
    },
    signals: [
      {
        type: "news",
        title: "Applied for state trust charter",
        description:
          "Filed application for a Wyoming trust charter to operate as a qualified custodian under state law.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "trust charter application",
        "institutional custody",
        "regulatory compliance",
      ],
      briefShouldInclude: [
        "regulatory landscape for crypto custody",
        "competitive positioning",
        "institutional buyer profile",
      ],
      industrySpecificLanguage: [
        "qualified custodian",
        "staking",
        "digital asset",
        "trust charter",
        "RIA",
        "AUM",
      ],
    },
  },
  {
    id: "fintech-006",
    vertical: "fintech",
    contact: {
      fullName: "Catherine Belmonte",
      title: "Managing Director, Innovation",
      seniority: "vp",
      email: "c.belmonte@meridianfinancial.com",
    },
    company: {
      name: "Meridian Financial Group",
      domain: "meridianfinancial.com",
      industry: "Wealth Management",
      size: "501-1000",
      description:
        "Meridian Financial Group is an independent wealth management firm with $8B AUM. Serves high-net-worth individuals and small institutions through a network of 120 advisors.",
    },
    signals: [
      {
        type: "tech_change",
        title: "RFP for client portal",
        description:
          "Published an RFP for a modern client portal to replace their legacy reporting system.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "Hiring fintech partnerships lead",
        description:
          "New role focused on evaluating and integrating fintech solutions into advisor workflows.",
        relevance: "high",
      },
    ],
    dealContext: {
      stage: "Discovery",
      value: 72000,
      daysSinceActivity: 3,
    },
    expectations: {
      emailShouldReference: [
        "client portal modernization",
        "advisor workflow",
        "fintech partnerships",
      ],
      briefShouldInclude: [
        "firm profile and AUM",
        "technology modernization context",
        "enterprise buying process",
        "deal stage details",
      ],
      industrySpecificLanguage: [
        "AUM",
        "RIA",
        "advisor",
        "client portal",
        "portfolio reporting",
        "fiduciary",
      ],
    },
  },
  {
    id: "fintech-007",
    vertical: "fintech",
    contact: {
      fullName: "David Thornton",
      title: "VP of Engineering",
      seniority: "vp",
      email: "david.t@swiftledger.com",
    },
    company: {
      name: "SwiftLedger",
      domain: "swiftledger.com",
      industry: "B2B Payments",
      size: "51-200",
      description:
        "SwiftLedger provides accounts payable automation for mid-market companies. The platform handles invoice ingestion, approval routing, and payment execution across ACH, wire, and virtual card.",
      fundingStage: "Series A",
      totalRaised: "$10M",
    },
    signals: [
      {
        type: "tech_change",
        title: "Migrating to microservices",
        description:
          "Engineering blog post detailed a migration from monolith to microservices architecture for payment processing.",
        relevance: "low",
      },
    ],
    expectations: {
      emailShouldReference: [
        "AP automation",
        "payment infrastructure",
        "engineering investment",
      ],
      briefShouldInclude: [
        "technology maturity",
        "competitive landscape",
        "buyer persona (technical VP)",
      ],
      industrySpecificLanguage: [
        "ACH",
        "virtual card",
        "AP automation",
        "invoice processing",
        "payment rails",
      ],
    },
  },
  {
    id: "fintech-008",
    vertical: "fintech",
    contact: {
      fullName: "Anna Kowalski",
      title: "Chief Compliance Officer",
      seniority: "c_suite",
      email: "a.kowalski@regshield.io",
    },
    company: {
      name: "RegShield",
      domain: "regshield.io",
      industry: "Regulatory Technology",
      size: "51-200",
      description:
        "RegShield automates regulatory reporting and compliance monitoring for banks and credit unions. The platform tracks regulatory changes and maps them to internal policies.",
      fundingStage: "Series B",
      totalRaised: "$32M",
    },
    signals: [
      {
        type: "expansion",
        title: "Expanding to insurance vertical",
        description:
          "Announced plans to extend compliance monitoring to insurance carriers, beyond banking.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "Enterprise sales team build-out",
        description:
          "Hiring enterprise AEs and a sales engineering team for the first time.",
        relevance: "high",
      },
      {
        type: "news",
        title: "Partnership with industry body",
        description:
          "Signed a partnership with a banking industry association for co-marketing to member institutions.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "insurance vertical expansion",
        "enterprise sales build-out",
        "regulatory compliance automation",
      ],
      briefShouldInclude: [
        "regtech landscape",
        "vertical expansion strategy",
        "enterprise sales readiness",
        "regulatory environment",
      ],
      industrySpecificLanguage: [
        "regtech",
        "regulatory reporting",
        "compliance monitoring",
        "AML",
        "BSA",
        "OCC",
      ],
    },
  },
  {
    id: "fintech-009",
    vertical: "fintech",
    contact: {
      fullName: "Miguel Santos",
      title: "Founder",
      seniority: "c_suite",
      email: "miguel@nestpay.co",
    },
    company: {
      name: "NestPay",
      domain: "nestpay.co",
      industry: "Embedded Finance",
      size: "11-50",
      description:
        "NestPay provides embedded lending APIs that let SaaS platforms offer buy-now-pay-later options to their business customers. Early-stage, pre-revenue, with two pilot customers.",
      fundingStage: "Pre-seed",
      totalRaised: "$1.5M",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "embedded lending",
        "B2B BNPL",
        "early-stage considerations",
      ],
      briefShouldInclude: [
        "company stage",
        "market opportunity",
        "regulatory considerations for lending",
      ],
      industrySpecificLanguage: [
        "embedded finance",
        "BNPL",
        "lending API",
        "credit risk",
        "underwriting",
      ],
    },
  },
  {
    id: "fintech-010",
    vertical: "fintech",
    contact: {
      fullName: "Patricia Heng",
      title: "Director of Strategy",
      seniority: "director",
      email: "pheng@capitaloneinsurance.example.com",
    },
    company: {
      name: "Apex Mutual Insurance",
      domain: "apexmutual.com",
      industry: "Property & Casualty Insurance",
      size: "5001-10000",
      description:
        "Apex Mutual is a regional P&C insurance carrier writing homeowners, auto, and small commercial policies. Operates in 15 states with $2.4B in gross written premiums.",
    },
    signals: [
      {
        type: "news",
        title: "Announced digital-first initiative",
        description:
          "CEO outlined a plan to move 60% of new policy issuance to digital channels within 24 months.",
        relevance: "high",
      },
      {
        type: "leadership_change",
        title: "Hired Chief Innovation Officer",
        description:
          "Brought on a CIO from a major insurtech to lead technology modernization.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "digital-first initiative",
        "technology modernization",
        "new CIO",
      ],
      briefShouldInclude: [
        "carrier profile",
        "digital maturity",
        "enterprise buying process",
        "insurance industry dynamics",
      ],
      industrySpecificLanguage: [
        "gross written premium",
        "policy issuance",
        "carrier",
        "underwriting",
        "combined ratio",
        "digital distribution",
      ],
    },
  },
];

// ── Dev Tools (devtools-001 → devtools-010) ─────────────────────────────────

const devtoolsCases: VerticalEvalCase[] = [
  {
    id: "devtools-001",
    vertical: "devtools",
    contact: {
      fullName: "Alex Lindgren",
      title: "Staff Engineer",
      seniority: "senior",
      email: "alex@terrabuild.dev",
    },
    company: {
      name: "TerraBuild",
      domain: "terrabuild.dev",
      industry: "Build Systems & CI/CD",
      size: "11-50",
      description:
        "TerraBuild provides a remote build cache and execution engine for monorepo-based development teams. Compatible with Bazel, Gradle, and Turborepo. Open-source core with a managed cloud offering.",
      fundingStage: "Seed",
      totalRaised: "$4M",
    },
    signals: [
      {
        type: "funding",
        title: "Seed round closed",
        description:
          "Raised $4M seed led by Heavybit to grow the open-source community and launch hosted tier.",
        relevance: "high",
      },
      {
        type: "news",
        title: "Hit 5K GitHub stars",
        description:
          "Open-source project crossed 5,000 GitHub stars with 80+ contributors.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "open-source traction",
        "seed funding",
        "build infrastructure",
      ],
      briefShouldInclude: [
        "OSS community health",
        "monetization approach",
        "competitive landscape",
      ],
      industrySpecificLanguage: [
        "remote cache",
        "monorepo",
        "CI/CD",
        "build time",
        "Bazel",
        "open-source",
      ],
    },
  },
  {
    id: "devtools-002",
    vertical: "devtools",
    contact: {
      fullName: "Mei Zhang",
      title: "Engineering Manager",
      seniority: "manager",
      email: "mei.zhang@observestack.io",
    },
    company: {
      name: "ObserveStack",
      domain: "observestack.io",
      industry: "Observability",
      size: "51-200",
      description:
        "ObserveStack is an observability platform that unifies logs, metrics, and traces into a single query interface. Built on ClickHouse for cost-efficient storage and fast queries at scale.",
      fundingStage: "Series A",
      totalRaised: "$16M",
    },
    signals: [
      {
        type: "tech_change",
        title: "Added OpenTelemetry native support",
        description:
          "Shipped native OpenTelemetry collector integration, reducing setup friction for teams migrating from proprietary agents.",
        relevance: "medium",
      },
      {
        type: "hiring",
        title: "DevRel team forming",
        description:
          "Hiring two developer advocates and a technical content lead to grow awareness.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Technical Evaluation",
      value: 36000,
      daysSinceActivity: 6,
    },
    expectations: {
      emailShouldReference: [
        "OpenTelemetry support",
        "observability costs",
        "DevRel investment",
      ],
      briefShouldInclude: [
        "technical evaluation context",
        "competitive landscape (Datadog, Grafana)",
        "deal stage details",
        "engineering team profile",
      ],
      industrySpecificLanguage: [
        "OpenTelemetry",
        "traces",
        "metrics",
        "log aggregation",
        "ClickHouse",
        "observability",
      ],
    },
  },
  {
    id: "devtools-003",
    vertical: "devtools",
    contact: {
      fullName: "Brian Kelley",
      title: "Principal Engineer",
      seniority: "senior",
      email: "bkelley@syntaxcloud.com",
    },
    company: {
      name: "SyntaxCloud",
      domain: "syntaxcloud.com",
      industry: "Cloud IDE",
      size: "51-200",
      description:
        "SyntaxCloud offers browser-based development environments with pre-configured language support and cloud compute. Used by teams that need reproducible dev environments without local setup.",
      fundingStage: "Series B",
      totalRaised: "$38M",
    },
    signals: [
      {
        type: "expansion",
        title: "Enterprise tier launched",
        description:
          "Launched an enterprise tier with SSO, audit logs, and private compute clusters for regulated industries.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "enterprise launch",
        "cloud development environments",
        "security and compliance",
      ],
      briefShouldInclude: [
        "enterprise readiness",
        "competitive positioning (Gitpod, Codespaces)",
        "technical buyer persona",
      ],
      industrySpecificLanguage: [
        "dev environment",
        "devcontainer",
        "SSO",
        "audit log",
        "cloud IDE",
        "reproducible environment",
      ],
    },
  },
  {
    id: "devtools-004",
    vertical: "devtools",
    contact: {
      fullName: "Yuki Tanaka",
      title: "CTO",
      seniority: "c_suite",
      email: "yuki@pipelinekit.dev",
    },
    company: {
      name: "PipelineKit",
      domain: "pipelinekit.dev",
      industry: "Data Pipeline Tooling",
      size: "11-50",
      description:
        "PipelineKit provides a declarative framework for building and orchestrating data pipelines. Offers a Python SDK and a visual DAG editor. Targets data engineering teams moving away from Airflow.",
      fundingStage: "Seed",
      totalRaised: "$3.5M",
    },
    signals: [
      {
        type: "news",
        title: "Launched managed cloud service",
        description:
          "PipelineKit launched a hosted version of their open-source orchestrator, with usage-based pricing.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "First go-to-market hire",
        description:
          "Posting for a founding sales role, marking transition from community-driven to active sales motion.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "managed cloud launch",
        "first sales hire",
        "Airflow migration",
      ],
      briefShouldInclude: [
        "open-source to commercial transition",
        "competitive landscape (Airflow, Dagster, Prefect)",
        "founder context",
      ],
      industrySpecificLanguage: [
        "DAG",
        "data pipeline",
        "orchestration",
        "ELT",
        "data engineering",
        "Airflow",
      ],
    },
  },
  {
    id: "devtools-005",
    vertical: "devtools",
    contact: {
      fullName: "Sara Johansson",
      title: "VP of Engineering",
      seniority: "vp",
      email: "sara.j@codevault.io",
    },
    company: {
      name: "CodeVault",
      domain: "codevault.io",
      industry: "Secrets Management",
      size: "51-200",
      description:
        "CodeVault provides secrets management and environment variable syncing for development teams. Integrates with CI/CD pipelines, cloud providers, and container orchestration systems.",
      fundingStage: "Series A",
      totalRaised: "$12M",
    },
    signals: [
      {
        type: "tech_change",
        title: "Kubernetes operator released",
        description:
          "Shipped a native Kubernetes operator for automatic secret injection into pods.",
        relevance: "medium",
      },
      {
        type: "expansion",
        title: "FedRAMP authorization in progress",
        description:
          "Pursuing FedRAMP authorization to sell into US federal agencies.",
        relevance: "high",
      },
    ],
    dealContext: {
      stage: "Proposal",
      value: 28000,
      daysSinceActivity: 15,
    },
    expectations: {
      emailShouldReference: [
        "Kubernetes operator",
        "FedRAMP",
        "secrets management",
      ],
      briefShouldInclude: [
        "government market opportunity",
        "deal stall risk",
        "competitive positioning (HashiCorp Vault, Doppler)",
        "proposal follow-up strategy",
      ],
      industrySpecificLanguage: [
        "secrets management",
        "env vars",
        "FedRAMP",
        "Kubernetes",
        "zero trust",
        "secret rotation",
      ],
    },
  },
  {
    id: "devtools-006",
    vertical: "devtools",
    contact: {
      fullName: "Ryan Chu",
      title: "Director of Platform Engineering",
      seniority: "director",
      email: "ryan.chu@gridscale.dev",
    },
    company: {
      name: "GridScale",
      domain: "gridscale.dev",
      industry: "Serverless Compute",
      size: "51-200",
      description:
        "GridScale provides a serverless compute platform optimized for GPU workloads. Targets ML teams that need on-demand GPU access without managing infrastructure.",
      fundingStage: "Series A",
      totalRaised: "$20M",
    },
    signals: [
      {
        type: "funding",
        title: "Series A closed",
        description:
          "Raised $20M Series A to expand GPU cluster capacity and build out self-serve platform.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "Scaling engineering team",
        description:
          "Ten open engineering roles posted, doubling the current team size.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "Series A",
        "GPU compute demand",
        "self-serve platform",
      ],
      briefShouldInclude: [
        "GPU cloud market",
        "competitive landscape",
        "engineering growth context",
      ],
      industrySpecificLanguage: [
        "serverless",
        "GPU",
        "ML inference",
        "compute cluster",
        "on-demand",
        "cold start",
      ],
    },
  },
  {
    id: "devtools-007",
    vertical: "devtools",
    contact: {
      fullName: "Olivia Barnes",
      title: "Senior Software Engineer",
      seniority: "senior",
      email: "olivia.b@testforge.io",
    },
    company: {
      name: "TestForge",
      domain: "testforge.io",
      industry: "Testing Infrastructure",
      size: "11-50",
      description:
        "TestForge provides parallel test execution infrastructure for CI/CD pipelines. Splits test suites across containers and aggregates results, reducing test run times from hours to minutes.",
      fundingStage: "Seed",
      totalRaised: "$2.5M",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "test execution speed",
        "CI/CD optimization",
        "developer productivity",
      ],
      briefShouldInclude: [
        "company overview",
        "testing infrastructure landscape",
        "IC buyer considerations",
      ],
      industrySpecificLanguage: [
        "test parallelization",
        "CI/CD",
        "flaky tests",
        "test splitting",
        "container",
      ],
    },
  },
  {
    id: "devtools-008",
    vertical: "devtools",
    contact: {
      fullName: "Nathan Reeves",
      title: "Head of Developer Experience",
      seniority: "director",
      email: "nathan@docsmith.dev",
    },
    company: {
      name: "DocSmith",
      domain: "docsmith.dev",
      industry: "Documentation Tooling",
      size: "11-50",
      description:
        "DocSmith generates and hosts API documentation from code annotations. Supports OpenAPI, GraphQL, and gRPC. Offers versioning, search, and feedback widgets out of the box.",
      fundingStage: "Seed",
      totalRaised: "$2.8M",
    },
    signals: [
      {
        type: "news",
        title: "Product Hunt launch",
        description:
          "Launched on Product Hunt and reached #3 product of the day with 800+ upvotes.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "Product Hunt traction",
        "API documentation",
        "developer experience",
      ],
      briefShouldInclude: [
        "community traction",
        "competitive landscape (ReadMe, Mintlify)",
        "PLG potential",
      ],
      industrySpecificLanguage: [
        "API docs",
        "OpenAPI",
        "GraphQL",
        "developer portal",
        "SDK",
        "DX",
      ],
    },
  },
  {
    id: "devtools-009",
    vertical: "devtools",
    contact: {
      fullName: "Lisa Fernandez",
      title: "Engineering Manager",
      seniority: "manager",
      email: "lfernandez@flagwise.io",
    },
    company: {
      name: "FlagWise",
      domain: "flagwise.io",
      industry: "Feature Management",
      size: "51-200",
      description:
        "FlagWise provides feature flagging and experimentation infrastructure. Teams use it for progressive rollouts, A/B testing, and kill switches. Self-hosted and cloud options available.",
      fundingStage: "Series A",
      totalRaised: "$11M",
    },
    signals: [
      {
        type: "tech_change",
        title: "Edge SDK released",
        description:
          "Released an edge-evaluated SDK that resolves feature flags at CDN edge nodes for sub-millisecond latency.",
        relevance: "medium",
      },
      {
        type: "hiring",
        title: "Building sales engineering team",
        description:
          "First two sales engineer roles posted, signaling move toward enterprise accounts.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Discovery",
      value: 15000,
      daysSinceActivity: 2,
    },
    expectations: {
      emailShouldReference: [
        "edge SDK",
        "enterprise expansion",
        "feature management",
      ],
      briefShouldInclude: [
        "competitive landscape (LaunchDarkly, Statsig)",
        "deal context",
        "technical evaluation criteria",
        "engineering manager buyer profile",
      ],
      industrySpecificLanguage: [
        "feature flag",
        "progressive rollout",
        "A/B test",
        "kill switch",
        "edge evaluation",
        "experiment",
      ],
    },
  },
  {
    id: "devtools-010",
    vertical: "devtools",
    contact: {
      fullName: "Carlos Medina",
      title: "Founder & CEO",
      seniority: "c_suite",
      email: "carlos@schemaforge.dev",
    },
    company: {
      name: "SchemaForge",
      domain: "schemaforge.dev",
      industry: "Database Tooling",
      size: "11-50",
      description:
        "SchemaForge provides schema migration and database branching for development teams. Lets developers create isolated database branches for feature work, similar to Git branches for code.",
      fundingStage: "Pre-seed",
      totalRaised: "$1.2M",
    },
    signals: [
      {
        type: "news",
        title: "Open-source release",
        description:
          "Open-sourced the core migration engine on GitHub. Received positive reception in developer forums.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "open-source release",
        "database branching",
        "founder-led sales",
      ],
      briefShouldInclude: [
        "early-stage context",
        "OSS strategy",
        "competitive landscape (PlanetScale, Neon)",
      ],
      industrySpecificLanguage: [
        "schema migration",
        "database branching",
        "DDL",
        "migration drift",
        "dev/prod parity",
      ],
    },
  },
];

// ── Services / Agency (services-001 → services-010) ─────────────────────────

const servicesCases: VerticalEvalCase[] = [
  {
    id: "services-001",
    vertical: "services",
    contact: {
      fullName: "Martin Leblanc",
      title: "Managing Partner",
      seniority: "c_suite",
      email: "mleblanc@peakstrategy.co",
    },
    company: {
      name: "Peak Strategy Group",
      domain: "peakstrategy.co",
      industry: "Management Consulting",
      size: "51-200",
      description:
        "Peak Strategy Group is a management consulting firm focused on operational efficiency for mid-market manufacturers. Engagements typically run 6-12 months with teams of 3-5 consultants.",
    },
    signals: [
      {
        type: "expansion",
        title: "Opened second office",
        description:
          "Opened a Chicago office to serve Midwest manufacturing clients, in addition to their Boston headquarters.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "Midwest expansion",
        "manufacturing consulting",
        "operational efficiency",
      ],
      briefShouldInclude: [
        "firm profile",
        "target market",
        "geographic expansion context",
      ],
      industrySpecificLanguage: [
        "engagement",
        "utilization rate",
        "billable hours",
        "practice area",
        "deliverables",
      ],
    },
  },
  {
    id: "services-002",
    vertical: "services",
    contact: {
      fullName: "Jessica Tran",
      title: "Director of Growth",
      seniority: "director",
      email: "jtran@brightspark.agency",
    },
    company: {
      name: "BrightSpark Agency",
      domain: "brightspark.agency",
      industry: "Digital Marketing Agency",
      size: "11-50",
      description:
        "BrightSpark is a performance marketing agency specializing in paid search and social for DTC e-commerce brands. Manages over $20M in annual ad spend across 40+ clients.",
    },
    signals: [
      {
        type: "hiring",
        title: "Scaling account management",
        description:
          "Posting for three account managers, suggesting rapid client acquisition.",
        relevance: "medium",
      },
      {
        type: "news",
        title: "Won industry award",
        description:
          "Named a finalist for Best Small Agency by a digital marketing trade publication.",
        relevance: "low",
      },
    ],
    dealContext: {
      stage: "Discovery",
      value: 12000,
      daysSinceActivity: 5,
    },
    expectations: {
      emailShouldReference: [
        "client growth",
        "account management scaling",
        "performance marketing",
      ],
      briefShouldInclude: [
        "agency profile",
        "client acquisition pace",
        "deal stage context",
        "agency-specific pain points",
      ],
      industrySpecificLanguage: [
        "ad spend",
        "ROAS",
        "paid social",
        "DTC",
        "account management",
        "client retention",
      ],
    },
  },
  {
    id: "services-003",
    vertical: "services",
    contact: {
      fullName: "William Adeyemi",
      title: "CEO",
      seniority: "c_suite",
      email: "william@talentedge.co",
    },
    company: {
      name: "TalentEdge Staffing",
      domain: "talentedge.co",
      industry: "IT Staffing & Recruitment",
      size: "51-200",
      description:
        "TalentEdge Staffing places contract and permanent IT professionals across the Southeast US. Focuses on mid-senior engineering, data, and DevOps roles for enterprise clients.",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "IT staffing",
        "talent market",
        "relationship-driven business",
      ],
      briefShouldInclude: [
        "staffing industry dynamics",
        "regional market",
        "company profile",
      ],
      industrySpecificLanguage: [
        "placement",
        "billable consultant",
        "contract-to-hire",
        "fill rate",
        "time-to-fill",
        "margin",
      ],
    },
  },
  {
    id: "services-004",
    vertical: "services",
    contact: {
      fullName: "Hannah Pritchard",
      title: "Partner",
      seniority: "c_suite",
      email: "hannah@clearviewaudit.com",
    },
    company: {
      name: "ClearView Audit & Advisory",
      domain: "clearviewaudit.com",
      industry: "Accounting & Advisory",
      size: "201-500",
      description:
        "ClearView is a regional accounting firm providing audit, tax, and advisory services to mid-market companies. Serves clients across healthcare, real estate, and non-profit sectors.",
    },
    signals: [
      {
        type: "leadership_change",
        title: "New managing partner elected",
        description:
          "The firm elected a new managing partner who has publicly emphasized technology modernization and growth.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "new managing partner",
        "technology modernization",
        "firm growth",
      ],
      briefShouldInclude: [
        "firm profile",
        "leadership transition context",
        "technology adoption in accounting",
      ],
      industrySpecificLanguage: [
        "audit",
        "advisory",
        "engagement letter",
        "partner",
        "practice management",
        "billable hours",
      ],
    },
  },
  {
    id: "services-005",
    vertical: "services",
    contact: {
      fullName: "Kevin Marsh",
      title: "Head of Business Development",
      seniority: "director",
      email: "kmarsh@signalcreative.co",
    },
    company: {
      name: "Signal Creative",
      domain: "signalcreative.co",
      industry: "Branding & Design Agency",
      size: "11-50",
      description:
        "Signal Creative is a branding agency working with B2B technology companies on brand identity, messaging, and visual design. Typical engagements are 2-4 months.",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "B2B branding",
        "creative services",
        "agency positioning",
      ],
      briefShouldInclude: [
        "agency profile",
        "target market",
        "business development context",
      ],
      industrySpecificLanguage: [
        "brand identity",
        "messaging framework",
        "visual identity",
        "creative brief",
        "retainer",
      ],
    },
  },
  {
    id: "services-006",
    vertical: "services",
    contact: {
      fullName: "Diane Foster",
      title: "VP of Client Services",
      seniority: "vp",
      email: "dfoster@accelerateHR.com",
    },
    company: {
      name: "AccelerateHR",
      domain: "accelerateHR.com",
      industry: "HR Consulting",
      size: "51-200",
      description:
        "AccelerateHR provides outsourced HR services and consulting to companies with 50-500 employees. Services include benefits administration, compliance, and talent strategy.",
    },
    signals: [
      {
        type: "hiring",
        title: "New consultants being hired",
        description:
          "Five new HR consultant positions posted across different practice areas.",
        relevance: "medium",
      },
      {
        type: "expansion",
        title: "Added benefits brokerage",
        description:
          "Launched a benefits brokerage division to offer insurance alongside consulting services.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Qualification",
      value: 9000,
      daysSinceActivity: 7,
    },
    expectations: {
      emailShouldReference: [
        "team growth",
        "benefits brokerage expansion",
        "HR consulting demand",
      ],
      briefShouldInclude: [
        "firm profile",
        "service expansion context",
        "deal stage details",
        "HR consulting market dynamics",
      ],
      industrySpecificLanguage: [
        "PEO",
        "benefits administration",
        "compliance",
        "HRIS",
        "outsourced HR",
        "talent strategy",
      ],
    },
  },
  {
    id: "services-007",
    vertical: "services",
    contact: {
      fullName: "Christopher Duval",
      title: "Founder",
      seniority: "c_suite",
      email: "chris@duvaldigital.com",
    },
    company: {
      name: "Duval Digital",
      domain: "duvaldigital.com",
      industry: "Web Development Agency",
      size: "11-50",
      description:
        "Duval Digital builds custom web applications and e-commerce sites for SMBs. The team of 15 developers works primarily with React, Node.js, and Shopify Plus.",
    },
    signals: [],
    expectations: {
      emailShouldReference: [
        "web development",
        "SMB clients",
        "agency growth",
      ],
      briefShouldInclude: [
        "agency profile",
        "tech stack",
        "market positioning",
      ],
      industrySpecificLanguage: [
        "custom development",
        "Shopify Plus",
        "retainer",
        "project scope",
        "sprint",
      ],
    },
  },
  {
    id: "services-008",
    vertical: "services",
    contact: {
      fullName: "Laura Henriksen",
      title: "Director of Operations",
      seniority: "director",
      email: "lhenriksen@northpoint-legal.com",
    },
    company: {
      name: "NorthPoint Legal Advisors",
      domain: "northpoint-legal.com",
      industry: "Legal Services",
      size: "51-200",
      description:
        "NorthPoint is a corporate law firm specializing in M&A, employment law, and IP for technology companies. The firm has 35 attorneys across two offices.",
    },
    signals: [
      {
        type: "tech_change",
        title: "Evaluating practice management software",
        description:
          "RFI circulated among legal tech vendors for a new practice management and billing system.",
        relevance: "high",
      },
    ],
    expectations: {
      emailShouldReference: [
        "practice management evaluation",
        "legal technology modernization",
        "operational efficiency",
      ],
      briefShouldInclude: [
        "firm profile",
        "legal tech adoption trends",
        "operations director buyer profile",
      ],
      industrySpecificLanguage: [
        "practice management",
        "matter",
        "billable hour",
        "conflicts check",
        "case management",
        "RFI",
      ],
    },
  },
  {
    id: "services-009",
    vertical: "services",
    contact: {
      fullName: "Robert Sinclair",
      title: "Senior Partner",
      seniority: "c_suite",
      email: "rsinclair@apexadvisors.co",
    },
    company: {
      name: "Apex Business Advisors",
      domain: "apexadvisors.co",
      industry: "M&A Advisory",
      size: "11-50",
      description:
        "Apex Business Advisors is a lower middle-market M&A advisory firm. They represent sellers in transactions between $5M and $50M, primarily in professional services and light manufacturing.",
    },
    signals: [
      {
        type: "news",
        title: "Record deal volume",
        description:
          "Announced completion of 12 transactions in the past fiscal year, a firm record.",
        relevance: "medium",
      },
    ],
    dealContext: {
      stage: "Proposal",
      value: 15000,
      daysSinceActivity: 20,
    },
    expectations: {
      emailShouldReference: [
        "deal volume growth",
        "lower middle-market M&A",
        "advisory capacity",
      ],
      briefShouldInclude: [
        "firm profile",
        "M&A market conditions",
        "deal stall risk at 20 days",
        "re-engagement strategy",
      ],
      industrySpecificLanguage: [
        "sell-side",
        "LOI",
        "due diligence",
        "EBITDA",
        "lower middle-market",
        "transaction advisory",
      ],
    },
  },
  {
    id: "services-010",
    vertical: "services",
    contact: {
      fullName: "Amy Larson",
      title: "COO",
      seniority: "c_suite",
      email: "alarson@summithealthconsulting.com",
    },
    company: {
      name: "Summit Health Consulting",
      domain: "summithealthconsulting.com",
      industry: "Healthcare Consulting",
      size: "51-200",
      description:
        "Summit Health Consulting advises hospitals and health systems on revenue cycle management, operational efficiency, and regulatory compliance. Engagements range from 3-month assessments to multi-year transformations.",
    },
    signals: [
      {
        type: "expansion",
        title: "Entered payer consulting",
        description:
          "Expanded service offerings from provider-side only to include payer (insurance company) consulting.",
        relevance: "high",
      },
      {
        type: "hiring",
        title: "Senior consultants needed",
        description:
          "Four senior consultant roles posted, suggesting strong engagement pipeline.",
        relevance: "medium",
      },
    ],
    expectations: {
      emailShouldReference: [
        "payer consulting expansion",
        "growing engagement pipeline",
        "healthcare operations",
      ],
      briefShouldInclude: [
        "firm profile",
        "healthcare consulting market",
        "payer vs provider dynamics",
        "growth trajectory",
      ],
      industrySpecificLanguage: [
        "revenue cycle",
        "payer",
        "provider",
        "health system",
        "compliance",
        "engagement pipeline",
        "RCM",
      ],
    },
  },
];

// ── Aggregated export ───────────────────────────────────────────────────────

export const VERTICAL_EVAL_CASES: VerticalEvalCase[] = [
  ...saasCases,
  ...fintechCases,
  ...devtoolsCases,
  ...servicesCases,
];

// ── Helper functions ────────────────────────────────────────────────────────

export function getCasesByVertical(
  vertical: string,
): VerticalEvalCase[] {
  return VERTICAL_EVAL_CASES.filter((c) => c.vertical === vertical);
}

export function getCasesWithDeals(): VerticalEvalCase[] {
  return VERTICAL_EVAL_CASES.filter((c) => c.dealContext !== undefined);
}

export function getCasesWithoutSignals(): VerticalEvalCase[] {
  return VERTICAL_EVAL_CASES.filter((c) => c.signals.length === 0);
}
