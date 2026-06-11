/**
 * Industry → icon + color, the single source of truth for how an industry
 * value renders anywhere in the app (accounts table, account detail,
 * slide-over, call-mode fiche, ICP editor).
 *
 * SCOPE — presentation tokens only. The keys are Apollo's industry taxonomy
 * (the LinkedIn v1 set, same vocabulary as lib/icp/naics-to-apollo-industry),
 * which is a fixed, enumerable vocabulary — NOT free text. This is therefore
 * a design-token table like LIFECYCLE_CONFIG, not a classification list:
 * unknown labels are never guessed into a sector; they get a deterministic
 * neutral style (hash-picked hue + generic icon). Semantic matching of free
 * text stays LLM-side (see feedback: no hardcoded matching).
 *
 * Colors come in CSS-variable pairs (--ind-<family> / --ind-<family>-bg)
 * defined in globals.css with separate light and dark values, so badges hold
 * AA contrast in both themes — unlike the legacy 10-hue badge palette which
 * has a single set of values.
 */

import {
  // tech
  Cpu, Code, Globe, ShieldCheck, Network, CircuitBoard, RadioTower, Wifi,
  HardDrive, Database, Gamepad2, Atom, Smartphone,
  // health
  Stethoscope, Hospital, Pill, Dna, Activity, Brain, Dumbbell, Leaf, PawPrint,
  // finance
  Landmark, Banknote, TrendingUp, Umbrella, Sprout, Calculator, PiggyBank,
  // public sector
  Flag, Handshake, ScrollText, Lightbulb, Vote, Siren, Gavel, Shield,
  // nonprofit & community
  HeartHandshake, Users, HandHeart, Baby, Church, Library,
  // education
  GraduationCap, School, Backpack, Laptop, Presentation, FlaskConical, BookOpen,
  // professional services
  Briefcase, Megaphone, MessageSquare, PenTool, Palette, Scale, UserCheck,
  UserPlus, ClipboardList, Calendar, Wrench, Fingerprint, Layers, Languages,
  // manufacturing
  Cog, Plug, Bot, Car, Rocket, Satellite, TestTube, Scissors, Armchair,
  Package, TreePine, Printer, Ship, Box, Boxes, Factory,
  // energy & resources
  Fuel, Zap, Wind, Recycle, Pickaxe,
  // agrifood
  Tractor, Beef, Milk, Fish, Wheat, UtensilsCrossed, Wine, Cigarette,
  // transport & logistics
  Truck, Plane, Anchor, PackageCheck, PackageSearch, Warehouse, Container,
  // construction & real estate
  HardHat, TrafficCone, DraftingCompass, BrickWall, Building, Building2, KeyRound,
  // consumer & hospitality
  Store, ShoppingBag, ShoppingCart, ConciergeBell, Shirt, Sparkles, Gem, Medal,
  Brush, Hotel, ChefHat, Luggage, Bike, Dices,
  // media & entertainment
  Newspaper, Rss, Clapperboard, Film, Music, Drama, Camera, PartyPopper,
  Trophy, Feather,
  type LucideIcon,
} from "lucide-react";

export type IndustryFamily =
  | "tech" | "services" | "finance" | "health" | "public" | "nonprofit"
  | "education" | "manufacturing" | "energy" | "agrifood" | "transport"
  | "construction" | "consumer" | "media";

export interface IndustryStyle {
  icon: LucideIcon;
  /** Text + icon color — CSS var, theme-aware. */
  color: string;
  /** Soft tint background — CSS var, theme-aware. */
  bg: string;
  family: IndustryFamily;
  /** True when the value is part of the curated taxonomy (not a fallback). */
  explicit: boolean;
}

