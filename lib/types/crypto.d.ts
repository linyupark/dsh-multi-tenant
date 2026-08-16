/** Hash a password into a self-describing scrypt envelope. */
export declare function hashPassword(password: string): string;
/** Verify a password against an envelope; false for anything malformed. */
export declare function verifyPassword(password: string, envelope: string): boolean;
/** Mint a fresh 64-hex-char bearer token. */
export declare function newToken(): string;
/** sha256 fingerprint of a token — the only form persisted at rest. */
export declare function tokenFingerprint(token: string): string;
