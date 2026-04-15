"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button wired into the parent <form>'s pending state via
 * React's useFormStatus hook. Shows `busyLabel` and disables itself
 * while the server action is in flight, which prevents double-submits
 * (a real problem on sign-in/sign-up when the user double-clicks the
 * button and NextAuth gets two concurrent authorize() calls).
 *
 * I7 of the sign-in + S10 of the sign-up requirements.
 */
export function AuthSubmitButton({
  label,
  busyLabel,
  className = "",
}: {
  label: string;
  /** Defaults to `${label}…`. */
  busyLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`gradient-brand w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 ${className}`.trim()}
    >
      {pending ? (busyLabel ?? `${label}…`) : label}
    </button>
  );
}
