/**
 * NAICS / SIC  ->  literal Apollo industry string crosswalk.
 *
 * WHY: Apollo's `mixed_companies_search` returns NAICS + SIC codes but NOT
 * the `industry` label. To categorize sourced companies with the SAME
 * vocabulary Apollo uses (so the labels correspond to Apollo's industry
 * filter), we translate the codes into Apollo's industry strings.
 *
 * Target vocabulary = Apollo's industry taxonomy (the LinkedIn v1 set).
 * Strings marked [C] are CONFIRMED — they appeared verbatim in Apollo
 * responses already on this tenant. Strings marked [E] are standard
 * Apollo industries not yet seen in our own data but part of the same
 * fixed taxonomy. All are lowercase with Apollo's exact punctuation.
 */

// ── Apollo industry constants (exact spelling) ───────────────────────
// [C] confirmed from our Apollo data, [E] standard Apollo taxonomy.
export const A = {
  it_services: "information technology & services", // [C]
  info_services: "information services", // [C]
  internet: "internet", // [E]
  software: "computer software", // [E]
  netsec: "computer & network security", // [C]
  telecom: "telecommunications", // [C]
  semiconductors: "semiconductors", // [E]
  hardware: "computer hardware", // [E]
  hospital_health: "hospital & health care", // [C]
  medical_practice: "medical practice", // [E]
  medical_devices: "medical devices", // [C]
  pharma: "pharmaceuticals", // [E]
  biotech: "biotechnology", // [E]
  wellness: "health, wellness & fitness", // [C]
  mental_health: "mental health care", // [E]
  individual_family: "individual & family services", // [C]
  nonprofit: "non-profit organization management", // [E] (note: Apollo uses hyphen)
  nonprofit_alt: "nonprofit organization management", // [C] (seen without hyphen in our data)
  civic: "civic & social organization", // [E]
  religious: "religious institutions", // [E]
  philanthropy: "philanthropy", // [E]
  higher_ed: "higher education", // [C]
  edu_mgmt: "education management", // [E]
  primary_secondary: "primary/secondary education", // [E]
  elearning: "e-learning", // [C]
  training: "professional training & coaching", // [C]
  research: "research", // [E]
  gov_admin: "government administration", // [C]
  intl_affairs: "international affairs", // [C]
  intl_trade: "international trade & development", // [C]
  public_safety: "public safety", // [E]
  legislative: "legislative office", // [E]
  banking: "banking", // [C]
  financial_services: "financial services", // [C]
  investment_mgmt: "investment management", // [C]
  capital_markets: "capital markets", // [E]
  insurance: "insurance", // [C]
  vc: "venture capital & private equity", // [E]
  real_estate: "real estate", // [C]
  commercial_re: "commercial real estate", // [E]
  construction: "construction", // [C]
  civil_eng: "civil engineering", // [C]
  building_materials: "building materials", // [E]
  architecture: "architecture & planning", // [E]
  mgmt_consulting: "management consulting", // [C]
  accounting: "accounting", // [E]
  legal_services: "legal services", // [C]
  law_practice: "law practice", // [C]
  marketing: "marketing & advertising", // [C]
  pr: "public relations & communications", // [E]
  design: "design", // [E]
  hr: "human resources", // [C]
  staffing: "staffing & recruiting", // [E]
  outsourcing: "outsourcing/offshoring", // [E]
  facilities: "facilities services", // [E]
  security_investigations: "security & investigations", // [E]
  events: "events services", // [C]
  prof_services: "professional services", // [E]
  machinery: "machinery", // [C]
  mech_eng: "mechanical or industrial engineering", // [E]
  elec_mfg: "electrical/electronic manufacturing", // [C]
  industrial_automation: "industrial automation", // [E]
  automotive: "automotive", // [C]
  aerospace: "aviation & aerospace", // [C]
  airlines: "airlines/aviation", // [C]
  food_production: "food production", // [C]
  food_bev: "food & beverages", // [C]
  restaurants: "restaurants", // [E]
  chemicals: "chemicals", // [C]
  plastics: "plastics", // [E]
  textiles: "textiles", // [E]
  apparel: "apparel & fashion", // [C]
  cosmetics: "cosmetics", // [C]
  furniture: "furniture", // [C]
  consumer_goods: "consumer goods", // [C]
  consumer_services: "consumer services", // [C]
  packaging: "packaging & containers", // [E]
  mining_metals: "mining & metals", // [E]
  oil_energy: "oil & energy", // [E]
  utilities: "utilities", // [E]
  renewables: "renewables & environment", // [E]
  environmental: "environmental services", // [C]
  farming: "farming", // [E]
  wholesale: "wholesale", // [C]
  retail: "retail", // [C]
  logistics: "logistics & supply chain", // [C]
  trucking: "transportation/trucking/railroad", // [C]
  maritime: "maritime", // [E]
  freight: "package/freight delivery", // [E]
  warehousing: "warehousing", // [E]
  hospitality: "hospitality", // [C]
  leisure_travel: "leisure, travel & tourism", // [C]
  recreation: "recreational facilities & services", // [E]
  publishing: "publishing", // [C]
  online_media: "online media", // [C]
  broadcast: "broadcast media", // [E]
  media_production: "media production", // [E]
  entertainment: "entertainment", // [C]
  performing_arts: "performing arts", // [C]
  music: "music", // [C]
  sports: "sports", // [C]
  computer_games: "computer games", // [C]
  fine_art: "fine art", // [E]
  other: "other", // [E] Apollo's catch-all
} as const;

