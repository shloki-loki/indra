import { CODE_PATTERN } from '@indra/room';

/**
 * Where online rooms live. Empty = same site (local dev, or the Cloudflare deploy that serves both).
 * A site hosted elsewhere (e.g. Vercel) sets VITE_ROOMS_URL to the room server's address at build time.
 */
export const ROOMS_URL: string = ((import.meta.env.VITE_ROOMS_URL as string | undefined) ?? '').replace(/\/$/, '');
/** False on a static-only deploy that has no room server yet. */
export const ONLINE_AVAILABLE: boolean = __ONLINE__;

export function roomSocketUrl(path: string): string {
  const base = ROOMS_URL || location.origin;
  return base.replace(/^http/, 'ws') + path;
}

export const cleanCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const isCode = (code: string): boolean => CODE_PATTERN.test(code);

export async function createRoom(): Promise<string> {
  const res = await fetch(`${ROOMS_URL}/api/rooms`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.code) throw new Error(body.error ?? "Couldn't make a room. Check your connection and try again.");
  return body.code;
}

export async function roomInfo(code: string, cid: string): Promise<{ exists: boolean; joinable: boolean; reason?: string }> {
  const res = await fetch(`${ROOMS_URL}/api/rooms/${code}?cid=${encodeURIComponent(cid)}`);
  const body = await res.json().catch(() => null);
  if (!body) throw new Error("Couldn't reach the game server. Check your connection and try again.");
  return body;
}

export function inviteLink(code: string): string {
  return `${location.origin}/?room=${code}`;
}
