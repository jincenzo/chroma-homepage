import { randomUUID } from "node:crypto";
import { z } from "zod";
import { remoteCardPayloadSchema, remoteCredentialInputSchema, remoteHouseExample, remoteRequestSchema, type RemoteCredentialInput, type RemotePayload, type RemoteSettings, type RemoteWidget } from "../shared/remote-card";
import { fetchRemotePage, PreviewError, validateRemoteUrl } from "./remote-page";
import { SecretRepository } from "./secrets";

export class RemoteCardError extends Error {
  constructor(message: string, readonly statusCode = 422) { super(message); }
}
type Entry = { data?: RemotePayload; fetchedAt?: string; etag?: string; cacheControl?: string; ttl: number; expires: number; retryAt: number; failures: number; error?: string; errorStatus?: number };
const clamp = (seconds: number) => Math.max(30, Math.min(3600, Math.floor(seconds)));
const credentialName = (id: string) => `remote-card:${id}`;
const normalized = (endpoint: string) => validateRemoteUrl(endpoint).href;
const idSchema = z.string().uuid();

export class RemoteCardService {
  private cache = new Map<string, Entry>();
  private pending = new Map<string, Promise<RemoteWidget>>();
  constructor(private secrets: SecretRepository, private fetcher = fetchRemotePage, private now = Date.now) {}

  async createCredential(input: RemoteCredentialInput) {
    const credential = remoteCredentialInputSchema.parse(input);
    const credentialId = randomUUID();
    await this.secrets.set(credentialName(credentialId), JSON.stringify({ ...credential, endpoint: normalized(credential.endpoint) }));
    return { configured: true, credentialId };
  }
  async credentialStatus(id: string) { return { configured: await this.secrets.has(credentialName(idSchema.parse(id))) }; }
  async deleteCredential(id: string) {
    await this.secrets.delete(credentialName(idSchema.parse(id)));
    // Clear possibly private cached responses as well, not just their secret.
    this.cache.clear();
    return { configured: false };
  }

