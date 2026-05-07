/**
 * ICP filter constants — single source of truth
 * Aligned with Apollo/LinkedIn taxonomy for direct API compatibility
 */

// Apollo/LinkedIn industry taxonomy (113 industries)
export const INDUSTRIES = [
  "Accounting", "Airlines/Aviation", "Alternative Medicine", "Animation",
  "Apparel & Fashion", "Architecture & Planning", "Automotive",
  "Aviation & Aerospace", "Banking", "Biotechnology", "Broadcast Media",
  "Building Materials", "Business Supplies and Equipment", "Capital Markets",
  "Chemicals", "Civil Engineering", "Commercial Real Estate",
  "Computer & Network Security", "Computer Games", "Computer Hardware",
  "Computer Networking", "Computer Software", "Construction",
  "Consumer Electronics", "Consumer Goods", "Consumer Services", "Cosmetics",
  "Defense & Space", "Design", "E-Learning", "Education Management",
  "Electrical/Electronic Manufacturing", "Entertainment",
  "Environmental Services", "Events Services", "Facilities Services",
  "Farming", "Financial Services", "Fine Art", "Food & Beverages",
  "Food Production", "Fund-Raising", "Furniture", "Gambling & Casinos",
  "Glass, Ceramics & Concrete", "Government Administration",
  "Graphic Design", "Health, Wellness and Fitness", "Higher Education",
  "Hospital & Health Care", "Hospitality", "Human Resources",
  "Import and Export", "Individual & Family Services", "Industrial Automation",
  "Information Services", "Information Technology and Services", "Insurance",
  "International Trade and Development", "Internet", "Investment Banking",
  "Investment Management", "Law Practice", "Legal Services",
  "Leisure, Travel & Tourism", "Logistics and Supply Chain",
  "Luxury Goods & Jewelry", "Machinery", "Management Consulting", "Maritime",
  "Market Research", "Marketing and Advertising", "Mechanical or Industrial Engineering",
  "Media Production", "Medical Devices", "Medical Practice", "Mental Health Care",
  "Mining & Metals", "Music", "Nanotechnology", "Newspapers",
  "Non-Profit Organization Management", "Oil & Energy", "Online Media",
  "Outsourcing/Offshoring", "Package/Freight Delivery", "Packaging and Containers",
  "Paper & Forest Products", "Performing Arts", "Pharmaceuticals", "Photography",
  "Plastics", "Primary/Secondary Education", "Printing",
  "Professional Training & Coaching", "Public Relations and Communications",
  "Publishing", "Real Estate", "Recreational Facilities and Services",
  "Renewables & Environment", "Research", "Restaurants", "Retail",
  "Security and Investigations", "Semiconductors", "Shipbuilding",
  "Sporting Goods", "Sports", "Staffing and Recruiting", "Supermarkets",
  "Telecommunications", "Textiles", "Think Tanks", "Translation and Localization",
  "Transportation/Trucking/Railroad", "Utilities",
  "Venture Capital & Private Equity", "Veterinary", "Warehousing", "Wholesale",
  "Wine and Spirits", "Wireless", "Writing and Editing",
] as const;

// Apollo employee count ranges — exact API buckets (8 official ranges)
export const COMPANY_SIZES = [
  "1-10", "11-50", "51-200", "201-500",
  "501-1,000", "1,001-5,000", "5,001-10,000", "10,001+",
] as const;

export const SALES_MOTIONS = [
  "Founder-led sales", "Small sales team", "SDR / AE split", "Product-led (PLG)",
] as const;

// Apollo seniority + department taxonomy for decision-maker targeting
export const JOB_SENIORITIES = [
  "Owner", "Founder", "C-Suite", "Partner", "VP",
  "Head", "Director", "Manager", "Senior", "Entry",
] as const;

export const JOB_DEPARTMENTS = [
  "Engineering", "Sales", "Marketing", "Finance", "Operations",
  "IT", "Human Resources", "Legal", "Product", "Design",
  "Customer Success", "Business Development", "Data Science",
  "Security", "DevOps", "Support", "Research", "Consulting",
  "Supply Chain", "Procurement", "Communications", "Strategy",
] as const;