export type ApolloIndustry = string;

// ── NAICS 4-digit overrides (most specific) ──────────────────────────
const N4: Record<string, ApolloIndustry> = {
  // 5411 legal; 5412 accounting; 5413 arch/eng; 5414 design; 5415 IT;
  // 5416 consulting; 5417 research; 5418 advertising; 5419 other prof.
  "5411": A.legal_services, "5412": A.accounting, "5413": A.architecture,
  "5414": A.design, "5415": A.it_services, "5416": A.mgmt_consulting,
  "5417": A.research, "5418": A.marketing, "5419": A.mgmt_consulting,
  // 6111 schools; 6113 colleges; 6114 business/computer training; 6115 technical; 6116 other schools.
  "6111": A.primary_secondary, "6113": A.higher_ed, "6114": A.training,
  "6115": A.training, "6116": A.training, "6117": A.edu_mgmt,
  // 8131 religious; 8132 grantmaking/giving; 8133 social advocacy;
  // 8134 civic; 8139 business/professional/political orgs.
  "8131": A.religious, "8132": A.philanthropy, "8133": A.civic,
  "8134": A.civic, "8139": A.nonprofit_alt,
  // 3391 medical equipment & supplies
  "3391": A.medical_devices,
  // 5239 (incl. investment advice), 5231 securities, 5232 exchanges
  "5231": A.capital_markets, "5232": A.capital_markets, "5239": A.investment_mgmt,
  // 5223/5222/5221 banking/credit
  "5221": A.banking, "5222": A.financial_services, "5223": A.financial_services,
  // 5241 insurance carriers, 5242 agencies
  "5241": A.insurance, "5242": A.insurance,
  // 5613 employment, 5616 security, 5617 building services, 5615 travel
  "5613": A.staffing, "5615": A.leisure_travel, "5616": A.security_investigations, "5617": A.facilities,
  // 5111 newspaper/book publishing; 5112 software publishers; 5121 motion pic; 5122 sound; 5151 broadcasting; 5182 data hosting; 5191 web portals
  "5111": A.publishing, "5112": A.software, "5121": A.media_production,
  "5122": A.music, "5151": A.broadcast, "5152": A.broadcast,
  "5182": A.it_services, "5191": A.internet, "5179": A.telecom, "5174": A.telecom,
};

