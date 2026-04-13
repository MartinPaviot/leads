"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignWizard } from "@/components/campaign-wizard";
import { Zap, Plus, Send, Users, Mail } from "lucide-react";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  stepCount: number;
  enrolledCount: number;
  emailStats?: Record<string, number>;
  createdAt: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success", paused: "warning", draft: "neutral", archived: "neutral",
  };

  const totalEmails = (stats: Record<string, number>) =>
    Object.values(stats).reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Zap size={15} />}
        title="Campaigns"
        subtitle={`${sequences.length}`}
      >
        <Button variant="gradient" onClick={() => setShowWizard(true)}>
          <Plus size={14} /> New campaign
        </Button>
      </PageHeader>

      {/* Campaign wizard — full screen overlay */}
      {showWizard && (
        <CampaignWizard
          onClose={() => setShowWizard(false)}
          onComplete={(sequenceId) => {
            setShowWizard(false);
            router.push(`/sequences/${sequenceId}`);
          }}
        />
      )}

      <div className="flex-1 overflow-auto px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
            ))}
          </div>
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={<Zap size={24} />}
            title="No campaigns yet"
            description="Pick your targets, draft personalized emails, review, and launch."
            actionLabel="Create your first campaign"
            onAction={() => setShowWizard(true)}
          />
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => (
              <Card key={seq.id} interactive onClick={() => router.push(`/sequences/${seq.id}`)}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{seq.name}</h3>
                        <Badge variant={statusVariant[seq.status] || "neutral"} size="sm">
                          {seq.status}
                        </Badge>
                      </div>
                      {seq.description && (
                        <p className="mt-0.5 text-[12px] truncate" style={{ color: "var(--color-text-tertiary)" }}>{seq.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-5 text-[12px] ml-4" style={{ color: "var(--color-text-tertiary)" }}>
                      <span className="flex items-center gap-1"><Mail size={11} /> {seq.stepCount} steps</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {seq.enrolledCount} contacts</span>
                      {seq.emailStats && totalEmails(seq.emailStats) > 0 && (
                        <span className="flex items-center gap-1"><Send size={11} /> {seq.emailStats.sent || 0} sent</span>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
