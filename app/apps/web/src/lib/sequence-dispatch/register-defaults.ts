import { registerAdapter } from "./registry";
import { emailAdapter } from "./email-adapter";
import { linkedinMessageAdapter } from "./linkedin-adapter";
import { makeManualTaskAdapter } from "./task-adapter";

/**
 * Wire the adapters we ship by default. Called lazily from
 * `dispatchStep` on first invocation when the registry is empty.
 * Tests inject their own adapters via `registerAdapter` before the
 * first dispatch to avoid triggering lazy load.
 *
 * phone_task is inherently manual → always a Needs-you task. linkedin_message
 * is manual-by-default too (live mode gated by env inside its adapter).
 */
export function registerDefaults(): void {
  registerAdapter(emailAdapter);
  registerAdapter(linkedinMessageAdapter);
  registerAdapter(makeManualTaskAdapter("phone_task"));
}