// ── NAICS 3-digit map ────────────────────────────────────────────────
const N3: Record<string, ApolloIndustry> = {
  "111": A.farming, "112": A.farming, "113": A.farming, "114": A.farming, "115": A.farming,
  "211": A.oil_energy, "212": A.mining_metals, "213": A.mining_metals,
  "221": A.utilities,
  "236": A.construction, "237": A.civil_eng, "238": A.construction,
  "311": A.food_production, "312": A.food_bev, "313": A.textiles, "314": A.textiles,
  "315": A.apparel, "316": A.apparel, "321": A.building_materials, "322": A.packaging,
  "323": A.publishing, "324": A.oil_energy, "325": A.chemicals, "326": A.plastics,
  "327": A.building_materials, "331": A.mining_metals, "332": A.mech_eng,
  "333": A.machinery, "334": A.elec_mfg, "335": A.elec_mfg, "336": A.automotive,
  "337": A.furniture, "339": A.consumer_goods,
  "423": A.wholesale, "424": A.wholesale, "425": A.wholesale,
  "441": A.automotive, "442": A.retail, "443": A.retail, "444": A.retail,
  "445": A.retail, "446": A.retail, "447": A.retail, "448": A.apparel,
  "449": A.retail, "451": A.retail, "452": A.retail, "453": A.retail,
  "454": A.retail, "455": A.retail, "456": A.retail, "457": A.retail, "458": A.apparel, "459": A.retail,
  "481": A.airlines, "482": A.trucking, "483": A.maritime, "484": A.trucking,
  "485": A.trucking, "486": A.oil_energy, "487": A.leisure_travel, "488": A.logistics,
  "491": A.freight, "492": A.freight, "493": A.warehousing,
  "511": A.publishing, "512": A.entertainment, "513": A.broadcast, "515": A.broadcast,
  "516": A.broadcast, "517": A.telecom, "518": A.it_services, "519": A.info_services,
  "521": A.banking, "522": A.banking, "523": A.investment_mgmt, "524": A.insurance, "525": A.financial_services,
  "531": A.real_estate, "532": A.consumer_services, "533": A.prof_services,
  "541": A.prof_services, "551": A.mgmt_consulting,
  "561": A.facilities, "562": A.environmental,
  "611": A.edu_mgmt,
  "621": A.hospital_health, "622": A.hospital_health, "623": A.hospital_health, "624": A.individual_family,
  "711": A.entertainment, "712": A.recreation, "713": A.recreation,
  "721": A.hospitality, "722": A.restaurants,
  "811": A.consumer_services, "812": A.consumer_services, "813": A.nonprofit_alt, "814": A.consumer_services,
  "921": A.gov_admin, "922": A.gov_admin, "923": A.gov_admin, "924": A.environmental,
  "925": A.gov_admin, "926": A.gov_admin, "927": A.research, "928": A.intl_affairs,
};

// ── NAICS 2-digit coarse fallback ────────────────────────────────────
const N2: Record<string, ApolloIndustry> = {
  "11": A.farming, "21": A.mining_metals, "22": A.utilities, "23": A.construction,
  "31": A.food_production, "32": A.chemicals, "33": A.machinery, "42": A.wholesale,
  "44": A.retail, "45": A.retail, "48": A.logistics, "49": A.logistics,
  "51": A.info_services, "52": A.financial_services, "53": A.real_estate,
  "54": A.prof_services, "55": A.mgmt_consulting, "56": A.facilities,
  "61": A.edu_mgmt, "62": A.hospital_health, "71": A.entertainment, "72": A.hospitality,
  "81": A.consumer_services, "92": A.gov_admin,
};

