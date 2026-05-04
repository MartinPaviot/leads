"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";

const SCOPE_OPTIONS = [
  { value: "workspace", label: "Workspace" },
  { value: "user", label: "Personal" },
];

const CATEGORY_OPTIONS = [
  { value: "icp", label: "ICP" },
  { value: "competitors", label: "Competitors" },
  { value: "objections", label: "Objections" },
  { value: "product", label: "Product" },
  { value: "process", label: "Process" },
  { value: "context", label: "Context" },
  { value: "custom", label: "Custom" },
];

const MAX_FILE_SIZE = 100 * 1024; // 100KB warning threshold

interface AddKnowledgeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    content: string;
    scope: string;
    category: string;
  }) => Promise<void>;
}

export function AddKnowledgeDialog({
  open,
  onClose,
  onSubmit,
}: AddKnowledgeDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState("workspace");
  const [category, setCategory] = useState("custom");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setTitle("");
    setContent("");
    setScope("workspace");
    setCategory("custom");
    setSourceFilename(null);
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const parseFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["txt", "md"].includes(ext)) {
        setError("Unsupported file type. Use .txt or .md files.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        const proceed = window.confirm(
          `This file is ${(file.size / 1024).toFixed(0)}KB which exceeds the recommended 100KB limit. The content may be truncated. Continue?`
        );
        if (!proceed) return;
      }

      try {
        const text = await file.text();
        setContent(text);
        setSourceFilename(file.name);
        // Auto-fill title from filename if empty
        if (!title) {
          const nameWithoutExt = file.name.replace(/\.(txt|md)$/i, "");
          setTitle(nameWithoutExt);
        }
        setError("");
      } catch {
        setError("Failed to read file");
      }
    },
    [title]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
      // Reset input so re-selecting same file triggers change
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [parseFile]
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!content.trim()) {
      setError("Content is required");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ title: title.trim(), content: content.trim(), scope, category });
      handleClose();
    } catch {
      setError("Failed to create entry");
    } finally {
      setSubmitting(false);
    }
  }, [title, content, scope, category, onSubmit, handleClose]);

  return (
    <Modal open={open} onClose={handleClose} title="Add knowledge" size="lg">
      <div className="space-y-4">
        {/* Title */}
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Ideal Customer Profile"
          error={!title.trim() && error.includes("Title") ? error : undefined}
        />

        {/* Scope + Category in a row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Select
              label="Scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={SCOPE_OPTIONS}
            />
          </div>
          <div className="flex-1">
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={CATEGORY_OPTIONS}
            />
          </div>
        </div>

        {/* Content textarea */}
        <Textarea
          label="Content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            // Clear source filename when user manually edits
            if (sourceFilename) setSourceFilename(null);
          }}
          placeholder="Write or paste your knowledge content here..."
          rows={10}
          style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "13px" }}
        />

        {/* Source filename badge */}
        {sourceFilename && (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                background: "var(--color-bg-hover)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <FileText size={11} />
              {sourceFilename}
              <button
                onClick={() => setSourceFilename(null)}
                className="ml-0.5 rounded-sm hover:opacity-70"
              >
                <X size={10} />
              </button>
            </span>
          </div>
        )}

        {/* File drop zone */}
        <div
          className="rounded-lg border-2 border-dashed p-4 text-center transition-colors"
          style={{
            borderColor: dragActive
              ? "var(--color-accent)"
              : "var(--color-border-default)",
            background: dragActive
              ? "var(--color-accent-soft)"
              : "var(--color-bg-page)",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload
            size={20}
            className="mx-auto"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Drop a .txt or .md file here, or{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-medium underline"
              style={{ color: "var(--color-accent)" }}
            >
              browse
            </button>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-[12px]" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}
      </div>

      {/* Footer rendered via modal slot */}
      <div
        className="mt-4 flex items-center justify-end gap-2 pt-3"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        <Button variant="ghost" size="md" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="solid"
          size="md"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!title.trim() || !content.trim()}
        >
          Add entry
        </Button>
      </div>
    </Modal>
  );
}
