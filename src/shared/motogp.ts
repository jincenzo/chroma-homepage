import { z } from "zod";

export const motoGpRaceSchema = z.object({
  id: z.string(), name: z.string(), circuit: z.string().optional(), country: z.string().optional(),
  weekendStart: z.string().date(), weekendEnd: z.string().date(),
  date: z.string().datetime().optional(), status: z.enum(["Scheduled", "In progress", "Time TBC"])
});
export const motoGpRiderSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), number: z.number().int().optional(),
  nationality: z.string().optional(), team: z.string().optional(), manufacturer: z.string().optional(),
  position: z.number().int().positive(), points: z.number().nonnegative(),
  raceWins: z.number().int().nonnegative().optional(), sprintWins: z.number().int().nonnegative().optional()
});
const metadata = { season: z.number().int(), fetchedAt: z.string().datetime(), source: z.literal("MotoGP") };
export const motoGpNextRaceSchema = z.object({ ...metadata, race: motoGpRaceSchema.nullable() });
export const motoGpStandingsSchema = z.object({ ...metadata, riders: z.array(motoGpRiderSchema).max(100) });
export type MotoGpNextRace = z.infer<typeof motoGpNextRaceSchema>;
export type MotoGpStandings = z.infer<typeof motoGpStandingsSchema>;
