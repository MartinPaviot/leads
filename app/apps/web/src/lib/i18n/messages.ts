/**
 * Minimal i18n — locale type, the message dictionary, and a pure resolver.
 *
 * The app ships FR by default (the current UI is French); EN is the base
 * translation a user can switch on. FR is the source of truth: a missing EN key
 * falls back to FR, then to the key itself, so nothing ever renders blank.
 *
 * This is the FOUNDATION: chrome strings get migrated onto `useT()` incrementally.
 * Pilae business content (call scripts / knowledge) stays FR by design and is NOT
 * keyed here.
 */
export type Locale = "en" | "fr";
export const DEFAULT_LOCALE: Locale = "fr";

export type Messages = Record<string, string>;

export const messages: Record<Locale, Messages> = {
  fr: {
    "common.save": "Enregistrer",
    "common.saving": "Enregistrement…",
    "common.saved": "Enregistré",
    "common.cancel": "Annuler",
    "common.networkError": "Erreur réseau",
    "common.loading": "Chargement…",
    "common.retry": "Réessayer",
    "common.close": "Fermer",
    "common.confirm": "Confirmer",
    "common.copy": "Copier",
    "common.copied": "Copié",
    "common.done": "Terminé",
    "common.notConfigured": "Non configuré",
    "common.theProspect": "le prospect",
    "language.label": "Langue",
    "language.toEnglish": "English",
    "language.toFrench": "Français",
    // Meeting scheduler
    "meeting.scheduleTitle": "Planifier une réunion de découverte",
    "meeting.bookedTitle": "Visio planifiée",
    "meeting.when": "Quand",
    "meeting.duration": "Durée",
    "meeting.video": "Visio",
    "meeting.booking": "Planification…",
    "meeting.titlePlaceholder": "Titre (optionnel) — ex. Échange {name}",
    "meeting.pickDateTime": "Choisis une date et une heure.",
    "meeting.invalidDateTime": "Cette date et heure ne semblent pas valides.",
    "meeting.bookFailed": "Impossible de planifier la réunion.",
    "meeting.networkError": "Erreur réseau lors de la planification.",
    "meeting.bookedToast": "Visio planifiée avec {name}.",
    "meeting.inviteSent": "Invitation envoyée à {name} avec le lien de visio.",
    "meeting.descSovereign":
      "Ajoute l'événement à votre agenda connecté avec un lien de visio souveraine, et invite le contact.",
    "meeting.descProvider":
      "Crée la réunion (Google Meet / Teams / Zoom) selon votre choix et votre agenda connecté, et invite le contact.",
    // Meetings list — show-rate chip + meeting detail
    "meeting.showRate.title": "Présence RDV",
    "meeting.showRate.heldQualified": "{held} tenus / {qualified} qualifiés",
    "meeting.showRate.toQualify": "{n} à qualifier",
    "meeting.showRate.benchmark": "repère 75-80%",
    "meeting.sovereignNotice":
      "Visio souveraine — enregistrée et transcrite sur votre infrastructure.",
    // List filters — Accounts / Contacts filter panels
    "filters.section.sector": "Secteur",
    "filters.section.geography": "Géographie",
    "filters.section.reachability": "Joignabilité",
    "filters.section.engagement": "Engagement",
    "filters.section.persona": "Persona",
    "filters.family.label": "Famille sectorielle",
    "filters.family.hintLoading": "Classement des secteurs…",
    "filters.family.hint": "Regroupe les industries en familles (santé, public, non-profit…)",
    "filters.region.label": "Région / canton",
    "filters.region.hint": "Romandie : Geneva, Vaud, Valais, Neuchâtel, Fribourg, Jura",
    "filters.phone.label": "Indicatif téléphone",
    "filters.recency.label": "Dernier contact",
    "filters.recency.hintContacts": "Dernier échange réel — email, appel ou RDV",
    "filters.recency.hintAccounts": "Dernier échange réel sur le compte (contacts, emails, RDV)",
    "filters.seniority.label": "Séniorité",
    "filters.contactReach.label": "Couverture contact",
    "filters.contactReach.hint": "A-t-on un interlocuteur — et un numéro pour l'appeler ?",
    "filters.advancedContacts": "Filtres avancés — joignabilité, engagement, persona",
    "filters.advancedAccounts": "Filtres avancés — joignabilité, récence",
    // Settings → Recording
    "settings.recording.title": "Enregistrement",
    "settings.recording.subtitle":
      "Configurez l'enregistrement automatique des réunions, la transcription et la politique de marque.",
    "settings.recording.autoRecord": "Enregistrer les réunions automatiquement",
    "settings.recording.autoRecordOn":
      "Un bot rejoint vos réunions pour les enregistrer et les transcrire automatiquement.",
    "settings.recording.autoRecordOff":
      "Une fois une intégration de prise de notes connectée, un bot rejoindra vos réunions pour les enregistrer et les transcrire. En attendant, ce réglage est enregistré mais inactif.",
    "settings.recording.toggleAria": "Activer/désactiver l'enregistrement",
    "settings.recording.botNameLabel": "Nom affiché du bot",
    "settings.recording.botNameHelper":
      "Ce nom apparaît quand le bot rejoint des réunions externes. La mention « (via Elevay) » est ajoutée automatiquement.",
    "settings.recording.brandingPolicy": "Politique de marque",
    "settings.recording.brandingHelper":
      "Détermine si les prospects externes voient la marque Elevay dans les enregistrements.",
    "settings.recording.policy.branded.title": "Marqué (recommandé)",
    "settings.recording.policy.branded.helper":
      "Le bot rejoint sous le nom de votre workspace avec la mention « via Elevay » pour les réunions externes. Réunions internes : mode silencieux automatique.",
    "settings.recording.policy.silent.title": "Toujours silencieux",
    "settings.recording.policy.silent.helper":
      "Le bot rejoint toujours sous le nom « Notes », sans marque Elevay. Utile pour les secteurs régulés.",
    "settings.recording.policy.perMeeting.title": "Choix par réunion",
    "settings.recording.policy.perMeeting.helper":
      "Marqué par défaut, avec l'option de désactiver la marque réunion par réunion (UI à venir).",
    "settings.recording.reasonTitle": "Raison du mode silencieux",
    "settings.recording.reason.internalOnly": "Usage interne uniquement",
    "settings.recording.reason.clientConfidential": "Clients confidentiels",
    "settings.recording.reason.regulatory": "Secteur régulé (finance, santé)",
    "settings.recording.reason.other": "Autre",
    "settings.recording.primaryDomainLabel": "Domaine principal de l'entreprise",
    "settings.recording.primaryDomainHelper":
      "Les participants sur ce domaine comptent comme internes. Par défaut, le domaine de l'email du propriétaire.",
    "settings.recording.aliasesLabel": "Domaines additionnels (séparés par des virgules)",
    "settings.recording.aliasesHelper":
      "Utile si votre équipe couvre plusieurs domaines (filiales, acquisitions). Max 10.",
    "settings.recording.selectReason":
      "Sélectionnez une raison pour enregistrer la politique de mode silencieux.",
    // Settings → Sending infrastructure · Voice (Twilio)
    "voice.title": "Voix (Twilio)",
    "voice.desc":
      "Configurez Twilio + Deepgram pour activer Call Mode (cold call autonome). Les identifiants sont en variables d'environnement — voir docs/voice-bootstrap.md.",
    "voice.loadingConfig": "Lecture de la configuration…",
    "voice.connected": "Twilio connecté",
    "voice.notConfigured": "Twilio non configuré",
    "voice.poolActive": "{n} numéro(s) actif(s) dans le pool.",
    "voice.noOutbound":
      "Aucun numéro sortant provisionné. Voir docs/voice-bootstrap.md pour en acheter un.",
    "voice.addCreds":
      "Ajoutez TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_APP_SID dans .env.local puis redémarrez.",
    "voice.usageLabel": "Usage {month}",
    "voice.usageMinutes": "{used} / {included} min incluses",
    "voice.usageOverage": " — en overage ($0.05/min)",
    "voice.usageCeiling": " — plafond dur atteint, appels bloqués",
    "voice.provisionedNumbers": "Numéros provisionnés",
    "voice.buyNumber": "Acheter un numéro",
    "voice.areaPlaceholder": "Area code (ex 415, optionnel)",
    "voice.buying": "Achat…",
    "voice.buy": "Acheter",
    "voice.buyHelper":
      "Twilio facture ~$1.15/mois par numéro. L'area code permet de choisir un préfixe local pour une meilleure pickup-rate.",
    "voice.noInventory": "Aucun numéro disponible chez Twilio pour ce country/area code.",
    "voice.notConfiguredEnv": "Configurez Twilio dans .env.local avant d'acheter un numéro.",
    "voice.buyFailed": "Échec achat numéro ({code}).",
    "voice.provisioned": "Numéro provisionné et ajouté au pool.",
    "voice.buyError": "Erreur achat : {msg}",
  },
  en: {
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.saved": "Saved",
    "common.cancel": "Cancel",
    "common.networkError": "Network error",
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "common.copy": "Copy",
    "common.copied": "Copied",
    "common.done": "Done",
    "common.notConfigured": "Not configured",
    "common.theProspect": "the prospect",
    "language.label": "Language",
    "language.toEnglish": "English",
    "language.toFrench": "Français",
    // Meeting scheduler
    "meeting.scheduleTitle": "Schedule a discovery meeting",
    "meeting.bookedTitle": "Meeting booked",
    "meeting.when": "When",
    "meeting.duration": "Duration",
    "meeting.video": "Video",
    "meeting.booking": "Booking…",
    "meeting.titlePlaceholder": "Title (optional) — e.g. Chat with {name}",
    "meeting.pickDateTime": "Pick a date and time.",
    "meeting.invalidDateTime": "That date and time doesn't look valid.",
    "meeting.bookFailed": "Couldn't book the meeting.",
    "meeting.networkError": "Network error while booking.",
    "meeting.bookedToast": "Meeting booked with {name}.",
    "meeting.inviteSent": "Invite sent to {name} with the meeting link.",
    "meeting.descSovereign":
      "Adds the event to your connected calendar with a sovereign video link, and invites the contact.",
    "meeting.descProvider":
      "Creates the meeting (Google Meet / Teams / Zoom) per your choice and connected calendar, and invites the contact.",
    // Meetings list — show-rate chip + meeting detail
    "meeting.showRate.title": "Show rate",
    "meeting.showRate.heldQualified": "{held} held / {qualified} qualified",
    "meeting.showRate.toQualify": "{n} to qualify",
    "meeting.showRate.benchmark": "benchmark 75-80%",
    "meeting.sovereignNotice":
      "Sovereign video — recorded and transcribed on your own infrastructure.",
    // List filters — Accounts / Contacts filter panels
    "filters.section.sector": "Sector",
    "filters.section.geography": "Geography",
    "filters.section.reachability": "Reachability",
    "filters.section.engagement": "Engagement",
    "filters.section.persona": "Persona",
    "filters.family.label": "Sector family",
    "filters.family.hintLoading": "Classifying sectors…",
    "filters.family.hint": "Groups industries into families (health, public, non-profit…)",
    "filters.region.label": "Region / canton",
    "filters.region.hint": "French-speaking Switzerland: Geneva, Vaud, Valais, Neuchâtel, Fribourg, Jura",
    "filters.phone.label": "Phone country code",
    "filters.recency.label": "Last contact",
    "filters.recency.hintContacts": "Last real exchange — email, call or meeting",
    "filters.recency.hintAccounts": "Last real exchange on the account (contacts, emails, meetings)",
    "filters.seniority.label": "Seniority",
    "filters.contactReach.label": "Contact coverage",
    "filters.contactReach.hint": "Do we have a contact — and a number to call them?",
    "filters.advancedContacts": "Advanced filters — reachability, engagement, persona",
    "filters.advancedAccounts": "Advanced filters — reachability, recency",
    // Settings → Recording
    "settings.recording.title": "Recording",
    "settings.recording.subtitle":
      "Configure automatic meeting recording, transcription, and branding policy.",
    "settings.recording.autoRecord": "Auto-record meetings",
    "settings.recording.autoRecordOn":
      "A bot joins your meetings to record and transcribe automatically.",
    "settings.recording.autoRecordOff":
      "Once a notetaker integration is connected, a bot will join your meetings to record and transcribe automatically. Until then, this setting is saved but inactive.",
    "settings.recording.toggleAria": "Toggle recording",
    "settings.recording.botNameLabel": "Bot display name",
    "settings.recording.botNameHelper":
      "This name appears when the bot joins external meetings. The « (via Elevay) » wedge is appended automatically.",
    "settings.recording.brandingPolicy": "Branding policy",
    "settings.recording.brandingHelper":
      "Controls whether external prospects see the Elevay brand in meeting recordings.",
    "settings.recording.policy.branded.title": "Branded (recommended)",
    "settings.recording.policy.branded.helper":
      "The bot joins under your workspace name with a « via Elevay » mention for external meetings. Internal meetings: automatic silent mode.",
    "settings.recording.policy.silent.title": "Always silent",
    "settings.recording.policy.silent.helper":
      "The bot always joins under the name « Notes », without Elevay branding. Useful for regulated sectors.",
    "settings.recording.policy.perMeeting.title": "Per-meeting choice",
    "settings.recording.policy.perMeeting.helper":
      "Branded by default, with the option to disable branding per meeting (UI coming).",
    "settings.recording.reasonTitle": "Reason for silent mode",
    "settings.recording.reason.internalOnly": "Internal use only",
    "settings.recording.reason.clientConfidential": "Confidential clients",
    "settings.recording.reason.regulatory": "Regulated sector (finance, healthcare)",
    "settings.recording.reason.other": "Other",
    "settings.recording.primaryDomainLabel": "Primary company domain",
    "settings.recording.primaryDomainHelper":
      "Attendees on this domain count as internal. Defaults to your owner email domain.",
    "settings.recording.aliasesLabel": "Additional domains (comma-separated)",
    "settings.recording.aliasesHelper":
      "Useful if your team spans multiple domains (subsidiaries, acquisitions). Max 10.",
    "settings.recording.selectReason": "Select a reason to save silent-mode policy.",
    // Settings → Sending infrastructure · Voice (Twilio)
    "voice.title": "Voice (Twilio)",
    "voice.desc":
      "Configure Twilio + Deepgram to enable Call Mode (autonomous cold call). Credentials are environment variables — see docs/voice-bootstrap.md.",
    "voice.loadingConfig": "Reading configuration…",
    "voice.connected": "Twilio connected",
    "voice.notConfigured": "Twilio not configured",
    "voice.poolActive": "{n} active number(s) in the pool.",
    "voice.noOutbound": "No outbound number provisioned. See docs/voice-bootstrap.md to buy one.",
    "voice.addCreds":
      "Add TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_APP_SID to .env.local, then restart.",
    "voice.usageLabel": "Usage {month}",
    "voice.usageMinutes": "{used} / {included} min included",
    "voice.usageOverage": " — in overage ($0.05/min)",
    "voice.usageCeiling": " — hard ceiling reached, calls blocked",
    "voice.provisionedNumbers": "Provisioned numbers",
    "voice.buyNumber": "Buy a number",
    "voice.areaPlaceholder": "Area code (e.g. 415, optional)",
    "voice.buying": "Buying…",
    "voice.buy": "Buy",
    "voice.buyHelper":
      "Twilio charges ~$1.15/mo per number. The area code lets you pick a local prefix for a better pickup rate.",
    "voice.noInventory": "No number available at Twilio for this country/area code.",
    "voice.notConfiguredEnv": "Configure Twilio in .env.local before buying a number.",
    "voice.buyFailed": "Number purchase failed ({code}).",
    "voice.provisioned": "Number provisioned and added to the pool.",
    "voice.buyError": "Purchase error: {msg}",
  },
};

/**
 * Resolve a message for `locale`, falling back to FR then the key itself.
 * `{var}` placeholders are interpolated from `vars`. Pure, unit-tested.
 */
export function translate(
  dict: Record<Locale, Messages>,
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = dict[locale]?.[key] ?? dict.fr?.[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
