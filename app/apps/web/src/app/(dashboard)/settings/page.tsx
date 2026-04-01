"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function ProfileSettingsPage() {
  const [firstName, setFirstName] = useState("Martin");
  const [lastName, setLastName] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <h1 className="text-[24px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
        Profile
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage settings for your personal profile.
      </p>

      <div className="mt-8 space-y-5">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
              className="mt-1.5 h-8 w-full rounded-md px-3 text-[13px] outline-none transition-colors"
              style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-moderate)"; }}
            />
          </div>
          <div className="flex-1">
            <label className="block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)}
              className="mt-1.5 h-8 w-full rounded-md px-3 text-[13px] outline-none transition-colors"
              style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-moderate)"; }}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Email</label>
          <input value="martin@leadsens.com" disabled
            className="mt-1.5 h-8 w-full rounded-md px-3 text-[13px]"
            style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)", color: "var(--color-text-muted)" }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSave}
            className="h-8 rounded-md px-4 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            Update
          </button>
          {saved && <span className="text-[12px]" style={{ color: "var(--color-success)" }}>Saved</span>}
        </div>
      </div>

      {/* Email & Calendar section */}
      <section className="mt-12">
        <h2 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Email & Calendar
        </h2>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Connect your email to automatically capture all interactions.
        </p>
        <div className="mt-4 rounded-lg p-4" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Connect your Gmail to capture emails automatically.
          </p>
          <button onClick={() => signIn("google")}
            className="mt-3 flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            Connect Gmail
          </button>
        </div>
      </section>
    </>
  );
}
