# Persona Roleplay

Local full-stack app for researching a requested persona, generating an AI persona prompt, saving it, and chatting with it.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
OPENROUTER_API_KEY=your_key
OPENAI_MODEL=deepseek/deepseek-v4-flash
TAVILY_API_KEY=your_key
```

With `OPENROUTER_API_KEY` set, the server defaults to `https://openrouter.ai/api/v1`.
The server enforces `deepseek/deepseek-v4-flash` as the only allowed AI model.
Chat calls stream answer tokens live. The UI shows a synthetic thinking indicator while waiting; provider reasoning text is excluded from responses. Output length is not capped by default; set `CHAT_MAX_TOKENS` only if you want a hard response limit:

```bash
CHAT_MAX_TOKENS=
CHAT_HISTORY_LIMIT=10
CHAT_SYSTEM_PROMPT_LIMIT=8000
```

`OPENAI_API_KEY` and `OPENAI_BASE_URL` remain present for OpenAI-compatible wiring, but the model policy still requires `deepseek/deepseek-v4-flash`.

## Provider policy

- Web research only uses Tavily Search and Tavily Extract.
- The AI provider is only used for persona prompt generation and chat completion.
- Provider-side web search tools are not enabled.
- Browser runtime inspection, if added later, should use Chrome DevTools Protocol or Playwright against browser instances, not an AI provider search tool.

## Run

```bash
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:8787

## Verify

```bash
npm run build
npm test
```
