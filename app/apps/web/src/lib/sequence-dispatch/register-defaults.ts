import { registerAdapter } from "./registry";
import { emailAdapter } from "./email-adapter";
import { linkedinMessageAdapter } from "./linkedin-adapter";

/**
 * Wire the adapters we ship by default. Called lazily from
 * `dispatchStep` on first invocation when the registry is empty.
 * Tests inject their own adapters via `registerAdapter` before the
 * first dispatch to avoid triggering lazy load.
 */
export function registerDefaults(): void {
  registerAdapter(emailAdapter);
  registerAdapter(linkedinMessageAdapter);
}
