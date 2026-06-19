/**
 * Sovereign, open-source video meeting links.
 *
 * Elevay sells sovereignty + open source, so we never mint Google Meet or
 * Microsoft Teams rooms — those are proprietary US Big Tech (CLOUD Act) and
 * would contradict the pitch the moment a prospect opens the calendar invite.
 *
 * Instead we mint a Jitsi room URL (Apache-2.0, self-hostable). A Jitsi room
 * exists the instant someone navigates to its URL — there is no vendor API,
 * no API key and no account to provision — so creating a meeting here is pure,
 * dependency-free string construction.
 *
 * VIDEO_MEET_BASE_URL should point at a Jitsi instance you control on EU/CH
 * infrastructure (e.g. https://visio.pilae.ch) for the sovereign guarantee.
 * When unset it falls back to the public meet.jit.si so the visio works with
 * zero setup (no DNS, no account) — non-sovereign, so getVideoMeetBaseUrl
 * warns in prod. The link is injected into the calendar event's standard fields
 * (location / description / URL) so every calendar — Google, Outlook,
 * Infomaniak, Apple — renders it as a first-class meeting with a join link,
 * exactly like a native Meet/Teams invite, minus the proprietary widget.
 */

import { randomBytes } from "node:crypto";

/**
 * Unambiguous room alphabet: lowercase letters minus the easily-confused
 * `l`/`o`, plus digits 2-9 (no `0`/`1`). Keeps a spoken/typed room name
 * unmistakable while staying high-entropy.
 */
const ROOM_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Length of the random part of a room name. 18 chars over a 32-symbol
 *  alphabet ≈ 90 bits of entropy — not guessable, so the room can't be
 *  squatted before the call. */
const ROOM_ID_LENGTH = 18;

/**
 * Public instances we must never use in production: they are operated outside
 * EU/CH sovereignty (8x8 / US). Matched on the exact host or any subdomain.
 */
const NON_SOVEREIGN_HOSTS = ["meet.jit.si", "8x8.vc"];

/** Default when VIDEO_MEET_BASE_URL is unset: the public Jitsi, which works
 *  with ZERO setup (no DNS, no account, browser join) so the visio is usable
 *  before you stand up your own host. meet.jit.si is operated by 8x8 (US) —
 *  set VIDEO_MEET_BASE_URL to a Jitsi instance you control for sovereignty. */
const DEFAULT_BASE_URL = "https://meet.jit.si";

/** Minimal env shape we read — `process.env` satisfies it, and tests can pass
 *  a plain object without supplying every NodeJS.ProcessEnv key. */
type EnvLike = {
  VIDEO_MEET_BASE_URL?: string;
  VIDEO_MEET_JOIN_CONFIG?: string;
  NODE_ENV?: string;
};

/**
 * Client config appended to the join URL as a fragment. The prospect must be
 * able to join with zero friction: `disableDeepLinking=true` stops Jitsi's
 * mobile "open in the app" interstitial, so a phone joins straight in the
 * browser — no install, no account, no password (the unguessable room name is
 * the only guard). Desktop is browser-native already.
 *
 * Set VIDEO_MEET_JOIN_CONFIG to override (e.g. add `&config.prejoinConfig.enabled=false`)
 * or to "" to drop the fragment once the instance enforces this server-side.
 */
const DEFAULT_JOIN_CONFIG = "config.disableDeepLinking=true";

function joinConfigFragment(env: EnvLike): string {
  const cfg = env.VIDEO_MEET_JOIN_CONFIG ?? DEFAULT_JOIN_CONFIG;
  const trimmed = cfg.trim();
  return trimmed ? `#${trimmed}` : "";
}

export interface SovereignMeeting {
  /** Full join URL the prospect clicks. */
  joinUrl: string;
  /** The unguessable room slug (also useful as an idempotency handle). */
  roomName: string;
  /** Always "jitsi": the engine is open source by construction. */
  provider: "jitsi";
}

function highEntropyRoomId(length = ROOM_ID_LENGTH): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
  }
  return out;
}

/** Turn a free-text prefix into a short, URL-safe, lowercase token. */
function sanitisePrefix(prefix: string | undefined): string {
  const cleaned = (prefix ?? "elevay")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return cleaned || "elevay";
}

/**
 * Resolve and validate the sovereign video host. Throws in production if the
 * configured host is a known non-sovereign public instance, and on any value
 * that isn't a valid URL. `env` is injectable for tests.
 */
export function getVideoMeetBaseUrl(env: EnvLike = process.env): string {
  const raw = (env.VIDEO_MEET_BASE_URL || "").trim().replace(/\/+$/, "");
  const base = raw || DEFAULT_BASE_URL;

  let host: string;
  try {
    host = new URL(base).host.toLowerCase();
  } catch {
    throw new Error(`VIDEO_MEET_BASE_URL is not a valid URL: "${base}"`);
  }

  // Non-sovereign host (the meet.jit.si default, or 8x8) → warn but proceed:
  // the visio must still work before a sovereign host is configured.
  // Sovereignty = setting VIDEO_MEET_BASE_URL to your own EU/CH Jitsi instance.
  if (
    env.NODE_ENV === "production" &&
    NON_SOVEREIGN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  ) {
    console.warn(
      `[video-meeting] using non-sovereign host ${host}. Set VIDEO_MEET_BASE_URL ` +
        `to a Jitsi instance you control on EU/CH infrastructure for the sovereign guarantee.`,
    );
  }

  return base;
}

/**
 * Mint a fresh sovereign video room. Pure: no network call, no vendor API.
 *
 * @param opts.prefix Human-readable room prefix (e.g. tenant slug "pilae").
 * @param opts.env    Injectable environment (tests).
 */
export function createSovereignMeeting(opts?: {
  prefix?: string;
  env?: EnvLike;
}): SovereignMeeting {
  const env = opts?.env ?? process.env;
  const base = getVideoMeetBaseUrl(env);
  // roomName stays clean (it's the ICS UID / idempotency handle); the join URL
  // carries the no-friction client config fragment the prospect clicks.
  const roomName = `${sanitisePrefix(opts?.prefix)}-${highEntropyRoomId()}`;
  return {
    joinUrl: `${base}/${roomName}${joinConfigFragment(env)}`,
    roomName,
    provider: "jitsi",
  };
}