const FAMILY_TOKENS: Record<IndustryFamily, { color: string; bg: string }> = {
  tech: { color: "var(--ind-tech)", bg: "var(--ind-tech-bg)" },
  services: { color: "var(--ind-services)", bg: "var(--ind-services-bg)" },
  finance: { color: "var(--ind-finance)", bg: "var(--ind-finance-bg)" },
  health: { color: "var(--ind-health)", bg: "var(--ind-health-bg)" },
  public: { color: "var(--ind-public)", bg: "var(--ind-public-bg)" },
  nonprofit: { color: "var(--ind-nonprofit)", bg: "var(--ind-nonprofit-bg)" },
  education: { color: "var(--ind-education)", bg: "var(--ind-education-bg)" },
  manufacturing: { color: "var(--ind-manufacturing)", bg: "var(--ind-manufacturing-bg)" },
  energy: { color: "var(--ind-energy)", bg: "var(--ind-energy-bg)" },
  agrifood: { color: "var(--ind-agrifood)", bg: "var(--ind-agrifood-bg)" },
  transport: { color: "var(--ind-transport)", bg: "var(--ind-transport-bg)" },
  construction: { color: "var(--ind-construction)", bg: "var(--ind-construction-bg)" },
  consumer: { color: "var(--ind-consumer)", bg: "var(--ind-consumer-bg)" },
  media: { color: "var(--ind-media)", bg: "var(--ind-media-bg)" },
};

/** Human labels for the 14 sector families — UI display SSOT (chips, tabs). */
export const FAMILY_LABELS: Record<IndustryFamily, string> = {
  tech: "Tech",
  services: "Services",
  finance: "Finance",
  health: "Health",
  public: "Public sector",
  nonprofit: "Non-profit",
  education: "Education",
  manufacturing: "Manufacturing",
  energy: "Energy",
  agrifood: "Agri-food",
  transport: "Transport",
  construction: "Construction",
  consumer: "Consumer",
  media: "Media",
};

/** Stable order for the hash fallback — appending families keeps old picks. */
const FAMILY_ORDER: IndustryFamily[] = [
  "tech", "services", "finance", "health", "public", "nonprofit", "education",
  "manufacturing", "energy", "agrifood", "transport", "construction",
  "consumer", "media",
];

type Entry = [IndustryFamily, LucideIcon];

/**
 * The full Apollo / LinkedIn-v1 industry taxonomy. Keys are Apollo's exact
 * lowercase spelling (same strings naics-to-apollo-industry emits and the
 * companies.industry column stores).
 */
