// src/utils.ts
export function defaultSanitizeKey(key: string): string {
  if (!key) return key;

  // Ensure consistent casing before encoding
  key = key.toLowerCase();

  // Convert string to base64url format
  return Buffer.from(key)
    .toString('base64url')
    .replace(/=+$/, '');  // Remove padding
}
