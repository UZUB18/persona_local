import { config } from "./config";
import type { ResearchSource } from "./types";

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilyExtractResult = {
  url?: string;
  raw_content?: string;
  content?: string;
};

const MAX_SOURCES = 5;
const MAX_CONTENT_CHARS = 6000;

function requireTavilyKey() {
  if (!config.tavilyApiKey) {
    throw new Error("TAVILY_API_KEY is required for persona research.");
  }
}

async function tavilyPost<T>(path: string, body: unknown): Promise<T> {
  requireTavilyKey();
  const response = await fetch(`https://api.tavily.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.tavilyApiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export async function researchPersona(query: string): Promise<ResearchSource[]> {
  const search = await tavilyPost<{ results?: TavilySearchResult[] }>("/search", {
    query,
    search_depth: "advanced",
    max_results: MAX_SOURCES,
    include_answer: false,
    include_raw_content: false
  });

  const searchResults = (search.results ?? [])
    .filter((result) => result.url)
    .slice(0, MAX_SOURCES);

  const urls = searchResults.map((result) => result.url!);
  if (urls.length === 0) {
    return [];
  }

  const extract = await tavilyPost<{ results?: TavilyExtractResult[] }>("/extract", {
    urls,
    extract_depth: "basic",
    include_images: false
  });

  const extractedByUrl = new Map<string, TavilyExtractResult>();
  for (const result of extract.results ?? []) {
    if (result.url) extractedByUrl.set(result.url, result);
  }

  return searchResults.map((result) => {
    const extracted = extractedByUrl.get(result.url!);
    const content = extracted?.raw_content ?? extracted?.content ?? result.content ?? "";
    return {
      title: result.title || result.url!,
      url: result.url!,
      snippet: result.content || "",
      content: content.slice(0, MAX_CONTENT_CHARS)
    };
  });
}