// ── SIC 2-digit fallback (used when NAICS absent) ────────────────────
const SIC2: Record<string, ApolloIndustry> = {
  "01": A.farming, "02": A.farming, "07": A.farming, "08": A.farming, "09": A.farming,
  "10": A.mining_metals, "12": A.mining_metals, "13": A.oil_energy, "14": A.mining_metals,
  "15": A.construction, "16": A.civil_eng, "17": A.construction,
  "20": A.food_production, "21": A.consumer_goods, "22": A.textiles, "23": A.apparel,
  "24": A.building_materials, "25": A.furniture, "26": A.packaging, "27": A.publishing,
  "28": A.chemicals, "29": A.oil_energy, "30": A.plastics, "31": A.apparel, "32": A.building_materials,
  "33": A.mining_metals, "34": A.mech_eng, "35": A.machinery, "36": A.elec_mfg,
  "37": A.automotive, "38": A.medical_devices, "39": A.consumer_goods,
  "40": A.trucking, "41": A.trucking, "42": A.trucking, "44": A.maritime, "45": A.airlines,
  "46": A.oil_energy, "47": A.logistics, "48": A.telecom, "49": A.utilities,
  "50": A.wholesale, "51": A.wholesale, "52": A.retail, "53": A.retail, "54": A.retail,
  "55": A.automotive, "56": A.apparel, "57": A.retail, "58": A.restaurants, "59": A.retail,
  "60": A.banking, "61": A.financial_services, "62": A.capital_markets, "63": A.insurance,
  "64": A.insurance, "65": A.real_estate, "67": A.investment_mgmt,
  "70": A.hospitality, "72": A.consumer_services, "73": A.it_services, "75": A.automotive,
  "76": A.consumer_services, "78": A.media_production, "79": A.recreation,
  "80": A.hospital_health, "81": A.legal_services, "82": A.edu_mgmt, "83": A.individual_family,
  "84": A.fine_art, "86": A.nonprofit_alt, "87": A.prof_services, "89": A.prof_services,
  "91": A.gov_admin, "92": A.gov_admin, "93": A.gov_admin, "94": A.gov_admin,
  "95": A.environmental, "96": A.gov_admin, "97": A.intl_affairs,
};

// SIC 4-digit overrides where the 2-digit is too coarse.
const SIC4: Record<string, ApolloIndustry> = {
  "7372": A.software, "7371": A.it_services, "7370": A.it_services, "7374": A.it_services,
  "7375": A.internet, "7379": A.it_services, "7389": A.prof_services, "7363": A.staffing,
  "8011": A.medical_practice, "8021": A.medical_practice, "8062": A.hospital_health,
  "8742": A.mgmt_consulting, "8721": A.accounting, "8711": A.civil_eng, "8712": A.architecture,
  "8741": A.mgmt_consulting, "8748": A.mgmt_consulting, "7311": A.marketing, "7310": A.marketing,
  "6411": A.insurance, "6311": A.insurance, "8351": A.individual_family,
};

