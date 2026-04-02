"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <h1
        className="text-[24px] font-bold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        Profile
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage settings for your personal profile.
      </p>

      <div className="mt-8 space-y-5">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Input
            label="Email"
            value="martin@leadsens.com"
            disabled
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={handleSave}>
            Update
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
        </div>
      </div>

      {/* Email & Calendar section */}
      <section className="mt-12">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Email & Calendar
        </h2>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Connect your email to automatically capture all interactions.
        </p>
        <Card className="mt-4">
          <CardBody>
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Connect your Gmail to capture emails automatically.
            </p>
            <Button variant="gradient" onClick={() => signIn("google")} className="mt-3">
              Connect Gmail
            </Button>
          </CardBody>
        </Card>
      </section>
    </>
  );
}
