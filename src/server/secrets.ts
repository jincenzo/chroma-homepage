import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

interface SecretEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function decodeConfiguredKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("CHROMA_SECRET_KEY must be 32 bytes encoded as 64 hex characters or Base64");
  return key;
}

function isEnvelope(value: unknown): value is SecretEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SecretEnvelope>;
  return item.version === 1 && typeof item.iv === "string" && typeof item.tag === "string" && typeof item.ciphertext === "string";
}

/** Encrypted, server-only storage. Secret values are never exposed by a read API. */
export class SecretRepository {
  private readonly keyPath: string;
  private readonly secretsPath: string;
  private key!: Buffer;
  private pendingMutation: Promise<void> = Promise.resolve();

  constructor(private readonly dataPath: string, private readonly configuredKey?: string) {
    this.keyPath = path.join(dataPath, "secrets.key");
    this.secretsPath = path.join(dataPath, "secrets.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataPath, { recursive: true });
    this.key = this.configuredKey ? decodeConfiguredKey(this.configuredKey) : await this.loadOrCreateLocalKey();
    await this.readAll();
  }

  async has(name: string): Promise<boolean> {
    return Boolean((await this.readAll())[name]);
  }

  async get(name: string): Promise<string | undefined> {
    return (await this.readAll())[name];
  }

  async set(name: string, value: string): Promise<void> {
    await this.mutate(async () => {
      const values = await this.readAll();
      values[name] = value;
      await this.writeAll(values);
    });
  }

  async delete(name: string): Promise<void> {
    await this.mutate(async () => {
      const values = await this.readAll();
      delete values[name];
      await this.writeAll(values);
    });
  }

  private async loadOrCreateLocalKey(): Promise<Buffer> {
    try {
      const key = await readFile(this.keyPath);
      if (key.length !== 32) throw new Error("The local Chroma secret key is invalid");
      await chmod(this.keyPath, 0o600);
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const generated = randomBytes(32);
    try {
      await writeFile(this.keyPath, generated, { flag: "wx", mode: 0o600 });
      return generated;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const key = await readFile(this.keyPath);
      if (key.length !== 32) throw new Error("The local Chroma secret key is invalid", { cause: error });
      await chmod(this.keyPath, 0o600);
      return key;
    }
  }

  private async readAll(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.secretsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    const envelope: unknown = JSON.parse(raw);
    if (!isEnvelope(envelope)) throw new Error("The encrypted Chroma secret store is invalid");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
    const values: unknown = JSON.parse(plaintext);
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.values(values).some((value) => typeof value !== "string")) {
      throw new Error("The decrypted Chroma secret store is invalid");
    }
    return values as Record<string, string>;
  }

  private async writeAll(values: Record<string, string>): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
    const envelope: SecretEnvelope = {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    };
    const temporaryPath = path.join(this.dataPath, `.secrets-${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.secretsPath);
      await chmod(this.secretsPath, 0o600);
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }

  private async mutate(operation: () => Promise<void>): Promise<void> {
    const next = this.pendingMutation.then(operation, operation);
    this.pendingMutation = next.catch(() => undefined);
    return next;
  }
}
