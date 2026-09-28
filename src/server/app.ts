import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { ConfigRepository } from "./persistence";
import { linkPreviewRequestSchema } from "../shared/link-preview";
import { discoverLink } from "./link-preview";
import { PreviewError } from "./remote-page";
import { ProfileRepository } from "./profiles";
import { formulaOneCredentialSchema } from "../shared/formula-one";
import { FormulaOneError, FormulaOneService } from "./formula-one";
import { SecretRepository } from "./secrets";
import { gamingCredentialSchema, gamingHttpQuerySchema, gamingQuerySchema } from "../shared/gaming";
import { GamingError, GamingService } from "./gaming";
import { MotoGpError, MotoGpService } from "./motogp";
import { DashboardBundleError, exportDashboard, importDashboard } from "./dashboard-bundle";
import { MAX_BUNDLE_BYTES, MAX_CONFIG_BYTES } from "../shared/dashboard-bundle";

const mimeExtensions: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico"
};

export interface AppOptions { dataPath: string; defaultConfigPath: string; clientPath?: string; secretKey?: string; fetchFormulaOne?: typeof fetch; fetchGaming?: typeof fetch; fetchMotoGp?: typeof fetch }

export async function createApp(options: AppOptions) {
  const app = Fastify({ logger: true });
  const repository = new ConfigRepository(options.dataPath, options.defaultConfigPath);
  await repository.initialize();
  const profiles = new ProfileRepository(options.dataPath, options.defaultConfigPath);
  const secrets = new SecretRepository(options.dataPath, options.secretKey ?? process.env.CHROMA_SECRET_KEY);
  await secrets.initialize();
  const formulaOne = new FormulaOneService(secrets, options.fetchFormulaOne);
  const gaming = new GamingService(secrets, options.fetchGaming);
  const motoGp = new MotoGpService(options.fetchMotoGp);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DashboardBundleError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof ZodError) return reply.code(400).send({ error: "Invalid profile or configuration", issues: error.issues });
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return reply.code(404).send({ error: "Profile not found" });
    reply.send(error);
  });
  app.get("/api/profiles", async () => profiles.list());
  app.post("/api/profiles", async (request, reply) => reply.code(201).send(await profiles.create(request.body)));
  app.get<{ Params: { id: string } }>("/api/profiles/:id/config", async (request) => profiles.config(request.params.id).read());
  app.put<{ Params: { id: string } }>("/api/profiles/:id/config", async (request) => {
    const target = profiles.config(request.params.id);
    // PUT updates existing profiles only; it never creates one on a mistyped ID.
    await target.read();
    return target.write(request.body);
  });

  app.get("/api/config", async () => repository.read());
  let transferPending = false;
  app.post("/api/dashboard/export", { bodyLimit: MAX_CONFIG_BYTES }, async (request, reply) => {
    if (transferPending) return reply.code(429).send({ error: "Another dashboard transfer is in progress. Please try again shortly." });
    transferPending = true;
    try {
      const archive = await exportDashboard(request.body, repository.assetsPath);
      return reply.header("Cache-Control", "no-store").header("Content-Disposition", 'attachment; filename="chroma-dashboard.zip"').type("application/zip").send(archive);
    } finally { transferPending = false; }
  });
  app.post("/api/dashboard/import", async (request, reply) => {
    if (transferPending) return reply.code(429).send({ error: "Another dashboard transfer is in progress. Please try again shortly." });
    transferPending = true;
    try {
      let input: Buffer | undefined;
      for await (const part of request.parts({ limits: { fileSize: MAX_BUNDLE_BYTES, files: 1, fields: 0, parts: 1 } })) {
        if (part.type === "file") input = await part.toBuffer();
      }
      if (!input) return reply.code(400).send({ error: "Choose a Chroma dashboard ZIP or JSON file." });
      return reply.header("Cache-Control", "no-store").send(await importDashboard(input, repository.assetsPath));
    } finally { transferPending = false; }
  });
  for (const view of ["next-race", "rider-standings"] as const) {
    app.get(`/api/widgets/motogp/${view}`, async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      try { return view === "next-race" ? await motoGp.nextRace() : await motoGp.standings(); }
      catch (error) {
        if (error instanceof MotoGpError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    });
  }
  app.get("/api/integrations/isthereanydeal", async (_request, reply) => {
    return reply.header("Cache-Control", "no-store").send({ configured: await gaming.configured() });
  });
  app.put("/api/integrations/isthereanydeal", { bodyLimit: 2048 }, async (request, reply) => {
    const parsed = gamingCredentialSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid IsThereAnyDeal API key (8–256 letters, digits, underscores or hyphens)." });
    await gaming.setApiKey(parsed.data.apiKey);
    return reply.header("Cache-Control", "no-store").send({ configured: true });
  });
  app.delete("/api/integrations/isthereanydeal", async (_request, reply) => {
    await gaming.deleteApiKey();
    return reply.header("Cache-Control", "no-store").send({ configured: false });
  });
  app.get("/api/widgets/gaming", async (request, reply) => {
    const parsed = gamingHttpQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid gaming filters." });
    reply.header("Cache-Control", "no-store");
    try { return await gaming.games(parsed.data); }
    catch (error) {
      if (error instanceof GamingError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get("/api/widgets/gaming/shops", async (request, reply) => {
    const parsed = gamingQuerySchema.pick({ country: true }).strict().safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid store country." });
    try { return await gaming.shops(parsed.data.country); }
    catch (error) {
      if (error instanceof GamingError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get("/api/integrations/api-sports-formula-one", async (_request, reply) => {
    return reply.header("Cache-Control", "no-store").send({ configured: await formulaOne.configured() });
  });
  app.put("/api/integrations/api-sports-formula-one", { bodyLimit: 2048 }, async (request, reply) => {
    const credential = formulaOneCredentialSchema.parse(request.body);
    await formulaOne.setApiKey(credential.apiKey);
    return reply.header("Cache-Control", "no-store").send({ configured: true });
  });
  app.delete("/api/integrations/api-sports-formula-one", async (_request, reply) => {
    await formulaOne.deleteApiKey();
    return reply.header("Cache-Control", "no-store").send({ configured: false });
  });
  app.get("/api/widgets/formula-one/next-race", async (_request, reply) => {
    try { return await formulaOne.nextRace(); }
    catch (error) {
      if (error instanceof FormulaOneError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get("/api/widgets/formula-one/driver-standings", async (_request, reply) => {
    try { return await formulaOne.driverStandings(); }
    catch (error) {
      if (error instanceof FormulaOneError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  let pendingPreviews = 0;
  app.post("/api/link-preview", { bodyLimit: 4096 }, async (request, reply) => {
    const parsed = linkPreviewRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid URL." });
    if (pendingPreviews >= 3) return reply.code(429).send({ error: "Too many previews in progress. Try again shortly." });
    pendingPreviews++;
    try {
      return await discoverLink(parsed.data, repository.assetsPath);
    } catch (error) {
      if (error instanceof PreviewError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    } finally { pendingPreviews--; }
  });
  app.put("/api/config", async (request, reply) => {
    try {
      return await repository.write(request.body);
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Invalid configuration", issues: error.issues });
      throw error;
    }
  });

  app.post("/api/assets", async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "An image file is required" });
    const extension = mimeExtensions[part.mimetype];
    if (!extension) return reply.code(415).send({ error: "Unsupported image type" });
    const id = crypto.randomUUID();
    await writeFile(path.join(repository.assetsPath, `${id}${extension}`), await part.toBuffer(), { flag: "wx" });
    return reply.code(201).send({ id, url: `/api/assets/${id}` });
  });

  app.get<{ Params: { id: string } }>("/api/assets/:id", async (request, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) return reply.code(400).send({ error: "Invalid asset id" });
    const filename = (await readdir(repository.assetsPath)).find((name) => name.startsWith(`${request.params.id}.`));
    if (!filename) return reply.code(404).send({ error: "Asset not found" });
    return reply.header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .type(extensionMime(path.extname(filename))).send(createReadStream(path.join(repository.assetsPath, filename)));
  });

  if (options.clientPath) {
    await app.register(fastifyStatic, { root: options.clientPath, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}

function extensionMime(extension: string): string {
  return Object.entries(mimeExtensions).find(([, value]) => value === extension)?.[0] ?? "application/octet-stream";
}

export const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
