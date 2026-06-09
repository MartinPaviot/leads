/**
 * Tech-stack fingerprint catalog — first-principles, keyless detection of the
 * SaaS an organisation actually runs, from its public homepage. This is the
 * grounded source for Pilae's "SaaS remplaçable" trigger, where Apollo returns
 * nothing (Apollo masks firmographics; see reference_apollo-search-masks-firmographics).
 *
 * Each fingerprint declares the concrete signatures that PROVE a tool is in
 * use (a script host, an HTTP header, a <meta generator>, a cookie name, an
 * HTML marker) and whether it is "replaceable" — i.e. a proprietary SaaS that
 * Pilae's open-source / sovereign offer could substitute. Analytics / CDN /
 * infra are detected but flagged replaceable:false (not the target).
 *
 * Detection is DETERMINISTIC pattern matching, never an LLM guess: every hit
 * carries the exact signature that proved it, so the rep can stand behind it.
 *
 * Pure data + types; the matcher lives in detect.ts.
 */

export type TechCategory =
  | "crm"
  | "erp"
  | "office"
  | "cms"
  | "ecommerce"
  | "email_marketing"
  | "support"
  | "analytics"
  | "infra"
  | "other";

export interface Fingerprint {
  id: string;
  name: string;
  category: TechCategory;
  /** True = a proprietary SaaS Pilae's offer could replace (the trigger). */
  replaceable: boolean;
  /** Substring match against each <script src> host (lowercased). */
  scriptHosts?: string[];
  /** Tested against the raw HTML body. */
  htmlPatterns?: RegExp[];
  /** Tested against response headers (name lowercased, value matched). */
  headerMatch?: Array<{ name: string; pattern: RegExp }>;
  /** Tested against the <meta name="generator"> content. */
  metaGenerator?: RegExp;
  /** Tested against Set-Cookie names. */
  cookies?: RegExp[];
}

