import { describe, it, expect, vi } from "vitest";
import { parseObjectionBank, mergePlaybook, getTenantPlaybook } from "@/lib/voice/tenant-playbook";
import { PLAYBOOK, type ObjectionClass } from "@/lib/voice/coaching-playbook";
import type { TenantSettings } from "@/lib/config/tenant-settings";

const settings = (over: Partial<TenantSettings> = {}): TenantSettings =>
  ({ productDescription: "Logiciels open-source opérés, souverains, moins chers", ...over }) as TenantSettings;

describe("neutral PLAYBOOK hygiene — safe for ANY tenant", () => {
  it("contains no vendor names, no prices, and stays in 'vous'", () => {
    for (const entry of Object.values(PLAYBOOK)) {
      for (const r of entry.suggestedResponses) {
        expect(r).not.toMatch(/elevay|outreach|apollo|leadsens/i);
        expect(r).not.toMatch(/\$|€\s?\d|999/);
        expect(r).not.toMatch(/(?:^|[^a-zA-ZÀ-ÿ])(tu|ton|ta|tes|te)(?:[^a-zA-ZÀ-ÿ]|$)/i);
      }
    }
  });
});

describe("parseObjectionBank", () => {
  it("validates entries and keeps the canonical labels", () => {
    const out = parseObjectionBank([
      { objectionClass: "no_budget", responses: ["Réponse valide d'au moins dix caractères."] },
    ])!;
    expect(out.no_budget?.suggestedResponses).toHaveLength(1);
    expect(out.no_budget?.label).toBe(PLAYBOOK.no_budget.label);
  });

  it("drops unknown classes, short/long responses, and caps at 2", () => {
    const out = parseObjectionBank([
      { objectionClass: "alien_class", responses: ["Une réponse pourtant valide ici."] },
      { objectionClass: "no_budget", responses: ["court", "x".repeat(301), "Bonne réponse numéro un, assez longue.", "Bonne réponse numéro deux, assez longue.", "Troisième réponse qui doit être coupée."] },
    ])!;
    expect(Object.keys(out)).toEqual(["no_budget"]);
    expect(out.no_budget?.suggestedResponses).toHaveLength(2);
  });

  it("returns null for junk", () => {
    expect(parseObjectionBank(null)).toBeNull();
    expect(parseObjectionBank("nope")).toBeNull();
    expect(parseObjectionBank([{ objectionClass: "no_budget", responses: [] }])).toBeNull();
  });
});

describe("getTenantPlaybook", () => {
  it("stored bank overrides class-by-class, neutral fills the rest", async () => {
    const pb = await getTenantPlaybook("t-stored-" + Math.random(), {
      loadSettings: async () =>
        settings({ objectionBank: [{ objectionClass: "price_too_high", responses: ["Notre offre se compare à ce que vous payez déjà."] }] }),
      model: null,
    });
    expect(pb.price_too_high.suggestedResponses).toEqual(["Notre offre se compare à ce que vous payez déjà."]);
    expect(pb.no_budget).toEqual(PLAYBOOK.no_budget); // untouched class = neutral
  });

  it("no bank + no model ⇒ neutral, nothing saved", async () => {
    const saveBank = vi.fn();
    const pb = await getTenantPlaybook("t-neutral-" + Math.random(), {
      loadSettings: async () => settings(),
      saveBank,
      model: null,
    });
    expect(pb).toEqual(PLAYBOOK);
    expect(saveBank).not.toHaveBeenCalled();
  });

  it("no bank + model ⇒ generates once, persists, and merges", async () => {
    const saveBank = vi.fn(async () => {});
    const generate = vi.fn(async () => ({
      object: {
        bank: [
          { objectionClass: "price_too_high" as ObjectionClass, responses: ["Réponse produit générée, suffisamment longue."] },
          { objectionClass: "no_budget" as ObjectionClass, responses: ["Deuxième réponse générée, suffisamment longue."] },
          { objectionClass: "send_email_instead" as ObjectionClass, responses: ["Troisième réponse générée, assez longue aussi."] },
          { objectionClass: "happy_with_current" as ObjectionClass, responses: ["Quatrième réponse générée, assez longue aussi."] },
        ],
      },
    }));
    const pb = await getTenantPlaybook("t-gen-" + Math.random(), {
      loadSettings: async () => settings(),
      saveBank,
      model: {},
      generate: generate as never,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(saveBank).toHaveBeenCalledOnce();
    expect(pb.price_too_high.suggestedResponses[0]).toContain("générée");
    expect(pb.not_the_right_time).toEqual(PLAYBOOK.not_the_right_time); // ungenerated = neutral
  });

  it("no productDescription ⇒ nothing grounded to generate from ⇒ neutral", async () => {
    const generate = vi.fn();
    const pb = await getTenantPlaybook("t-noprod-" + Math.random(), {
      loadSettings: async () => ({}) as TenantSettings,
      model: {},
      generate: generate as never,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(pb).toEqual(PLAYBOOK);
  });

  it("generation failure ⇒ neutral, never throws", async () => {
    const pb = await getTenantPlaybook("t-fail-" + Math.random(), {
      loadSettings: async () => settings(),
      model: {},
      generate: (async () => {
        throw new Error("boom");
      }) as never,
    });
    expect(pb).toEqual(PLAYBOOK);
  });
});
