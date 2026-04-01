/**
 * Simple language detection based on common word heuristics.
 * Returns ISO 639-1 language code.
 */

const LANGUAGE_MARKERS: Record<string, string[]> = {
  fr: ["bonjour", "merci", "oui", "non", "comment", "pourquoi", "avec", "dans", "pour", "nous", "vous", "sont", "cette", "mais", "aussi", "salut", "bonsoir", "je", "tu", "il", "elle"],
  es: ["hola", "gracias", "buenos", "buenas", "como", "donde", "porque", "para", "nosotros", "ustedes", "esta", "pero", "tambien", "bien", "mucho", "cuando", "quien", "cual"],
  de: ["hallo", "danke", "guten", "bitte", "warum", "nicht", "haben", "werden", "diese", "aber", "auch", "morgen", "abend", "ich", "wir", "sie", "ist", "sind", "das", "ein"],
  pt: ["obrigado", "obrigada", "bom", "boa", "como", "onde", "porque", "para", "voce", "esta", "isso", "muito", "quando", "quem", "qual", "dia", "noite"],
  it: ["ciao", "grazie", "buongiorno", "buonasera", "come", "dove", "perche", "questo", "questa", "anche", "molto", "bene", "sono", "siamo", "hanno"],
  nl: ["hallo", "bedankt", "dank", "goedemorgen", "waarom", "niet", "hebben", "worden", "deze", "maar", "ook", "goed", "welkom"],
  ja: ["\u3053\u3093\u306b\u3061\u306f", "\u3042\u308a\u304c\u3068\u3046", "\u304a\u306f\u3088\u3046", "\u3059\u307f\u307e\u305b\u3093", "\u306f\u3044", "\u3044\u3044\u3048", "\u3069\u3046\u3082", "\u304a\u9858\u3044"],
  zh: ["\u4f60\u597d", "\u8c22\u8c22", "\u65e9\u4e0a\u597d", "\u4e3a\u4ec0\u4e48", "\u8fd9\u4e2a", "\u90a3\u4e2a", "\u4ec0\u4e48", "\u600e\u4e48", "\u53ef\u4ee5"],
  ko: ["\uc548\ub155\ud558\uc138\uc694", "\uac10\uc0ac\ud569\ub2c8\ub2e4", "\ub124", "\uc544\ub2c8\uc694", "\uc5b4\ub5bb\uac8c", "\uc65c", "\ubb50"],
  ru: ["\u043f\u0440\u0438\u0432\u0435\u0442", "\u0441\u043f\u0430\u0441\u0438\u0431\u043e", "\u0437\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435", "\u043f\u043e\u0447\u0435\u043c\u0443", "\u043a\u0430\u043a", "\u0434\u0430", "\u043d\u0435\u0442", "\u044d\u0442\u043e", "\u043e\u0447\u0435\u043d\u044c"],
  ar: ["\u0645\u0631\u062d\u0628\u0627", "\u0634\u0643\u0631\u0627", "\u0623\u0647\u0644\u0627", "\u0643\u064a\u0641", "\u0644\u0645\u0627\u0630\u0627", "\u0647\u0630\u0627", "\u0647\u0630\u0647", "\u0646\u0639\u0645", "\u0644\u0627"],
};

export function detectLanguage(text: string): string {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);

  let bestLang = "en";
  let bestScore = 0;

  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    let score = 0;
    for (const word of words) {
      if (markers.includes(word)) {
        score++;
      }
    }
    // Also check if the text contains any markers as substrings (for CJK, Arabic, etc.)
    for (const marker of markers) {
      if (lower.includes(marker)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestLang;
}

export function getSystemPrompt(language: string): string {
  const prompts: Record<string, string> = {
    en: "You are a helpful sales assistant. Respond in English.",
    fr: "You are a helpful sales assistant. Respond in French (Fran\u00e7ais).",
    es: "You are a helpful sales assistant. Respond in Spanish (Espa\u00f1ol).",
    de: "You are a helpful sales assistant. Respond in German (Deutsch).",
    pt: "You are a helpful sales assistant. Respond in Portuguese (Portugu\u00eas).",
    it: "You are a helpful sales assistant. Respond in Italian (Italiano).",
    nl: "You are a helpful sales assistant. Respond in Dutch (Nederlands).",
    ja: "You are a helpful sales assistant. Respond in Japanese (\u65e5\u672c\u8a9e).",
    zh: "You are a helpful sales assistant. Respond in Chinese (\u4e2d\u6587).",
    ko: "You are a helpful sales assistant. Respond in Korean (\ud55c\uad6d\uc5b4).",
    ru: "You are a helpful sales assistant. Respond in Russian (\u0420\u0443\u0441\u0441\u043a\u0438\u0439).",
    ar: "You are a helpful sales assistant. Respond in Arabic (\u0627\u0644\u0639\u0631\u0628\u064a\u0629).",
  };

  return prompts[language] || `You are a helpful sales assistant. Respond in the language with ISO 639-1 code: ${language}.`;
}
