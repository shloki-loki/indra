/** Who this browser is in online rooms: a random id (so a refresh rejoins your seat) and your nickname. */
const CID = 'indra-cid';
const NAME = 'indra-name';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: fine, this tab still works */
  }
}

let memoryId: string | null = null;
export function clientId(): string {
  const saved = read(CID);
  if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
  memoryId ??= Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  write(CID, memoryId);
  return memoryId;
}

export const savedName = (): string => read(NAME) ?? '';
export const saveName = (name: string): void => write(NAME, name);
