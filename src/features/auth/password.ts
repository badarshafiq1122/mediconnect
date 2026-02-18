import bcrypt from "bcryptjs";

// bcryptjs (pure JS) instead of native bcrypt: identical hashes, no node-gyp/prebuilt-binary failures.
export const BCRYPT_COST = 12;

/**
 * Hash of a throwaway string. Compared against when the account does not exist so that a login attempt
 * costs the same time whether or not the email is registered (no user-enumeration timing signal).
 */
export const DUMMY_HASH = "$2b$12$rYPlgW6hR32kI6pj8/.mmezd2vQ2REOQU44U1zhpt4wCGw83uyUQ6";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
