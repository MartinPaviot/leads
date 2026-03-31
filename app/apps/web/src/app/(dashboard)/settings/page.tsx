"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [companyDesc, setCompanyDesc] = useState("");
  const [icp, setIcp] = useState("");
  const [product, setProduct] = useState("");
  const [emailStatus, setEmailStatus] = useState<{
    connected: boolean;
    provider: string | null;
    emailCount: number;
    lastSync: string | null;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [tamGenerating, setTamGenerating] = useState(false);
  const [tamResult, setTamResult] = useState<string | null>(null);
  const [tamStatus, setTamStatus] = useState<{
    totalCompanies: number;
    tamCompanies: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/email/status")
      .then((r) => r.json())
      .then(setEmailStatus)
      .catch(console.error);

    fetch("/api/tam")
      .then((r) => r.json())
      .then(setTamStatus)
      .catch(console.error);
  }, []);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleGenerateTAM() {
    if (!icp.trim()) return;
    setTamGenerating(true);
    setTamResult(null);

    try {
      const res = await fetch("/api/tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icp: icp.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setTamResult(
          `Generated ${data.companiesCreated} companies, scored ${data.companiesScored}. ${data.companiesSkipped} skipped.`
        );
        // Refresh status
        const status = await fetch("/api/tam").then((r) => r.json());
        setTamStatus(status);
      } else {
        setTamResult(`Error: ${data.error}`);
      }
    } catch {
      setTamResult("TAM generation failed — network error");
    } finally {
      setTamGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-[#8b8ba0]">
        Manage your workspace and account settings.
      </p>

      {/* Email & Calendar */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Email & Calendar
        </h2>
        <p className="mt-1 text-sm text-[#5a5a70]">
          Connect your email to automatically capture all interactions.
        </p>
        <div className="mt-4 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
          {emailStatus?.connected ? (
            <div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-[#e8e8ed]">
                  Gmail connected
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5a5a70]">
                {emailStatus.emailCount} emails synced
                {emailStatus.lastSync
                  ? ` · Last sync: ${emailStatus.lastSync}`
                  : ""}
              </p>
              <button
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const res = await fetch("/api/email/sync", {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setSyncResult(
                        `Synced ${data.created} new emails (${data.skipped} skipped)`
                      );
                      const status = await fetch("/api/email/status").then(
                        (r) => r.json()
                      );
                      setEmailStatus(status);
                    } else {
                      setSyncResult(`Error: ${data.error}`);
                    }
                  } catch {
                    setSyncResult("Sync failed");
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="mt-3 rounded-lg border border-[#1e1f2a] px-3 py-1.5 text-sm text-[#8b8ba0] hover:border-[#6366f1] hover:text-[#e8e8ed] disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
              {syncResult && (
                <p className="mt-2 text-xs text-green-400">{syncResult}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#8b8ba0]">
                Connect your Gmail to capture emails automatically.
              </p>
              <button
                onClick={() => signIn("google")}
                className="mt-3 flex items-center gap-2 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Connect Gmail
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Knowledge
        </h2>
        <p className="mt-1 text-sm text-[#5a5a70]">
          Give LeadSens context about your business. This is included in all AI
          requests.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-[#8b8ba0]">
              Company description
            </label>
            <textarea
              value={companyDesc}
              onChange={(e) => setCompanyDesc(e.target.value)}
              placeholder="What does your company do? What do you sell?"
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-[#8b8ba0]">
              Ideal Customer Profile (ICP)
            </label>
            <textarea
              value={icp}
              onChange={(e) => setIcp(e.target.value)}
              placeholder="Describe your ideal customer: industry, company size, role, budget, technology stack..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleGenerateTAM}
                disabled={tamGenerating || !icp.trim()}
                className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
              >
                {tamGenerating ? "Generating TAM..." : tamStatus?.tamCompanies ? "Rebuild TAM" : "Generate TAM"}
              </button>
              {tamStatus && tamStatus.tamCompanies > 0 && (
                <span className="text-xs text-[#5a5a70]">
                  {tamStatus.tamCompanies} TAM companies / {tamStatus.totalCompanies} total
                </span>
              )}
            </div>
            {tamResult && (
              <p
                className={`mt-2 text-xs ${
                  tamResult.startsWith("Error") ? "text-red-400" : "text-green-400"
                }`}
              >
                {tamResult}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-[#8b8ba0]">
              Product / pricing
            </label>
            <textarea
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="What are your main products and pricing tiers?"
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
          >
            Save knowledge
          </button>
          {saved && (
            <span className="text-sm text-green-400">Saved</span>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Agent permissions
        </h2>
        <p className="mt-1 text-sm text-[#5a5a70]">
          Control how the LeadSens agent behaves.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-3">
          <div>
            <p className="text-sm text-[#e8e8ed]">
              Record creation and updates
            </p>
            <p className="text-xs text-[#5a5a70]">
              Whether record changes require your approval in chat.
            </p>
          </div>
          <select className="rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-1.5 text-sm text-[#e8e8ed]">
            <option>Ask every time</option>
            <option>Auto-approve</option>
          </select>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Pipeline stages
        </h2>
        <p className="mt-1 text-sm text-[#5a5a70]">
          Customize your opportunity pipeline stages.
        </p>
        <div className="mt-4 space-y-2">
          {[
            "Lead",
            "Qualification",
            "Demo",
            "Trial",
            "Proposal",
            "Negotiation",
            "Won",
            "Lost",
          ].map((stage) => (
            <div
              key={stage}
              className="flex items-center gap-3 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2"
            >
              <div className="h-2 w-2 rounded-full bg-[#6366f1]" />
              <span className="text-sm text-[#e8e8ed]">{stage}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
