/**
 * EmailEngine REST API client
 * Manages email sending, account registration, and webhooks
 */

const EE_BASE = process.env.EMAILENGINE_URL || "http://localhost:3100";

async function eeFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { method = "GET", body } = options;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${EE_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EmailEngine ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// Register a mailbox (SMTP/IMAP credentials)
export async function registerAccount(params: {
  accountId: string;
  name: string;
  email: string;
  imap: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };
  smtp: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };
}) {
  return eeFetch("/v1/account", {
    method: "POST",
    body: {
      account: params.accountId,
      name: params.name,
      imap: params.imap,
      smtp: params.smtp,
    },
  });
}

// Register a mailbox via OAuth (Google)
export async function registerOAuthAccount(params: {
  accountId: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}) {
  return eeFetch("/v1/account", {
    method: "POST",
    body: {
      account: params.accountId,
      name: params.name,
      oauth2: {
        provider: "gmail",
        auth: { user: params.email },
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
      },
    },
  });
}

// Send an email
export async function sendEmail(
  accountId: string,
  email: {
    from: { name: string; address: string };
    to: { address: string }[];
    subject: string;
    html: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
    headers?: Record<string, string>;
  }
): Promise<{ messageId: string; id: string; response: string }> {
  const body: Record<string, unknown> = {
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
  };
  if (email.text) body.text = email.text;
  // Merge threading headers first, then any caller-supplied headers (e.g.
  // List-Unsubscribe One-Click). Only attach body.headers when non-empty so
  // a plain send still POSTs no headers key (compat).
  const headers: Record<string, string> = {};
  if (email.inReplyTo) {
    headers["In-Reply-To"] = email.inReplyTo;
    headers["References"] = email.references || email.inReplyTo;
  }
  if (email.headers) Object.assign(headers, email.headers);
  if (Object.keys(headers).length > 0) body.headers = headers;
  return eeFetch(`/v1/account/${accountId}/submit`, {
    method: "POST",
    body,
  });
}

// Get account status
export async function getAccountStatus(accountId: string) {
  return eeFetch<{ account: string; state: string }>(`/v1/account/${accountId}`);
}

// Delete an account
export async function deleteAccount(accountId: string) {
  return eeFetch(`/v1/account/${accountId}`, { method: "DELETE" });
}

// Configure webhook
export async function configureWebhook(url: string) {
  return eeFetch("/v1/webhooks", {
    method: "POST",
    body: { type: "all", url },
  });
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    await eeFetch("/v1/settings");
    return true;
  } catch {
    return false;
  }
}