export const FINGERPRINTS: Fingerprint[] = [
  // ── CRM ──────────────────────────────────────────────────────
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    replaceable: true,
    scriptHosts: ["salesforce.com", "force.com", "pardot.com", "pi.pardot.com"],
    htmlPatterns: [/pardot/i],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    replaceable: true,
    scriptHosts: ["hs-scripts.com", "hsforms.net", "hubspot.com", "hs-analytics.net", "hscollectedforms.net"],
    cookies: [/^hubspotutk$/i, /^__hs/i],
  },
  {
    id: "dynamics",
    name: "Microsoft Dynamics",
    category: "crm",
    replaceable: true,
    scriptHosts: ["dynamics.com"],
  },
  {
    id: "zoho",
    name: "Zoho",
    category: "crm",
    replaceable: true,
    scriptHosts: ["zoho.com", "zohopublic.com", "zohocdn.com"],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "crm",
    replaceable: true,
    scriptHosts: ["pipedrive.com", "pipedriveassets.com"],
  },
  // ── ERP / gestion ────────────────────────────────────────────
  {
    id: "sap",
    name: "SAP",
    category: "erp",
    replaceable: true,
    scriptHosts: ["sapanywhere.com", "hana.ondemand.com"],
    htmlPatterns: [/\bsap[-\s]?(ui5|fiori|hybris)\b/i],
  },
  {
    id: "odoo",
    name: "Odoo",
    category: "erp",
    replaceable: true,
    scriptHosts: ["odoo.com", "odoocdn.com"],
    htmlPatterns: [/\bodoo\b/i],
    metaGenerator: /odoo/i,
  },
  {
    id: "sage",
    name: "Sage",
    category: "erp",
    replaceable: true,
    scriptHosts: ["sage.com"],
  },
  // ── Bureautique / collaboration ──────────────────────────────
  {
    id: "microsoft365",
    name: "Microsoft 365",
    category: "office",
    replaceable: true,
    scriptHosts: ["office.com", "office365.com", "sharepoint.com", "outlook.com"],
    headerMatch: [{ name: "x-powered-by", pattern: /asp\.net/i }],
  },
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "office",
    replaceable: true,
    htmlPatterns: [/google\.com\/a\/|googleapps|gsuite/i],
  },
  // ── CMS / site ───────────────────────────────────────────────
  {
    id: "wordpress",
    name: "WordPress",
    category: "cms",
    replaceable: true,
    htmlPatterns: [/\/wp-(content|includes)\//i],
    metaGenerator: /wordpress/i,
  },
  {
    id: "wix",
    name: "Wix",
    category: "cms",
    replaceable: true,
    scriptHosts: ["wixstatic.com", "parastorage.com"],
    metaGenerator: /wix\.com/i,
  },
  {
    id: "squarespace",
    name: "Squarespace",
    category: "cms",
    replaceable: true,
    scriptHosts: ["squarespace.com", "squarespace-cdn.com"],
    metaGenerator: /squarespace/i,
  },
  {
    id: "drupal",
    name: "Drupal",
    category: "cms",
    replaceable: true,
    htmlPatterns: [/Drupal\.settings|\/sites\/(all|default)\/(themes|modules)\//],
    headerMatch: [{ name: "x-generator", pattern: /drupal/i }, { name: "x-drupal-cache", pattern: /.*/ }],
    metaGenerator: /drupal/i,
  },
  {
    id: "typo3",
    name: "TYPO3",
    category: "cms",
    replaceable: true,
    htmlPatterns: [/typo3temp|\/typo3conf\//i],
    metaGenerator: /typo3/i,
  },
  {
    id: "webflow",
    name: "Webflow",
    category: "cms",
    replaceable: true,
    scriptHosts: ["website-files.com", "webflow.com"],
    metaGenerator: /webflow/i,
  },
  {
    id: "joomla",
    name: "Joomla",
    category: "cms",
    replaceable: true,
    htmlPatterns: [/\/media\/jui\/|com_content/i],
    metaGenerator: /joomla/i,
  },
  // ── E-commerce ───────────────────────────────────────────────
  {
    id: "shopify",
    name: "Shopify",
    category: "ecommerce",
    replaceable: true,
    scriptHosts: ["cdn.shopify.com", "myshopify.com"],
    headerMatch: [{ name: "x-shopify-stage", pattern: /.*/ }, { name: "x-shardid", pattern: /.*/ }],
  },
  {
    id: "prestashop",
    name: "PrestaShop",
    category: "ecommerce",
    replaceable: true,
    htmlPatterns: [/prestashop/i],
    metaGenerator: /prestashop/i,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    category: "ecommerce",
    replaceable: true,
    htmlPatterns: [/woocommerce/i],
  },
  {
    id: "magento",
    name: "Magento",
    category: "ecommerce",
    replaceable: true,
    htmlPatterns: [/\/mage\/|Magento_|static\/version\d/i],
    cookies: [/^X-Magento/i],
  },
  // ── Email marketing ──────────────────────────────────────────
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "email_marketing",
    replaceable: true,
    scriptHosts: ["list-manage.com", "mailchimp.com", "chimpstatic.com"],
  },
  {
    id: "brevo",
    name: "Brevo (Sendinblue)",
    category: "email_marketing",
    replaceable: true,
    scriptHosts: ["sendinblue.com", "sibforms.com", "brevo.com"],
  },
  // ── Support ──────────────────────────────────────────────────
  {
    id: "zendesk",
    name: "Zendesk",
    category: "support",
    replaceable: true,
    scriptHosts: ["zdassets.com", "zendesk.com", "zopim.com"],
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "support",
    replaceable: true,
    scriptHosts: ["intercom.io", "intercomcdn.com"],
  },
  {
    id: "freshworks",
    name: "Freshworks",
    category: "support",
    replaceable: true,
    scriptHosts: ["freshchat.com", "freshdesk.com", "freshworks.com"],
  },
  // ── Detected but NOT the target (replaceable:false) ──────────
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: "analytics",
    replaceable: false,
    scriptHosts: ["google-analytics.com", "googletagmanager.com"],
    htmlPatterns: [/gtag\(|GoogleAnalyticsObject/],
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "analytics",
    replaceable: false,
    scriptHosts: ["hotjar.com"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    category: "infra",
    replaceable: false,
    headerMatch: [{ name: "server", pattern: /cloudflare/i }],
    cookies: [/^__cf/i],
  },
];
