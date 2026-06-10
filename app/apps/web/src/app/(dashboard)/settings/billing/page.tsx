import { notFound } from "next/navigation";
import { BILLING_PAGE_ENABLED } from "@/lib/billing/page-visibility";
import BillingClient from "./billing-client";

export default function BillingSettingsPage() {
  if (!BILLING_PAGE_ENABLED) notFound();
  return <BillingClient />;
}
