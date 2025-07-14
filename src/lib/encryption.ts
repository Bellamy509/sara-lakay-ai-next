import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { ChatMessageContent } from "../types/chat";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits

export class MessageEncryption {
  constructor(private userKey: Buffer) {
    if (userKey.length !== KEY_LENGTH) {
      throw new Error("Invalid key length");
    }
  }

  static generateUserKey(): Buffer {
    return randomBytes(KEY_LENGTH);
  }

  encryptMessage(content: ChatMessageContent): {
    encryptedContent: Buffer;
    iv: Buffer;
  } {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.userKey, iv);

    const jsonContent = JSON.stringify(content);
    const encrypted = Buffer.concat([
      cipher.update(jsonContent, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    const encryptedContent = Buffer.concat([encrypted, authTag]);

    return { encryptedContent, iv };
  }

  decryptMessage(encryptedContent: Buffer, iv: Buffer): ChatMessageContent {
    const authTag = encryptedContent.slice(-16);
    const encrypted = encryptedContent.slice(0, -16);

    const decipher = createDecipheriv(ALGORITHM, this.userKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  // Fonction pour chiffrer la clé utilisateur avec une clé dérivée du mot de passe
  static async encryptUserKey(
    userKey: Buffer,
    password: string,
  ): Promise<Buffer> {
    const salt = randomBytes(16);
    const key = await this.deriveKey(password, salt);

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(userKey), cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Format: salt (16) + iv (16) + authTag (16) + encrypted
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  // Fonction pour déchiffrer la clé utilisateur
  static async decryptUserKey(
    encryptedKey: Buffer,
    password: string,
  ): Promise<Buffer> {
    const salt = encryptedKey.slice(0, 16);
    const iv = encryptedKey.slice(16, 32);
    const authTag = encryptedKey.slice(32, 48);
    const encrypted = encryptedKey.slice(48);

    const key = await this.deriveKey(password, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private static async deriveKey(
    password: string,
    _salt: Buffer,
  ): Promise<Buffer> {
    // Utiliser une fonction de dérivation de clé sécurisée
    // Note: Dans un environnement Node.js, vous pourriez utiliser crypto.pbkdf2Sync
    // Dans un environnement browser, vous pourriez utiliser SubtleCrypto.deriveBits
    return Buffer.from(password); // À remplacer par une vraie implémentation
  }
}