  async load(input: RemoteSettings): Promise<RemoteWidget> {
    const settings = remoteRequestSchema.parse(input);
    if (settings.endpoint === "demo:house") {
      return { data: remoteHouseExample(new Date(this.now()).toISOString()), fetchedAt: new Date(this.now()).toISOString(), stale: false, cache: "fresh", nextRefreshSeconds: settings.refreshSeconds };
    }
    const endpoint = normalized(settings.endpoint);
    let token: string | undefined;
    if (settings.authMode !== "none") {
      const raw = settings.credentialId && await this.secrets.get(credentialName(settings.credentialId));
      if (!raw) throw new RemoteCardError("Save a credential for this endpoint first. Imported dashboards need credentials configured again.", 401);
      const saved = remoteCredentialInputSchema.parse(JSON.parse(raw));
      if (saved.endpoint !== endpoint || saved.authMode !== settings.authMode) throw new RemoteCardError("The credential belongs to a different endpoint or authentication mode. Save a new credential.", 401);
      token = saved.secret;
    }
    // A local-access toggle or credential change must never reuse a less restrictive cache entry.
    const key = JSON.stringify([endpoint, settings.allowLocalNetwork, settings.authMode, settings.authMode === "none" ? null : settings.credentialId]);
    const entry = this.cache.get(key);
    if (entry) { this.cache.delete(key); this.cache.set(key, entry); }
    if (entry && entry.retryAt > this.now()) {
      if (entry.data) return this.widget(entry, settings, "stale");
      throw new RemoteCardError(entry.error ?? "Endpoint unavailable. Retrying shortly.", entry.errorStatus);
    }
    if (entry?.data && entry.expires > this.now()) return this.widget(entry, settings, "cached");
    const existing = this.pending.get(key);
    if (existing) {
      const result = await existing;
      return { ...result, nextRefreshSeconds: Math.max(settings.refreshSeconds, result.nextRefreshSeconds) };
    }
    if (this.pending.size >= 3) throw new RemoteCardError("Too many remote endpoints loading. Try again shortly.", 429);
    const task = this.refresh(key, endpoint, settings, token, entry);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  private widget(entry: Entry, settings: RemoteSettings, cache: RemoteWidget["cache"]): RemoteWidget {
    return { data: entry.data!, fetchedAt: entry.fetchedAt!, stale: cache === "stale", cache,
      nextRefreshSeconds: Math.max(settings.refreshSeconds, Math.ceil(((cache === "stale" ? entry.retryAt : entry.expires) - this.now()) / 1000), 30),
      ...(cache === "stale" ? { error: entry.error } : {}) };
  }
  private store(key: string, entry: Entry) {
    this.cache.delete(key); this.cache.set(key, entry);
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
  }
  private async refresh(key: string, endpoint: string, settings: RemoteSettings, token?: string, previous?: Entry): Promise<RemoteWidget> {
    try {
      const headers: Record<string, string> = { accept: "application/json", "user-agent": "Chroma-Homepage/0.1 RemoteCard" };
      if (previous?.etag) headers["if-none-match"] = previous.etag;
      if (token) headers[settings.authMode === "bearer" ? "authorization" : "x-api-key"] = settings.authMode === "bearer" ? `Bearer ${token}` : token;
      const response = await this.fetcher(endpoint, { allowLocalNetwork: settings.allowLocalNetwork, maxBytes: 64 * 1024, signal: AbortSignal.timeout(5000), headers,
        allowNotModified: true, maxRedirects: token ? 0 : 4 });
      let data: RemotePayload;
      if (response.status === 304) {
        if (!previous?.data) throw new RemoteCardError("Endpoint returned 304 before providing any valid data.");
        data = previous.data;
      } else {
        if (!/^application\/(?:json|[\w.-]+\+json)\b/i.test(response.contentType)) throw new RemoteCardError("Endpoint must return Content-Type: application/json.");
        if (token && response.body.toString("utf8").includes(token)) throw new RemoteCardError("Endpoint echoed its credential. Response withheld for safety.");
        let json: unknown;
        try { json = JSON.parse(response.body.toString("utf8")); } catch { throw new RemoteCardError("Endpoint returned malformed JSON."); }
        const parsed = remoteCardPayloadSchema.safeParse(json);
        if (!parsed.success) {
          // Report paths only: remote values/messages might contain credentials or private data.
          const paths = [...new Set(parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".") || "root"))];
          throw new RemoteCardError(`Invalid chroma-card/v1 response. Check: ${paths.join(", ")}. See the protocol guide.`);
        }
        data = parsed.data;
        if (token && JSON.stringify(data).includes(token)) throw new RemoteCardError("Endpoint echoed its credential. Response withheld for safety.");
      }
      const cacheControl = response.cacheControl ?? (response.status === 304 ? previous?.cacheControl : undefined);
      const headerTtl = cacheControl?.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i)?.[1];
      const ttl = clamp(headerTtl ? Number(headerTtl) : response.status === 304 ? previous!.ttl : data.ttlSeconds ?? 60);
      const entry: Entry = { data, fetchedAt: new Date(this.now()).toISOString(), cacheControl, ttl, expires: this.now() + ttl * 1000, retryAt: 0, failures: 0,
        etag: response.etag && response.etag.length <= 512 && /^[\x20-\x7e]+$/.test(response.etag) ? response.etag : response.status === 304 ? previous?.etag : undefined };
      if (/\bno-store\b/i.test(cacheControl ?? "")) this.cache.delete(key);
      else { if (/\bno-cache\b/i.test(cacheControl ?? "")) entry.expires = this.now(); this.store(key, entry); }
      return this.widget(entry, settings, response.status === 304 ? "revalidated" : "fresh");
    } catch (cause) {
      const error = cause instanceof RemoteCardError ? cause : cause instanceof PreviewError && cause.statusCode === 400
        ? new RemoteCardError(cause.message, 400) : new RemoteCardError("Could not read the endpoint. Check its URL, authentication, TLS certificate, response size (64 KB) and timeout (5 seconds). Authenticated endpoints must not redirect.");
      const failures = (previous?.failures ?? 0) + 1;
      const entry: Entry = { ...previous, ttl: previous?.ttl ?? 60, expires: 0, failures, retryAt: this.now() + Math.min(900, 30 * 2 ** Math.min(failures - 1, 5)) * 1000, error: error.message, errorStatus: error.statusCode };
      this.store(key, entry);
      if (entry.data) return this.widget(entry, settings, "stale");
      throw error;
    }
  }
}
