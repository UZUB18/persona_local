import "dotenv/config";

function optionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  openAiApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
  openAiBaseUrl: process.env.OPENAI_BASE_URL || (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined),
  openAiModel: process.env.OPENAI_MODEL || (process.env.OPENROUTER_API_KEY ? "deepseek/deepseek-v4-flash" : "deepseek/deepseek-v4-flash"),
  openRouterReferer: process.env.OPENROUTER_REFERER || "http://localhost:5173",
  openRouterTitle: process.env.OPENROUTER_TITLE || "Persona Roleplay",
  chatMaxTokens: optionalNumber(process.env.CHAT_MAX_TOKENS),
  chatHistoryLimit: Number(process.env.CHAT_HISTORY_LIMIT ?? 10),
  chatSystemPromptLimit: Number(process.env.CHAT_SYSTEM_PROMPT_LIMIT ?? 8000),
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL || "./persona_roleplay.db"
};

export const allowedAiModel = "deepseek/deepseek-v4-flash";

export function assertAllowedAiModel() {
  if (config.openAiModel !== allowedAiModel) {
    throw new Error(`Only ${allowedAiModel} is allowed for AI generation. Update OPENAI_MODEL to ${allowedAiModel}.`);
  }
}
