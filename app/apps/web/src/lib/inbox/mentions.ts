/**
 * @mention parsing for team comments (INBOX-X02 core). Pure + unit-tested.
 *
 * Resolves @[Full Name] and @firstname mentions in a private team comment against
 * the workspace members, returning who to notify + any unresolved handles. The
 * comment store, notification fan-out (INBOX-N01) and the composer UI are the
 * wiring on top (residual). Per-tenant member list is supplied by the caller.
 */

export interface MentionMember {
  id: string;
  name: string;
}

export interface MentionResult {
  mentioned: MentionMember[];
  unknown: string[];
}

const BRACKET = /@\[([^\]]+)\]/g;
const HANDLE = /(?:^|\s)@([A-Za-z][\w.-]*)/g;

export function parseMentions(text: string, members: MentionMember[]): MentionResult {
  const mentioned: MentionMember[] = [];
  const unknown: string[] = [];
  const seenIds = new Set<string>();
  const seenUnknown = new Set<string>();

  const resolve = (raw: string) => {
    const q = raw.trim().toLowerCase();
    if (!q) return;
    const found = members.find(
      (m) =>
        m.name.toLowerCase() === q ||
        m.name.toLowerCase().split(/\s+/)[0] === q ||
        m.id.toLowerCase() === q,
    );
    if (found) {
      if (!seenIds.has(found.id)) {
        seenIds.add(found.id);
        mentioned.push(found);
      }
    } else if (!seenUnknown.has(q)) {
      seenUnknown.add(q);
      unknown.push(raw.trim());
    }
  };

  let m: RegExpExecArray | null;
  while ((m = BRACKET.exec(text || "")) !== null) resolve(m[1]);
  while ((m = HANDLE.exec(text || "")) !== null) resolve(m[1]);

  return { mentioned, unknown };
}
