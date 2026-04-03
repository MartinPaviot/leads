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

// Apollo employee count ranges — exact API buckets
export const COMPANY_SIZES = [
  "1-10", "11-20", "21-50", "51-100", "101-200",
  "201-500", "501-1,000", "1,001-2,000", "2,001-5,000", "5,001-10,000", "10,001+",
] as const;

export const SALES_MOTIONS = [
  "Founder-led sales", "Small sales team", "SDR / AE split", "Product-led (PLG)",
] as const;


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
