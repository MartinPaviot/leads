import bcrypt from "bcryptjs";

/**
 * bcrypt work factor for production password hashing.
 *
 * 10 was OWASP's baseline in the 2010s but on modern CPUs it clocks in
 * at ~10 ms/hash — cheap enough that offline-cracking throughput is
 * uncomfortable. 12 is the 2023+ OWASP recommendation (~100 ms/hash),
 * a sweet-spot between user-perceived login latency and attacker cost.
 *
 * Kept as a module-level constant so every hashing site (sign-up,
 * password reset, password change, e2e seed) agrees. If we ever raise
 * it, rehash-on-login in `authorize()` will migrate existing users.
 */
export const BCRYPT_COST = 12;

/** Hash a password with the current project-wide bcrypt cost. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Read the cost factor embedded in a bcrypt hash, e.g. `$2a$10$...` →
 * 10. Returns `null` for malformed hashes. Callers use this to decide
 * whether to rehash on successful login (upgrading existing accounts).
 */
export function bcryptCostOf(hash: string): number | null {
  const m = /^\$2[aby]?\$(\d{2})\$/.exec(hash);
  return m ? Number(m[1]) : null;
}
