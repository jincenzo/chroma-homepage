import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

export class PreviewError extends Error {
  constructor(message: string, readonly statusCode = 422) { super(message); }
}

export function validateRemoteUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new PreviewError("Enter a valid HTTP or HTTPS URL.", 400); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new PreviewError("Use HTTP or HTTPS without credentials in the URL.", 400);
  }
  if (url.hostname === "metadata.google.internal") throw new PreviewError("This destination is not allowed.", 400);
  url.hash = "";
  return url;
}

export function validateRemoteAddress(address: string, allowLocalNetwork: boolean): void {
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  if (parsed.toNormalizedString() === "fd00:ec2:0:0:0:0:0:254") throw new PreviewError("This destination is not allowed.", 400);
  const range = parsed.range();
  if (range === "unicast") return;
  if (["private", "loopback", "uniqueLocal"].includes(range)) {
    if (allowLocalNetwork) return;
    throw new PreviewError("This is a local address. Enable “Allow local network” to fetch this service.", 400);
  }
  // Link-local, multicast, unspecified, reserved and cloud metadata ranges are never fetched.
  throw new PreviewError("This destination is not allowed.", 400);
}

export interface RemotePage {
  url: URL;
  body: Buffer;
  contentType: string;
  status: number;
  etag?: string;
  cacheControl?: string;
}

async function resolveHost(hostname: string, signal: AbortSignal) {
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try { return await Promise.race([lookup(hostname, { all: true }), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

/** Resolve and pin each destination, including redirects, to prevent DNS rebinding. */
export async function fetchRemotePage(input: string, options: {
  allowLocalNetwork: boolean; maxBytes: number; signal: AbortSignal;
  headers?: Record<string, string>; allowNotModified?: boolean; maxRedirects?: number;
}): Promise<RemotePage> {
  let url = validateRemoteUrl(input);
  for (let redirect = 0; redirect <= (options.maxRedirects ?? 4); redirect++) {
    options.signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await resolveHost(hostname, options.signal);
    options.signal.throwIfAborted();
    if (!addresses.length) throw new PreviewError("The hostname could not be resolved.");
    for (const { address } of addresses) validateRemoteAddress(address, options.allowLocalNetwork);
    const address = addresses[0];
    const result = await new Promise<Omit<RemotePage, "url"> & { redirect?: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        signal: options.signal,
        agent: false,
        lookup: (_hostname, _options, callback) => {
          // Modern Node may request all addresses; both forms use the validated address.
          if (_options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: {
          "user-agent": "Chroma-Homepage/0.1 LinkPreview",
          accept: "text/html, image/*;q=0.9, */*;q=0.1",
          ...options.headers,
          "accept-encoding": "identity"
        }
      }, (response) => {
        const status = response.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.destroy();
          resolve({ body: Buffer.alloc(0), contentType: "", status, redirect: response.headers.location });
          return;
        }
        if (status === 304 && options.allowNotModified) {
          response.destroy();
          resolve({ body: Buffer.alloc(0), contentType: "", status, etag: response.headers.etag, cacheControl: response.headers["cache-control"] });
          return;
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          reject(new PreviewError(`The site returned HTTP ${status}. You can still enter details manually.`));
          return;
        }
        if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
          response.destroy();
          reject(new PreviewError("The site returned an unsupported compressed response."));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy(new PreviewError("The remote response is too large."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ body: Buffer.concat(chunks), contentType: response.headers["content-type"] ?? "", status, etag: response.headers.etag, cacheControl: response.headers["cache-control"] }));
      });
      request.on("error", reject);
      request.end();
    });
    if (!result.redirect) return { url, ...result };
    url = validateRemoteUrl(new URL(result.redirect, url).href);
  }
  throw new PreviewError("The site redirected too many times.");
}
