import { parseConfig, type ChromaConfig } from "../../shared/config";
import { linkPreviewSchema } from "../../shared/link-preview";
import { profileSchema, profilesSchema, type CreateProfile } from "../../shared/profiles";
import { formulaOneCredentialStatusSchema, formulaOneStandingsSchema, formulaOneWidgetSchema } from "../../shared/formula-one";

const configUrl = (profileId: string) => `/api/profiles/${encodeURIComponent(profileId)}/config`;

export async function listProfiles() {
  const response = await fetch("/api/profiles");
  if (!response.ok) throw new Error("Could not load the profiles");
  return profilesSchema.parse(await response.json());
}

export async function createProfile(input: CreateProfile) {
  const response = await fetch("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error("Could not create the profile. Your existing homepage has not been changed.");
  const body = await response.json() as { profile: unknown; config: unknown };
  return { profile: profileSchema.parse(body.profile), config: parseConfig(body.config) };
}

export async function loadConfig(profileId = "default"): Promise<ChromaConfig> {
  const response = await fetch(configUrl(profileId));
  if (!response.ok) throw new Error("Could not load the configuration");
  return parseConfig(await response.json());
}

export async function saveConfig(config: ChromaConfig, profileId = "default"): Promise<ChromaConfig> {
  const response = await fetch(configUrl(profileId), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Could not save the configuration");
  }
  return parseConfig(await response.json());
}

export async function uploadAsset(file: File): Promise<{ id: string; url: string }> {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch("/api/assets", { method: "POST", body: data });
  if (!response.ok) throw new Error("Could not upload the image");
  return response.json() as Promise<{ id: string; url: string }>;
}

export async function previewLink(url: string, allowLocalNetwork: boolean, signal: AbortSignal) {
  const response = await fetch("/api/link-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, allowLocalNetwork }),
    signal
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "Could not fetch site details.";
    throw new Error(message);
  }
  return linkPreviewSchema.parse(body);
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

export async function formulaOneCredentialStatus() {
  const response = await fetch("/api/integrations/api-sports-formula-one", { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not check the Formula 1 API key."));
  return formulaOneCredentialStatusSchema.parse(await response.json());
}

export async function saveFormulaOneApiKey(apiKey: string) {
  const response = await fetch("/api/integrations/api-sports-formula-one", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not save the Formula 1 API key."));
  return formulaOneCredentialStatusSchema.parse(await response.json());
}

export async function deleteFormulaOneApiKey() {
  const response = await fetch("/api/integrations/api-sports-formula-one", { method: "DELETE" });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not remove the Formula 1 API key."));
  return formulaOneCredentialStatusSchema.parse(await response.json());
}

export async function loadNextFormulaOneRace(signal?: AbortSignal) {
  const response = await fetch("/api/widgets/formula-one/next-race", { signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not load the next Formula 1 race."));
  return formulaOneWidgetSchema.parse(await response.json());
}

export async function loadFormulaOneDriverStandings(signal?: AbortSignal) {
  const response = await fetch("/api/widgets/formula-one/driver-standings", { signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not load the Formula 1 driver standings."));
  return formulaOneStandingsSchema.parse(await response.json());
}
