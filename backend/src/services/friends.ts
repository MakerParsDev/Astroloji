const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;

/** Excludes visually ambiguous characters (0/O, 1/I/L) since codes are read and typed by hand. */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length]).join('');
}

/** Friendships are undirected; storing a stable (user_a < user_b) order lets a UNIQUE constraint prevent duplicate pairs. */
export function normalizeFriendPair(userIdA: string, userIdB: string): [string, string] {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}
