/**
 * Map the current dashboard route to a chat "surface" so the floating
 * chat dock is page-aware without any per-page wiring.
 *
 * `usePathname()` returns the URL with route groups like `(dashboard)`
 * already stripped, so we match on the clean path (e.g. "/accounts/123").
 *
 * The contract mirrors what ScopedChat already POSTs to /api/chat:
 *   { contextType: "account" | "contact" | "deal" | "meeting" | "list",
 *     contextId }
 * The backend's inferSurface() turns that into a SurfaceContext and the
 * capability resolver seeds the right surface prompt. We never pass a
 * `surface` object directly — contextType/contextId is the stable
 * interface both surfaces share.
 */

export type ChatContextType = "account" | "contact" | "deal" | "meeting" | "list";

export type SurfaceIcon =
  | "building"
  | "user"
  | "deal"
  | "calendar"
  | "list"
  | "globe";

export interface DerivedSurface {
  /** Posted to /api/chat as `contextType`. Undefined for a global surface. */
  contextType?: ChatContextType;
  /** Posted to /api/chat as `contextId`: an entity id, or a list resource name. */
  contextId?: string;
  /** Short label for the context chip, e.g. "Account", "Pipeline". */
  label: string;
  /** Icon key for the chip. */
  icon: SurfaceIcon;
  /**
   * Page-aware noun for the empty state, e.g. "this account", "your
   * pipeline", "your workspace".
   */
  scopeNoun: string;
  /** When true the dock should not render at all (e.g. the full /chat page). */
  hidden?: boolean;
}

/** Entity detail routes: first segment → its scoped surface descriptor. */
const ENTITY_ROUTES: Record<
  string,
  { contextType: ChatContextType; label: string; icon: SurfaceIcon; scopeNoun: string }
> = {
  accounts: { contextType: "account", label: "Account", icon: "building", scopeNoun: "this account" },
  contacts: { contextType: "contact", label: "Contact", icon: "user", scopeNoun: "this contact" },
  opportunities: { contextType: "deal", label: "Deal", icon: "deal", scopeNoun: "this deal" },
  meetings: { contextType: "meeting", label: "Meeting", icon: "calendar", scopeNoun: "this meeting" },
};

/** List routes: first segment → its list surface descriptor. */
const LIST_ROUTES: Record<
  string,
  { resource: string; label: string; icon: SurfaceIcon; scopeNoun: string }
> = {
  accounts: { resource: "accounts", label: "Accounts", icon: "list", scopeNoun: "your accounts" },
  contacts: { resource: "contacts", label: "Contacts", icon: "list", scopeNoun: "your contacts" },
  opportunities: { resource: "opportunities", label: "Pipeline", icon: "list", scopeNoun: "your pipeline" },
  meetings: { resource: "meetings", label: "Meetings", icon: "calendar", scopeNoun: "your meetings" },
  tasks: { resource: "tasks", label: "Tasks", icon: "list", scopeNoun: "your tasks" },
  sequences: { resource: "sequences", label: "Sequences", icon: "list", scopeNoun: "your sequences" },
  proposals: { resource: "proposals", label: "Proposals", icon: "list", scopeNoun: "your proposals" },
};

/** Global routes that aren't lists but deserve a page-aware label. */
const GLOBAL_LABELS: Record<string, { label: string; icon: SurfaceIcon }> = {
  "": { label: "Home", icon: "globe" },
  home: { label: "Home", icon: "globe" },
  inbox: { label: "Inbox", icon: "globe" },
  insights: { label: "Insights", icon: "globe" },
  reports: { label: "Reports", icon: "globe" },
  "call-mode": { label: "Call Mode", icon: "globe" },
  knowledge: { label: "Knowledge", icon: "globe" },
  notes: { label: "Notes", icon: "globe" },
  skills: { label: "Skills", icon: "globe" },
  deliverability: { label: "Deliverability", icon: "globe" },
  settings: { label: "Settings", icon: "globe" },
};

/**
 * Second segments under an entity route that are NOT record ids (so we
 * keep the surface at list level instead of treating them as a detail).
 */
const RESERVED_SUBPATHS = new Set(["new", "import", "create"]);

const GLOBAL_FALLBACK: DerivedSurface = {
  label: "Workspace",
  icon: "globe",
  scopeNoun: "your workspace",
};

export function deriveSurface(pathname: string | null | undefined): DerivedSurface {
  if (!pathname) return GLOBAL_FALLBACK;

  // Normalise: drop query/hash, trailing slash, then split.
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean);

  // The full chat page owns its own composer — hide the dock there.
  if (segments[0] === "chat") {
    return { ...GLOBAL_FALLBACK, hidden: true };
  }

  // Root / home → global workspace surface.
  if (segments.length === 0) {
    return { label: "Home", icon: "globe", scopeNoun: "your workspace" };
  }

  const [first, second] = segments;
  const isDetail = Boolean(second) && !RESERVED_SUBPATHS.has(second);

  // Entity detail page (e.g. /accounts/<id>) → entity-scoped surface.
  if (isDetail && ENTITY_ROUTES[first]) {
    const e = ENTITY_ROUTES[first];
    return {
      contextType: e.contextType,
      contextId: second,
      label: e.label,
      icon: e.icon,
      scopeNoun: e.scopeNoun,
    };
  }

  // List page (e.g. /contacts) → list surface seeded with the resource.
  if (LIST_ROUTES[first]) {
    const l = LIST_ROUTES[first];
    return {
      contextType: "list",
      contextId: l.resource,
      label: l.label,
      icon: l.icon,
      scopeNoun: l.scopeNoun,
    };
  }

  // Known global page → labelled global surface.
  if (GLOBAL_LABELS[first]) {
    const g = GLOBAL_LABELS[first];
    return { label: g.label, icon: g.icon, scopeNoun: "your workspace" };
  }

  // Anything else (custom objects, unknown routes) → generic global.
  return GLOBAL_FALLBACK;
}
