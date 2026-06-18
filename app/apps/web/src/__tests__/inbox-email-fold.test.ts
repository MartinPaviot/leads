// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { foldQuotedReply, foldPlainTextReply } from "@/lib/inbox/email-fold";

describe("foldQuotedReply (INBOX-R05)", () => {
  it("folds a Gmail-style quote container", () => {
    const res = foldQuotedReply(
      `<div>Thanks, sounds good!</div>` +
        `<div class="gmail_quote">On Mon, 1 Jun 2026, Bob wrote:<blockquote>earlier message</blockquote></div>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Thanks, sounds good!");
    expect(res.visibleHtml).not.toContain("earlier message");
    expect(res.trimmedHtml).toContain("earlier message");
  });

  it("folds a bare <blockquote> reply chain", () => {
    const res = foldQuotedReply(`<p>Here is my answer.</p><blockquote>your original question</blockquote>`);
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Here is my answer.");
    expect(res.trimmedHtml).toContain("your original question");
  });

  it("folds at a loose attribution text node before the quote", () => {
    const res = foldQuotedReply(
      `<div>Got it.</div>On Mon, 1 Jun 2026 at 09:00, Alice <a@x.com> wrote:<blockquote>q</blockquote>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Got it.");
    expect(res.visibleHtml).not.toContain("wrote:");
    expect(res.trimmedHtml).toContain("wrote:");
  });

  it("folds at an Outlook-style original-message divider", () => {
    const res = foldQuotedReply(
      `<div>My reply</div><div>-----Original Message-----</div><div>old thread</div>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("My reply");
    expect(res.trimmedHtml).toContain("old thread");
  });

  it("folds a French attribution line", () => {
    const res = foldQuotedReply(
      `<div>Merci beaucoup.</div><div class="gmail_quote">Le 1 juin 2026 à 09:00, Bob a écrit :<blockquote>x</blockquote></div>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Merci beaucoup.");
  });

  it("does not fold an email with no quote", () => {
    const res = foldQuotedReply(`<p>Just a simple note with no reply chain.</p>`);
    expect(res.hasTrimmed).toBe(false);
    expect(res.visibleHtml).toContain("simple note");
    expect(res.trimmedHtml).toBe("");
  });

  it("shows everything when the whole body is the quote (pure forward)", () => {
    const res = foldQuotedReply(`<blockquote>the entire forwarded message</blockquote>`);
    expect(res.hasTrimmed).toBe(false);
    expect(res.visibleHtml).toContain("entire forwarded message");
  });

  it("does not mistake a body paragraph that merely says 'wrote' for an attribution", () => {
    const res = foldQuotedReply(`<p>I wrote the report you asked for and attached it here.</p>`);
    expect(res.hasTrimmed).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(foldQuotedReply("")).toEqual({ visibleHtml: "", trimmedHtml: "", hasTrimmed: false });
  });

  it("folds a gmail_signature block so only the new content shows (R05)", () => {
    const res = foldQuotedReply(
      `<div>Here's the update.</div><div class="gmail_signature">John Doe<br>CEO, Acme</div>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Here's the update.");
    expect(res.visibleHtml).not.toContain("CEO, Acme");
    expect(res.trimmedHtml).toContain("CEO, Acme");
  });

  it("folds at the '-- ' signature delimiter line", () => {
    const res = foldQuotedReply(`<div>My answer is yes.</div><div>-- </div><div>Jane, Acme</div>`);
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("My answer is yes.");
    expect(res.trimmedHtml).toContain("Jane, Acme");
  });

  it("folds a confidentiality disclaimer footer", () => {
    const res = foldQuotedReply(
      `<p>Looking forward to it.</p><p>CONFIDENTIALITY NOTICE: this message is intended only for the addressee.</p>`,
    );
    expect(res.hasTrimmed).toBe(true);
    expect(res.visibleHtml).toContain("Looking forward to it.");
    expect(res.visibleHtml).not.toContain("CONFIDENTIALITY");
  });

  it("folds the signature even before a quoted thread (both go to trimmed)", () => {
    const res = foldQuotedReply(
      `<div>Confirmed.</div><div class="gmail_signature">Bob</div>` +
        `<div class="gmail_quote">On Mon, Al wrote:<blockquote>old</blockquote></div>`,
    );
    expect(res.visibleHtml).toContain("Confirmed.");
    expect(res.visibleHtml).not.toContain("Bob");
    expect(res.trimmedHtml).toContain("Bob");
    expect(res.trimmedHtml).toContain("old");
  });

  it("does NOT fold a body that merely mentions 'this email' mid-sentence", () => {
    const res = foldQuotedReply(`<p>This email confirms our meeting on Tuesday at noon.</p>`);
    expect(res.hasTrimmed).toBe(false);
  });
});

describe("foldPlainTextReply (INBOX-R05/R09 plain-text path)", () => {
  it("folds a '>'-quoted reply tail", () => {
    const res = foldPlainTextReply("Sounds good to me.\n\n> On Mon you wrote:\n> the original");
    expect(res.hasTrimmed).toBe(true);
    expect(res.visible).toContain("Sounds good to me.");
    expect(res.visible).not.toContain("the original");
    expect(res.trimmed).toContain("the original");
  });

  it("folds at an 'On … wrote:' attribution line", () => {
    const res = foldPlainTextReply("Thanks!\nOn Mon, 1 Jun 2026 at 09:00, Alice wrote:\nold stuff");
    expect(res.hasTrimmed).toBe(true);
    expect(res.visible.trim()).toBe("Thanks!");
    expect(res.trimmed).toContain("old stuff");
  });

  it("folds at a '--' signature delimiter", () => {
    const res = foldPlainTextReply("My answer.\n--\nJane Doe\nAcme");
    expect(res.hasTrimmed).toBe(true);
    expect(res.visible.trim()).toBe("My answer.");
    expect(res.trimmed).toContain("Jane Doe");
  });

  it("does not fold a plain note with no quote or signature", () => {
    const res = foldPlainTextReply("Just a plain note.\nSecond line, all mine.");
    expect(res.hasTrimmed).toBe(false);
    expect(res.visible).toContain("Second line");
  });

  it("does not mistake an inline '>' for a quote line", () => {
    expect(foldPlainTextReply("if a > b then ship it").hasTrimmed).toBe(false);
  });

  it("keeps everything when the body is entirely quoted (leading boundary)", () => {
    const res = foldPlainTextReply("> only quoted content here");
    expect(res.hasTrimmed).toBe(false);
    expect(res.visible).toContain("only quoted content");
  });

  it("returns empty for empty input", () => {
    expect(foldPlainTextReply("")).toEqual({ visible: "", trimmed: "", hasTrimmed: false });
  });
});
