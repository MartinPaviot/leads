/**
 * Spec 21 — operator warmup console. Lists the client tenants that have an
 * Instantly key on file and lets the Elevay operator enable/disable warmup +
 * read each mailbox's warmup score. Warmup is NEVER auto-enabled — it happens
 * here, deliberately, per client.
 */

import { listConnectedTenants } from "../../../lib/warmup-ops";
import { WarmupControls } from "./warmup-controls";

export const dynamic = "force-dynamic";

export default async function WarmupPage() {
  const tenants = await listConnectedTenants();

  return (
    <div className="px-8 py-7">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Warmup
        </h1>
      </div>
      <p className="mb-6 max-w-2xl text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
        Enable Instantly warmup for a client&apos;s mailboxes before cold sending. Warmup is never auto-enabled — turn
        it on here per client, then watch the score climb before real campaigns open.
      </p>

      {tenants.length === 0 ? (
        <div
          className="rounded-xl border px-5 py-8 text-[13px]"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)", color: "var(--color-text-tertiary)" }}
        >
          No client has connected an Instantly account yet. Warmup applies once a tenant connects Instantly under
          Settings → Sending infrastructure.
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => (
            <WarmupControls key={t.id} tenant={t} />
          ))}
        </div>
      )}
    </div>
  );
}
