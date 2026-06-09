import { describe, it, expect } from "vitest";
import { parseFullEnrichWebhook } from "@/lib/integrations/fullenrich-client";

describe("parseFullEnrichWebhook", () => {
  it("correlates each result to our contact via custom.crm_contact_id", () => {
    const payload = {
      id: "enr_1",
      status: "COMPLETED",
      data: [
        {
          custom: { crm_contact_id: "c-123" },
          contact_info: {
            most_probable_work_email: { email: "jane@acme.com", status: "DELIVERABLE" },
            most_probable_phone: { number: "+41791234567", region: "CH" },
          },
        },
      ],
    };
    const out = parseFullEnrichWebhook(payload);
    expect(out.status).toBe("COMPLETED");
    expect(out.contacts).toHaveLength(1);
    expect(out.contacts[0]).toEqual({
      contactId: "c-123",
      email: "jane@acme.com",
      emailStatus: "verified",
      phone: "+41791234567",
      phoneType: "mobile",
    });
  });

  it("maps email status: HIGH_PROBABILITY -> verified, CATCH_ALL -> likely", () => {
    const hp = parseFullEnrichWebhook({
      data: [{ custom: { crm_contact_id: "a" }, contact_info: { most_probable_work_email: { email: "a@x.com", status: "HIGH_PROBABILITY" } } }],
    });
    expect(hp.contacts[0].emailStatus).toBe("verified");
    const ca = parseFullEnrichWebhook({
      data: [{ custom: { crm_contact_id: "b" }, contact_info: { most_probable_work_email: { email: "b@x.com", status: "CATCH_ALL" } } }],
    });
    expect(ca.contacts[0].emailStatus).toBe("likely");
  });

  it("skips INVALID emails and falls back to the personal / array email", () => {
    const out = parseFullEnrichWebhook({
      data: [
        {
          custom: { crm_contact_id: "c" },
          contact_info: {
            most_probable_work_email: { email: "bad@x.com", status: "INVALID" },
            most_probable_personal_email: { email: "good@perso.com", status: "DELIVERABLE" },
          },
        },
      ],
    });
    expect(out.contacts[0].email).toBe("good@perso.com");
    expect(out.contacts[0].emailStatus).toBe("verified");
  });

  it("falls back to phones[] when most_probable_phone is absent", () => {
    const out = parseFullEnrichWebhook({
      data: [{ custom: { crm_contact_id: "c" }, contact_info: { phones: [{ number: "+33612345678", region: "FR" }] } }],
    });
    expect(out.contacts[0].phone).toBe("+33612345678");
    expect(out.contacts[0].phoneType).toBe("mobile");
  });

  it("emits no phone/email when contact_info is empty but keeps the id mapping", () => {
    const out = parseFullEnrichWebhook({
      data: [{ custom: { crm_contact_id: "c" }, contact_info: {} }],
    });
    expect(out.contacts).toHaveLength(1);
    expect(out.contacts[0]).toEqual({ contactId: "c", email: null, emailStatus: null, phone: null, phoneType: null });
  });

  it("drops rows with no id and no data, and tolerates garbage", () => {
    expect(parseFullEnrichWebhook(null).contacts).toEqual([]);
    expect(parseFullEnrichWebhook({}).contacts).toEqual([]);
    expect(parseFullEnrichWebhook("nope").contacts).toEqual([]);
    const out = parseFullEnrichWebhook({ data: [{ contact_info: {} }, "junk", { custom: { crm_contact_id: "keep" }, contact_info: { most_probable_phone: { number: "+33600000000" } } }] });
    expect(out.contacts).toHaveLength(1);
    expect(out.contacts[0].contactId).toBe("keep");
  });
});