const INDUSTRY_ENTRIES: Record<string, Entry> = {
  // ── Tech ──────────────────────────────────────────────────────────
  "information technology & services": ["tech", Cpu],
  "computer software": ["tech", Code],
  "internet": ["tech", Globe],
  "computer & network security": ["tech", ShieldCheck],
  "computer networking": ["tech", Network],
  "computer hardware": ["tech", HardDrive],
  "semiconductors": ["tech", CircuitBoard],
  "telecommunications": ["tech", RadioTower],
  "wireless": ["tech", Wifi],
  "information services": ["tech", Database],
  "computer games": ["tech", Gamepad2],
  "nanotechnology": ["tech", Atom],
  "consumer electronics": ["tech", Smartphone],

  // ── Health & life sciences ────────────────────────────────────────
  "hospital & health care": ["health", Hospital],
  "medical practice": ["health", Stethoscope],
  "medical devices": ["health", Activity],
  "pharmaceuticals": ["health", Pill],
  "biotechnology": ["health", Dna],
  "mental health care": ["health", Brain],
  "health, wellness & fitness": ["health", Dumbbell],
  "alternative medicine": ["health", Leaf],
  "veterinary": ["health", PawPrint],

  // ── Finance ───────────────────────────────────────────────────────
  "banking": ["finance", Landmark],
  "financial services": ["finance", Banknote],
  "investment management": ["finance", TrendingUp],
  "investment banking": ["finance", TrendingUp],
  "capital markets": ["finance", TrendingUp],
  "insurance": ["finance", Umbrella],
  "venture capital & private equity": ["finance", Sprout],
  "accounting": ["finance", Calculator],

  // ── Public sector ─────────────────────────────────────────────────
  "government administration": ["public", Landmark],
  "government relations": ["public", Handshake],
  "public policy": ["public", ScrollText],
  "international affairs": ["public", Flag],
  "international trade & development": ["public", Handshake],
  "legislative office": ["public", ScrollText],
  "judiciary": ["public", Gavel],
  "law enforcement": ["public", Shield],
  "military": ["public", Shield],
  "public safety": ["public", Siren],
  "think tanks": ["public", Lightbulb],
  "political organization": ["public", Vote],
  "other": ["public", Building],

  // ── Non-profit & community ────────────────────────────────────────
  "nonprofit organization management": ["nonprofit", HeartHandshake],
  "non-profit organization management": ["nonprofit", HeartHandshake],
  "civic & social organization": ["nonprofit", Users],
  "philanthropy": ["nonprofit", HandHeart],
  "fund-raising": ["nonprofit", PiggyBank],
  "individual & family services": ["nonprofit", Baby],
  "religious institutions": ["nonprofit", Church],
  "museums & institutions": ["nonprofit", Landmark],
  "libraries": ["nonprofit", Library],

  // ── Education ─────────────────────────────────────────────────────
  "higher education": ["education", GraduationCap],
  "education management": ["education", School],
  "primary/secondary education": ["education", Backpack],
  "e-learning": ["education", Laptop],
  "professional training & coaching": ["education", Presentation],
  "research": ["education", FlaskConical],

  // ── Professional services ─────────────────────────────────────────
  "management consulting": ["services", Briefcase],
  "marketing & advertising": ["services", Megaphone],
  "public relations & communications": ["services", MessageSquare],
  "design": ["services", PenTool],
  "graphic design": ["services", Palette],
  "legal services": ["services", Scale],
  "law practice": ["services", Scale],
  "alternative dispute resolution": ["services", Scale],
  "human resources": ["services", UserCheck],
  "staffing & recruiting": ["services", UserPlus],
  "market research": ["services", ClipboardList],
  "events services": ["services", Calendar],
  "professional services": ["services", Briefcase],
  "outsourcing/offshoring": ["services", Globe],
  "facilities services": ["services", Wrench],
  "security & investigations": ["services", Fingerprint],
  "executive office": ["services", Briefcase],
  "program development": ["services", Layers],
  "translation & localization": ["services", Languages],
  "business supplies & equipment": ["services", Package],

  // ── Manufacturing & industrial ────────────────────────────────────
  "machinery": ["manufacturing", Cog],
  "mechanical or industrial engineering": ["manufacturing", Wrench],
  "electrical/electronic manufacturing": ["manufacturing", Plug],
  "industrial automation": ["manufacturing", Bot],
  "automotive": ["manufacturing", Car],
  "aviation & aerospace": ["manufacturing", Rocket],
  "defense & space": ["manufacturing", Satellite],
  "chemicals": ["manufacturing", TestTube],
  "plastics": ["manufacturing", Layers],
  "textiles": ["manufacturing", Scissors],
  "furniture": ["manufacturing", Armchair],
  "packaging & containers": ["manufacturing", Package],
  "paper & forest products": ["manufacturing", TreePine],
  "printing": ["manufacturing", Printer],
  "shipbuilding": ["manufacturing", Ship],
  "glass, ceramics & concrete": ["manufacturing", Box],
  "railroad manufacture": ["manufacturing", Factory],

  // ── Energy & resources ────────────────────────────────────────────
  "oil & energy": ["energy", Fuel],
  "utilities": ["energy", Zap],
  "renewables & environment": ["energy", Wind],
  "environmental services": ["energy", Recycle],
  "mining & metals": ["energy", Pickaxe],

  // ── Agrifood ──────────────────────────────────────────────────────
  "farming": ["agrifood", Tractor],
  "ranching": ["agrifood", Beef],
  "dairy": ["agrifood", Milk],
  "fishery": ["agrifood", Fish],
  "food production": ["agrifood", Wheat],
  "food & beverages": ["agrifood", UtensilsCrossed],
  "wine & spirits": ["agrifood", Wine],
  "tobacco": ["agrifood", Cigarette],

  // ── Transport & logistics ─────────────────────────────────────────
  "logistics & supply chain": ["transport", PackageSearch],
  "transportation/trucking/railroad": ["transport", Truck],
  "airlines/aviation": ["transport", Plane],
  "maritime": ["transport", Anchor],
  "package/freight delivery": ["transport", PackageCheck],
  "warehousing": ["transport", Warehouse],
  "import & export": ["transport", Container],

  // ── Construction & real estate ────────────────────────────────────
  "construction": ["construction", HardHat],
  "civil engineering": ["construction", TrafficCone],
  "architecture & planning": ["construction", DraftingCompass],
  "building materials": ["construction", BrickWall],
  "real estate": ["construction", Building2],
  "commercial real estate": ["construction", KeyRound],

  // ── Consumer & hospitality ────────────────────────────────────────
  "retail": ["consumer", Store],
  "wholesale": ["consumer", Boxes],
  "supermarkets": ["consumer", ShoppingCart],
  "consumer goods": ["consumer", ShoppingBag],
  "consumer services": ["consumer", ConciergeBell],
  "apparel & fashion": ["consumer", Shirt],
  "cosmetics": ["consumer", Sparkles],
  "luxury goods & jewelry": ["consumer", Gem],
  "sporting goods": ["consumer", Medal],
  "arts & crafts": ["consumer", Brush],
  "hospitality": ["consumer", Hotel],
  "restaurants": ["consumer", ChefHat],
  "leisure, travel & tourism": ["consumer", Luggage],
  "recreational facilities & services": ["consumer", Bike],
  "gambling & casinos": ["consumer", Dices],

  // ── Media & entertainment ─────────────────────────────────────────
  "publishing": ["media", BookOpen],
  "newspapers": ["media", Newspaper],
  "online media": ["media", Rss],
  "broadcast media": ["media", RadioTower],
  "media production": ["media", Clapperboard],
  "motion pictures & film": ["media", Film],
  "animation": ["media", Sparkles],
  "music": ["media", Music],
  "performing arts": ["media", Drama],
  "fine art": ["media", Palette],
  "photography": ["media", Camera],
  "entertainment": ["media", PartyPopper],
  "sports": ["media", Trophy],
  "writing & editing": ["media", Feather],
};

