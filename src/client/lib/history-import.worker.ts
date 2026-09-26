import { analyzeHistoryOut, type HistoryAnalysis } from "../../shared/history-import";

export type HistoryWorkerResult = { analysis: HistoryAnalysis } | { error: string };
self.onmessage = (event: MessageEvent<string>) => {
  let input: unknown;
  try { input = JSON.parse(event.data.replace(/^\uFEFF/, "")); }
  catch { self.postMessage({ error: "Invalid JSON. Select the complete HistoryOut export, not a copied fragment." } satisfies HistoryWorkerResult); return; }
  try { self.postMessage({ analysis: analyzeHistoryOut(input) } satisfies HistoryWorkerResult); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Could not analyze this export." } satisfies HistoryWorkerResult); }
};
