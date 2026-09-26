import type { SearchShortcut } from "./config";

/** Backwards-compatible defaults for documents without launcher settings. */
export const DEFAULT_SEARCH_SHORTCUTS: SearchShortcut[] = [
  { id: "search-google", keyword: "g", label: "Google", urlTemplate: "https://www.google.com/search?q={query}", openInNewTab: true },
  { id: "search-github", keyword: "gh", label: "GitHub", urlTemplate: "https://github.com/search?q={query}", openInNewTab: true },
  { id: "search-youtube", keyword: "yt", label: "YouTube", urlTemplate: "https://www.youtube.com/results?search_query={query}", openInNewTab: true }
];
