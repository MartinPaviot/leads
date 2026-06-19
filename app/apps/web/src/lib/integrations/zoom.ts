/**
 * Zoom meetings via Server-to-Server OAuth.
 *
 * Optional: set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET (create a
 * "Server-to-Server OAuth" app in the Zoom Marketplace, scope meeting:write).
 * When unset, the "zoom" conferencing option falls back to the sovereign visio.
 *
 * Zoom is US Big Tech — it's offered because some prospects require it, but the
 * sovereign open-source visio stays the default.
 */

type ZoomEnv = {
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  NODE_ENV?: string;
};

export function zoomConfigured(env: ZoomEnv = process.env): boolean {
  return !!(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);
}

/** Account-credentials grant → short-lived access token. */
async function zoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID!;
  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) {
    throw new Error(`Zoom token failed ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Zoom token: no access_token in response");
  return data.access_token;
}

/** Create a scheduled Zoom meeting; returns the join URL to inject in the event. */
export async function createZoomMeeting(opts: {
  topic: string;
  startTime: Date;
  durationMinutes: number;
}): Promise<string> {
  const token = await zoomAccessToken();
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: opts.topic,
      type: 2, // scheduled
      start_time: opts.startTime.toISOString(),
      duration: opts.durationMinutes,
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!res.ok) {
    throw new Error(`Zoom create meeting failed ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { join_url?: string };
  if (!data.join_url) throw new Error("Zoom: no join_url in response");
  return data.join_url;
}
