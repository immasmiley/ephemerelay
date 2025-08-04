import { secp256k1 } from "https://deno.land/x/noble_secp256k1@1.2.14/mod.ts";

export class NIP04 {
  /**
   * Encrypt content using NIP-04 specification
   * @param content - Content to encrypt
   * @param privkey - Sender's private key (hex)
   * @param pubkey - Recipient's public key (hex)
   */
  static async encrypt(content: string, privkey: string, pubkey: string): Promise<string> {
    // 1. Compute shared secret using ECDH
    const sharedPoint = secp256k1.getSharedSecret(privkey, '02' + pubkey);
    const sharedSecret = sharedPoint.slice(1, 33);

    // 2. Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(16));

    // 3. Create AES-CBC cipher
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );

    // 4. Encrypt the content
    const contentBytes = new TextEncoder().encode(content);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      contentBytes
    );

    // 5. Combine IV and ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt content using NIP-04 specification
   * @param content - Encrypted content (base64)
   * @param privkey - Recipient's private key (hex)
   * @param pubkey - Sender's public key (hex)
   */
  static async decrypt(content: string, privkey: string, pubkey: string): Promise<string> {
    // 1. Decode base64 content
    const combined = new Uint8Array(
      atob(content).split('').map(c => c.charCodeAt(0))
    );

    // 2. Extract IV and ciphertext
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);

    // 3. Compute shared secret using ECDH
    const sharedPoint = secp256k1.getSharedSecret(privkey, '02' + pubkey);
    const sharedSecret = sharedPoint.slice(1, 33);

    // 4. Create AES-CBC cipher
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    // 5. Decrypt the content
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Generate a new keypair for testing
   */
  static async generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true).slice(1); // Remove prefix

    return {
      privateKey: Buffer.from(privateKey).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex')
    };
  }
} 