// ── Name heuristic (last resort, no usable code) ─────────────────────
const NAME_RULES: Array<[RegExp, ApolloIndustry]> = [
  [/nations unies|united nations|\bonu\b|\boim\b|\bunhcr\b|interpol|\bwipo\b|\bilo\b|\bwho\b|\bwto\b|\bomc\b|intergovernmental|organisation internationale|world (triathlon|athletics|rugby|federation)/i, A.intl_affairs],
  [/cabinet médical|cliniqu|h[oô]pital|h[oô]pitaux|m[ée]dical|m[ée]decin|radiolog|pneumolog|orthophon|dentaire|th[ée]rap|pharma|\bems\b|sant[ée]|elderly|nursing/i, A.hospital_health],
  // sports clubs/federations before the generic nonprofit catch-all.
  [/hockey|\bfootball\b|triathlon|\bfc\b|\bhc\b|sporting|club sportif|basketball|\brugby\b/i, A.sports],
  [/fondation|foundation|\bngo\b|nonprofit|caritas|secours|croix-rouge|association|f[ée]d[ée]ration|coop[ée]rative|forest trust/i, A.nonprofit_alt],
  [/universit|\bhes\b|\bheg\b|\bhep\b|gymnase|coll[èe]ge|[ée]cole|institut|formation/i, A.edu_mgmt],
  [/canton|commune|municipalit|office cantonal|administration|[ée]tat de|service public/i, A.gov_admin],
  [/\bbanque\b|\bbank\b|crédit|caisse d['e]épargne/i, A.banking],
  [/assurance|insurance/i, A.insurance],
  // newspapers / press / publishing houses.
  [/\ble temps\b|gazette|tribune|\bpresse\b|journal|newspaper|[ée]ditions?\b|m[ée]dias?\b/i, A.publishing],
  // legal practices (en + fr).
  [/avocat|\bétude\b|notaire|\blegal\b|juridique|lawyers?\b|law firm/i, A.law_practice],
  // ground / rail / air transport + taxi + heavy haulage.
  [/\bbahn\b|railway|chemin de fer|\bsbb\b|\bcff\b|transports? publics|\btaxi\b|d[ée]m[ée]nag|heavy haul/i, A.trucking],
  [/transport|logistique|\bfret\b|freight|shipping|navitrans/i, A.logistics],
  [/automobile|\bauto\b|garage|carrosserie|v[ée]hicul/i, A.automotive],
  [/semiconduct|wireless|microelectron|\bnxp\b/i, A.semiconductors],
  [/[ée]nergie|\benergy\b|[ée]lectricit|\bgaz\b|utilit/i, A.utilities],
  [/invest|capital|\basset\b|wealth|patrimo|gestion de fortune|holding|\btrust\b/i, A.investment_mgmt],
  [/h[oô]tel|resort|h[ôo]tellerie/i, A.hospitality],
  [/restaurant|brasserie|traiteur|pizza|pizzeria/i, A.restaurants],
  [/montre|horlog|watch|\btimex\b|manufacture/i, A.consumer_goods],
  [/construction|b[âa]timent|g[ée]nie civil|entreprise g[ée]n[ée]rale|routes?\b|colas/i, A.construction],
  [/immobili[èe]r|r[ée]gie|g[ée]rance/i, A.real_estate],
  [/film|cin[ée]ma|production audiovisuelle|recordings?\b|\bmusic\b/i, A.media_production],
  [/software|logiciel|\bsaas\b|informatique|num[ée]rique|digital|\bdata\b|cyber|cloud|wireless/i, A.it_services],
  [/conseil|consulting|advisory|fiduciaire|\bpartners?\b/i, A.mgmt_consulting],
];

export interface IndustryResult {
  industry: ApolloIndustry;
  via: "naics4" | "naics3" | "naics2" | "sic4" | "sic2" | "name" | "none";
}

/** Resolve a single primary code (NAICS preferred, longest-prefix-first). */
export function apolloIndustryFromCodes(
  naicsCodes: string[] | null | undefined,
  sicCodes: string[] | null | undefined,
  name: string,
): IndustryResult {
  const naics = (naicsCodes ?? []).filter(Boolean);
  const sic = (sicCodes ?? []).filter(Boolean);

  for (const c of naics) {
    const k4 = c.slice(0, 4);
    if (N4[k4]) return { industry: N4[k4], via: "naics4" };
  }
  for (const c of naics) {
    const k3 = c.slice(0, 3);
    if (N3[k3]) return { industry: N3[k3], via: "naics3" };
  }
  for (const c of naics) {
    const k2 = c.slice(0, 2);
    if (N2[k2]) return { industry: N2[k2], via: "naics2" };
  }
  for (const c of sic) {
    const k4 = c.slice(0, 4);
    if (SIC4[k4]) return { industry: SIC4[k4], via: "sic4" };
  }
  for (const c of sic) {
    const k2 = c.slice(0, 2);
    if (SIC2[k2]) return { industry: SIC2[k2], via: "sic2" };
  }
  for (const [re, ind] of NAME_RULES) {
    if (re.test(name)) return { industry: ind, via: "name" };
  }
  return { industry: A.other, via: "none" };
}

// ── Coarse ICP sector grouping (Pilae) derived from Apollo industry ──
// Used for ICP fit scoring; keeps the fine Apollo label intact.
const SECTOR_OF: Record<string, string> = {};
const put = (sector: string, ...inds: string[]) => inds.forEach((i) => (SECTOR_OF[i] = sector));
put("Santé", A.hospital_health, A.medical_practice, A.medical_devices, A.pharma, A.biotech, A.wellness, A.mental_health, A.individual_family);
put("Public / parapublic", A.gov_admin, A.public_safety, A.legislative);
put("Éducation / formation", A.higher_ed, A.edu_mgmt, A.primary_secondary, A.elearning, A.training, A.research);
put("Fondation / association / ONG", A.nonprofit, A.nonprofit_alt, A.civic, A.religious, A.philanthropy);
put("Industrie / production", A.machinery, A.mech_eng, A.elec_mfg, A.industrial_automation, A.automotive, A.aerospace, A.food_production, A.chemicals, A.plastics, A.textiles, A.mining_metals, A.oil_energy, A.utilities, A.renewables, A.building_materials, A.packaging, A.semiconductors, A.hardware);
put("Construction / immobilier", A.construction, A.civil_eng, A.architecture, A.real_estate, A.commercial_re);
put("Commerce / distribution", A.wholesale, A.retail, A.consumer_goods, A.apparel, A.cosmetics, A.furniture, A.food_bev);
put("Hôtellerie / restauration / tourisme", A.hospitality, A.restaurants, A.leisure_travel, A.recreation);
put("Transport / logistique", A.logistics, A.trucking, A.maritime, A.airlines, A.freight, A.warehousing);
put("Médias / culture / loisirs", A.publishing, A.online_media, A.broadcast, A.media_production, A.entertainment, A.performing_arts, A.music, A.sports, A.computer_games, A.fine_art, A.events);
put("Services professionnels", A.mgmt_consulting, A.accounting, A.legal_services, A.law_practice, A.marketing, A.pr, A.design, A.hr, A.staffing, A.outsourcing, A.facilities, A.security_investigations, A.prof_services, A.consumer_services, A.environmental, A.farming);
put("Finance / assurance", A.banking, A.financial_services, A.investment_mgmt, A.capital_markets, A.insurance, A.vc);
put("Tech / IT", A.it_services, A.info_services, A.internet, A.software, A.netsec, A.telecom);
put("Organisation internationale", A.intl_affairs, A.intl_trade);

export function icpSectorOf(industry: string): string {
  return SECTOR_OF[industry] ?? "Autre";
}

// Pilae ICP fit tier per coarse sector (low-tech / public / health / NGO
// are high-fit; finance/tech lower; IGO lowest).
export const SECTOR_TIER: Record<string, number> = {
  "Santé": 0.85,
  "Public / parapublic": 0.8,
  "Éducation / formation": 0.8,
  "Fondation / association / ONG": 0.78,
  "Commerce / distribution": 0.72,
  "Hôtellerie / restauration / tourisme": 0.72,
  "Industrie / production": 0.7,
  "Transport / logistique": 0.7,
  "Construction / immobilier": 0.68,
  "Médias / culture / loisirs": 0.6,
  "Services professionnels": 0.55,
  "Finance / assurance": 0.5,
  "Tech / IT": 0.4,
  "Organisation internationale": 0.25,
  "Autre": 0.5,
};

export function gradeOf(score: number): string {
  return score >= 0.75 ? "A" : score >= 0.6 ? "B" : score >= 0.45 ? "C" : "D";
}
