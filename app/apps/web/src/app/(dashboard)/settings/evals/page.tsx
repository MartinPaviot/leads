import { notFound } from "next/navigation";
import { adminOnlyOrRedirect } from "@/lib/auth/admin-only";
import { EVALS_PAGE_ENABLED } from "@/lib/settings/admin-tools-visibility";
import EvalsClient from "./evals-client";

export default async function EvalsPage() {
  if (!EVALS_PAGE_ENABLED) notFound();
  await adminOnlyOrRedirect();
  return <EvalsClient />;
}