// Combined roles: seniority + department combos + common titles
export const DECISION_MAKER_ROLES = [
  // C-level
  "CEO", "CTO", "CFO", "COO", "CMO", "CIO", "CISO", "CRO", "CPO", "CDO",
  // VP level
  "VP Engineering", "VP Sales", "VP Marketing", "VP Product", "VP Operations",
  "VP Finance", "VP Human Resources", "VP Business Development", "VP IT",
  "VP Customer Success", "VP Design", "VP Data",
  // Head / Director
  "Head of Engineering", "Head of Sales", "Head of Marketing", "Head of Product",
  "Head of Growth", "Head of Operations", "Head of People", "Head of Design",
  "Head of Data", "Head of Security", "Head of IT", "Head of Legal",
  "Director of Engineering", "Director of Sales", "Director of Marketing",
  "Director of Product", "Director of Operations", "Director of Finance",
  "Director of IT", "Director of HR", "Director of Business Development",
  // Founder / Owner
  "Founder", "Co-Founder", "Owner", "Partner", "Managing Partner",
  // Manager
  "Engineering Manager", "Sales Manager", "Marketing Manager",
  "Product Manager", "Project Manager", "Account Manager",
  "IT Manager", "Operations Manager",
] as const;

// Apollo geography taxonomy — regions + major countries
export const GEOGRAPHIES = [
  // Regions
  "North America", "South America", "Europe", "Western Europe", "Eastern Europe",
  "Northern Europe", "Southern Europe", "Asia", "Southeast Asia", "East Asia",
  "South Asia", "Middle East", "Africa", "Oceania", "Central America", "Caribbean",
  // Major countries
  "United States", "Canada", "United Kingdom", "France", "Germany", "Spain", "Italy",
  "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark",
  "Finland", "Ireland", "Portugal", "Poland", "Czech Republic", "Romania", "Greece",
  "Turkey", "Israel", "United Arab Emirates", "Saudi Arabia", "Qatar",
  "India", "China", "Japan", "South Korea", "Singapore", "Australia", "New Zealand",
  "Indonesia", "Thailand", "Vietnam", "Philippines", "Malaysia", "Taiwan",
  "Brazil", "Mexico", "Argentina", "Colombia", "Chile",
  "South Africa", "Nigeria", "Kenya", "Egypt", "Morocco",
  // US regions
  "US - Northeast", "US - Southeast", "US - Midwest", "US - West", "US - Southwest",
  // US states (top markets)
  "California", "New York", "Texas", "Florida", "Illinois", "Massachusetts",
  "Washington", "Colorado", "Georgia", "Pennsylvania", "Virginia", "North Carolina",
  "Ohio", "Michigan", "New Jersey", "Arizona", "Oregon", "Minnesota", "Maryland",
  "Connecticut", "Utah", "Tennessee", "Missouri", "Indiana", "Wisconsin",
] as const;


/**
 * BUG-WS0-007: Convert UI seniority labels (JOB_SENIORITIES) to Apollo API
 * format. Apollo expects lowercase snake_case: "c_suite", "vp", "director",
 * "manager", "senior", "entry", "owner", "founder", "partner", "head".
 * Returns fallback defaults if the input is empty.
 */
const SENIORITY_TO_APOLLO: Record<string, string> = {
  "Owner": "owner",
  "Founder": "founder",
  "C-Suite": "c_suite",
  "Partner": "partner",
  "VP": "vp",
  "Head": "head",
  "Director": "director",
  "Manager": "manager",
  "Senior": "senior",
  "Entry": "entry",
};

export function senioritiesToApollo(uiSeniorities: string[]): string[] {
  const mapped = uiSeniorities
    .map((s) => SENIORITY_TO_APOLLO[s] || s.toLowerCase().replace(/[- ]/g, "_"))
    .filter(Boolean);
  return mapped.length > 0 ? mapped : ["c_suite", "vp", "director"];
}

/** Convert UI size labels to Apollo API format: "501-1,000" → "501,1000" */
export function sizesToApolloRanges(sizes: string[]): string[] {
  return sizes.map((s) => {
    const clean = s.replace(/,/g, "");
    if (clean.endsWith("+")) return clean.slice(0, -1) + ",";
    return clean.replace("-", ",");
  });
}

/** Build the industry list fragment for AI prompts (just the taxonomy name, not all 113 values) */
export function industriesPromptHint(): string {
  return "Use the Apollo/LinkedIn industry taxonomy labels exactly (e.g. 'Computer Software', 'Financial Services', 'Hospital & Health Care'). Only use labels from that standard taxonomy.";
}

/** Build the company sizes fragment for AI prompts */
export function companySizesPromptHint(): string {
  return `Use these exact ranges: ${COMPANY_SIZES.join(", ")}`;
}
