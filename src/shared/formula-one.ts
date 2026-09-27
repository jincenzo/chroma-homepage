import { z } from "zod";

export const formulaOneCredentialSchema = z.object({
  apiKey: z.string().trim().min(8, "Enter a valid API key").max(512)
});

export const formulaOneCredentialStatusSchema = z.object({
  configured: z.boolean()
});

export const formulaOneRaceSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  circuit: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().datetime({ offset: true }),
  status: z.string().optional()
});

export const formulaOneWidgetSchema = z.object({
  race: formulaOneRaceSchema,
  fetchedAt: z.string().datetime({ offset: true }),
  source: z.enum(["API-Sports", "Jolpica F1"]).optional()
});

export const formulaOneDriverSchema = z.object({
  id: z.string().min(1),
  code: z.string().optional(),
  givenName: z.string().min(1),
  familyName: z.string().min(1),
  number: z.string().optional(),
  nationality: z.string().optional(),
  team: z.string().optional(),
  position: z.number().int().positive(),
  points: z.number().nonnegative(),
  wins: z.number().int().nonnegative()
});

export const formulaOneStandingsSchema = z.object({
  season: z.string().min(1),
  round: z.string().optional(),
  drivers: z.array(formulaOneDriverSchema),
  fetchedAt: z.string().datetime({ offset: true }),
  source: z.literal("Jolpica F1")
});

export type FormulaOneWidget = z.infer<typeof formulaOneWidgetSchema>;
export type FormulaOneStandings = z.infer<typeof formulaOneStandingsSchema>;
