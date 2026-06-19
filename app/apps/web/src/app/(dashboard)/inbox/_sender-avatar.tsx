/**
 * Shared initials avatar for a sender (INBOX-R06). Deterministic, no remote logo
 * fetch and no provider name — initials + a stable colour derived purely from the
 * sender address (so the same person always gets the same chip across the list
 * and the reading pane). The palette is self-contained (its own light chip on any
 * theme), reusing the pure, unit-tested helpers in lib/inbox/sender-auth.
 */
import { initialsFor, avatarColorIndex } from "@/lib/inbox/sender-auth";

// Ten distinct hues; the chip is a light disc with darker same-hue text, legible
// on both the light and dark inbox backgrounds.
const HUES = [8, 28, 48, 140, 188, 214, 258, 288, 322, 350];

export function SenderAvatar({
  name,
  email,
  size = 28,
}: {
  name: string;
  email: string;
  size?: number;
}) {
  const seed = (email || name || "?").toLowerCase();
  const hue = HUES[avatarColorIndex(seed, HUES.length)];
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `hsl(${hue} 58% 88%)`,
        color: `hsl(${hue} 52% 30%)`,
      }}
    >
      {initialsFor(name || email)}
    </span>
  );
}
