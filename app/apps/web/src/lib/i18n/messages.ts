/**
 * Minimal i18n — locale type, the message dictionary, and a pure resolver.
 *
 * The app ships FR by default (the current UI is French); EN is the base
 * translation a user can switch on. FR is the source of truth: a missing EN key
 * falls back to FR, then to the key itself, so nothing ever renders blank.
 *
 * This is the FOUNDATION: chrome strings get migrated onto `useT()` incrementally
 * (see lib/i18n/locale). Pilae business content (call scripts / knowledge) stays
 * FR by design and is NOT keyed here.
 */
export type Locale = "en" | "fr";
export const DEFAULT_LOCALE: Locale = "fr";

export type Messages = Record<string, string>;

export const messages: Record<Locale, Messages> = {
  fr: {
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.networkError": "Erreur réseau",
    "common.loading": "Chargement…",
    "common.retry": "Réessayer",
    "language.label": "Langue",
    "language.toEnglish": "English",
    "language.toFrench": "Français",
  },
  en: {
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.networkError": "Network error",
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "language.label": "Language",
    "language.toEnglish": "English",
    "language.toFrench": "Français",
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