const FALLBACK_ICON: LucideIcon = Building;

function normalize(value: string): string {
  // One taxonomy, two official spellings: Apollo writes "marketing &
  // advertising", the LinkedIn/ICP-picker form writes "Marketing and
  // Advertising". Canonicalize on "&" — this is spelling normalization
  // within the fixed vocabulary, not synonym matching.
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/ and /g, " & ");
}

/** Same djb2-style hash the legacy badge palette uses — deterministic. */
function hashIndex(str: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

/**
 * Resolve any industry value to its render style. Never throws; unknown or
 * empty values get a stable neutral fallback so imported free-text labels
 * still render coherently.
 */
export function industryStyle(value: string | null | undefined): IndustryStyle {
  const key = value ? normalize(value) : "";
  if (!key) {
    return { icon: FALLBACK_ICON, ...FAMILY_TOKENS.public, family: "public", explicit: false };
  }
  const entry = INDUSTRY_ENTRIES[key];
  if (entry) {
    const [family, icon] = entry;
    return { icon, ...FAMILY_TOKENS[family], family, explicit: true };
  }
  const family = FAMILY_ORDER[hashIndex(key, FAMILY_ORDER.length)];
  return { icon: FALLBACK_ICON, ...FAMILY_TOKENS[family], family, explicit: false };
}

/** Icon-only accessor for monochrome chip contexts (call-mode fiche, ICP editor). */
export function industryIcon(value: string | null | undefined): LucideIcon {
  return industryStyle(value).icon;
}

/** Exported for tests — the curated vocabulary. */
export const INDUSTRY_VOCABULARY: ReadonlyArray<string> = Object.keys(INDUSTRY_ENTRIES);
