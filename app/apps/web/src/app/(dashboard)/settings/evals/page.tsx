import { adminOnlyOrRedirect } from "@/lib/auth/admin-only";
import EvalsClient from "./evals-client";

export default async function EvalsPage() {
  await adminOnlyOrRedirect();
  return <EvalsClient />;
}
