import { x25519 } from '@noble/curves/ed25519';
import { randomBytes } from 'crypto';

/**
 * Generate a WireGuard key pair (private key and public key)
 * @returns Object containing base64-encoded private and public keys
 */
export function generateWireguardKeyPair(): {
  privateKey: string;
  publicKey: string;
} {
  // Generate random 32-byte private key
  const privateKeyBytes = randomBytes(32);

  // Clamp the private key (WireGuard requirement)
  privateKeyBytes[0] &= 248;
  privateKeyBytes[31] &= 127;
  privateKeyBytes[31] |= 64;

  // Derive public key from private key
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);

  // Convert to base64
  const privateKey = Buffer.from(privateKeyBytes).toString('base64');
  const publicKey = Buffer.from(publicKeyBytes).toString('base64');

  return {
    privateKey,
    publicKey,
  };
}

/**
 * Derive public key from a private key
 * @param privateKey Base64-encoded private key
 * @returns Base64-encoded public key
 */
export function derivePublicKey(privateKey: string): string {
  const privateKeyBytes = Buffer.from(privateKey, 'base64');

  if (privateKeyBytes.length !== 32) {
    throw new Error('Invalid private key length');
  }

  // Derive public key
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);

  return Buffer.from(publicKeyBytes).toString('base64');
}

/**
 * Validate a WireGuard key (must be 32 bytes when decoded from base64)
 * @param key Base64-encoded key
 * @returns true if valid
 */
export function validateWireguardKey(key: string): boolean {
  try {
    const keyBytes = Buffer.from(key, 'base64');
    return keyBytes.length === 32;
  } catch {
    return false;
  }
}
