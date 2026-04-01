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
      <h1 className="text-xl font-semibold">Profile</h1>
      <p className="mt-1 text-sm text-[#8b8ba0]">
        Manage settings for your personal profile.
      </p>

      <div className="mt-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-[#8b8ba0]">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-[#8b8ba0]">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-[#8b8ba0]">Email</label>
          <input
            value="martin@leadsens.com"
            disabled
            className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#5a5a70]"
          />
        </div>

        <button
          onClick={handleSave}
          className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
        >
          Update
        </button>
        {saved && <span className="ml-2 text-sm text-green-400">Saved</span>}
      </div>

      {/* Email & Calendar section */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Email & Calendar
        </h2>
        <p className="mt-1 text-sm text-[#5a5a70]">
          Connect your email to automatically capture all interactions.
        </p>
        <div className="mt-4 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
          <p className="text-sm text-[#8b8ba0]">
            Connect your Gmail to capture emails automatically.
          </p>
          <button
            onClick={() => signIn("google")}
            className="mt-3 flex items-center gap-2 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
          >
            Connect Gmail
          </button>
        </div>
      </section>
    </>
  );
}
