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
 * VIDEO_MEET_BASE_URL must point at a Jitsi instance you control on EU/CH
 * infrastructure (e.g. https://visio.pilae.ch). It must NOT point at
 * meet.jit.si in production: that public instance is operated by 8x8 (US),
 * which would defeat the sovereignty guarantee — `getVideoMeetBaseUrl` rejects
 * it there. The link is injected into the calendar event's standard fields
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

/** The host we intend to stand up; used as the stable default so link shapes
 *  are correct before DNS is wired. Override via VIDEO_MEET_BASE_URL. */
const DEFAULT_SOVEREIGN_BASE_URL = "https://visio.pilae.ch";

/** Minimal env shape we read — `process.env` satisfies it, and tests can pass
 *  a plain object without supplying every NodeJS.ProcessEnv key. */
type EnvLike = { VIDEO_MEET_BASE_URL?: string; NODE_ENV?: string };

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
  const base = raw || DEFAULT_SOVEREIGN_BASE_URL;

  let host: string;
  try {
    host = new URL(base).host.toLowerCase();
  } catch {
    throw new Error(`VIDEO_MEET_BASE_URL is not a valid URL: "${base}"`);
  }

  const isProd = env.NODE_ENV === "production";
  if (
    isProd &&
    NON_SOVEREIGN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  ) {
    throw new Error(
      `VIDEO_MEET_BASE_URL points at a non-sovereign host (${host}). ` +
        `Point it at a Jitsi instance you control on EU/CH infrastructure.`,
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
  const base = getVideoMeetBaseUrl(opts?.env);
  const roomName = `${sanitisePrefix(opts?.prefix)}-${highEntropyRoomId()}`;
  return { joinUrl: `${base}/${roomName}`, roomName, provider: "jitsi" };
}
