"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, CheckCircle2, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useToast } from "@/components/ui/toast";

interface UploadResult {
  success: boolean;
  notes?: { summary?: string } | string | null;
  matchedContacts?: Array<{ name?: string; email?: string }> | number | null;
  activityId?: string | null;
}

export default function UploadTranscriptPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const canSubmit = (text.trim().length >= 50 || !!file) && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (text.trim().length >= 50) form.append("text", text.trim());
      if (title.trim()) form.append("title", title.trim());

      const res = await fetch("/api/meetings/upload-transcript", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast((data as { error?: string }).error || "Upload failed.", "error");
        return;
      }
      setResult(data as UploadResult);
      toast("Transcript processed.", "success");
    } catch (e) {
      console.warn("upload-transcript: submit failed", e);
      toast("Upload failed — network error.", "error");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, file, text, title, toast]);

  const summary =
    result?.notes && typeof result.notes === "object"
      ? result.notes.summary
      : typeof result?.notes === "string"
        ? result.notes
        : null;
  const matchedCount = Array.isArray(result?.matchedContacts)
    ? result!.matchedContacts.length
    : typeof result?.matchedContacts === "number"
      ? result.matchedContacts
      : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Upload size={15} />} title="Upload transcript">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
        >
          <ArrowLeft size={12} /> Back to meetings
        </Link>
      </PageHeader>

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {!result ? (
            <Card>
              <CardBody className="space-y-4">
                <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                  Paste a call transcript or upload a file (.txt, .vtt, .srt, or audio). Elevay generates the meeting notes,
                  buying signals and follow-ups, and matches the contacts mentioned.
                </p>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                    Meeting title (optional)
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Discovery call — Acme Corp"
                    className="mt-1 w-full rounded-md px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                    Paste transcript
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    placeholder="Paste the full transcript here (min 50 characters)…"
                    className="mt-1 w-full rounded-md px-3 py-2 text-[13px] leading-relaxed outline-none"
                    style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                  />
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {text.trim().length} characters
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>or</span>
                  <div className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                    Upload a file
                  </label>
                  <input
                    type="file"
                    accept=".txt,.vtt,.srt,.mp3,.m4a,.webm,.wav,.ogg,.flac"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-1 w-full text-[12px]"
                    style={{ color: "var(--color-text-secondary)" }}
                  />
                  {file && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {file.name} ({Math.round(file.size / 1024)} KB)
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button variant="gradient" size="sm" onClick={submit} disabled={!canSubmit} loading={submitting}>
                    {submitting ? "Processing…" : <><Upload size={13} /> Process transcript</>}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Transcript processed
                  </p>
                </div>
                {matchedCount > 0 && (
                  <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    Matched {matchedCount} contact{matchedCount !== 1 ? "s" : ""} mentioned in the call.
                  </p>
                )}
                {summary && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                      <FileText size={11} className="mr-1 inline" /> Meeting notes
                    </span>
                    <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      <ChatMarkdown>{summary}</ChatMarkdown>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="gradient" size="sm" onClick={() => router.push("/meetings")}>
                    View in meetings
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setResult(null); setText(""); setFile(null); setTitle(""); }}>
                    Upload another
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
