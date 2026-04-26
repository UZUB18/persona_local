import express from "express";
import { z } from "zod";
import { config } from "./config";
import { AppDb } from "./db";
import { buildPersonaDraft, chatWithPersona, streamChatWithPersona } from "./ai";
import { researchPersona } from "./research";
import type { ChatMessage } from "./types";

const app = express();
const db = new AppDb(config.databaseUrl);

app.use(express.json({ limit: "2mb" }));

const asyncRoute = (handler: express.RequestHandler): express.RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const researchSchema = z.object({
  query: z.string().min(2)
});

const buildPersonaSchema = z.object({
  query: z.string().min(2),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    content: z.string()
  })).default([])
});

const savePersonaSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  disclosure: z.string().default("Immersive persona generated from user request and retrieved sources."),
  sources: buildPersonaSchema.shape.sources.default([])
});

const updatePersonaSchema = savePersonaSchema.omit({ sources: true });

const chatSchema = z.object({
  personaId: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1)
  })).min(1)
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/research", asyncRoute(async (req, res) => {
  const { query } = researchSchema.parse(req.body);
  const sources = await researchPersona(query);
  res.json({ sources });
}));

app.post("/api/personas/build", asyncRoute(async (req, res) => {
  const { query, sources } = buildPersonaSchema.parse(req.body);
  const persona = await buildPersonaDraft(query, sources);
  res.json({ persona });
}));

app.get("/api/personas", (_req, res) => {
  res.json({ personas: db.listPersonas() });
});

app.post("/api/personas", (req, res) => {
  const input = savePersonaSchema.parse(req.body);
  const persona = db.createPersona(input);
  res.status(201).json({ persona });
});

app.get("/api/personas/:id", (req, res) => {
  const id = Number(req.params.id);
  const persona = db.getPersona(id);
  if (!persona) {
    res.status(404).json({ error: "Persona not found" });
    return;
  }
  res.json({ persona, sources: db.listSources(id), chats: db.listChats(id) });
});

app.put("/api/personas/:id", (req, res) => {
  const id = Number(req.params.id);
  const input = updatePersonaSchema.parse(req.body);
  const persona = db.updatePersona(id, input);
  if (!persona) {
    res.status(404).json({ error: "Persona not found" });
    return;
  }
  res.json({ persona });
});

app.delete("/api/personas/:id", (req, res) => {
  db.deletePersona(Number(req.params.id));
  res.status(204).end();
});

app.post("/api/personas/:id/chats", (req, res) => {
  const personaId = Number(req.params.id);
  const title = z.object({ title: z.string().min(1).default("New chat") }).parse(req.body).title;
  if (!db.getPersona(personaId)) {
    res.status(404).json({ error: "Persona not found" });
    return;
  }
  res.status(201).json({ chat: db.createChat(personaId, title) });
});

app.get("/api/chats/:id/messages", (req, res) => {
  const chatId = Number(req.params.id);
  if (!db.getChat(chatId)) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.json({ messages: db.listMessages(chatId) });
});

app.post("/api/chat", asyncRoute(async (req, res) => {
  const input = chatSchema.parse(req.body);
  const systemPrompt = input.systemPrompt ?? (input.personaId ? db.getPersona(input.personaId)?.systemPrompt : undefined);
  if (!systemPrompt) {
    res.status(400).json({ error: "A systemPrompt or valid personaId is required." });
    return;
  }
  const answer = await chatWithPersona(systemPrompt, input.messages as ChatMessage[]);
  res.json({ message: { role: "assistant", content: answer } });
}));

function writeSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.post("/api/chat/stream", asyncRoute(async (req, res) => {
  const input = chatSchema.parse(req.body);
  const systemPrompt = input.systemPrompt ?? (input.personaId ? db.getPersona(input.personaId)?.systemPrompt : undefined);
  if (!systemPrompt) {
    res.status(400).json({ error: "A systemPrompt or valid personaId is required." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  for await (const event of streamChatWithPersona(systemPrompt, input.messages as ChatMessage[])) {
    writeSse(res, event.type, event);
  }
  res.end();
}));

app.post("/api/chats/:id/messages", asyncRoute(async (req, res) => {
  const chatId = Number(req.params.id);
  const chat = db.getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  db.addMessage(chatId, "user", body.content);
  const messages = db.listMessages(chatId).map((message) => ({
    role: message.role,
    content: message.content
  }));
  const persona = db.getPersona(chat.personaId);
  if (!persona) {
    res.status(404).json({ error: "Persona not found" });
    return;
  }
  const answer = await chatWithPersona(persona.systemPrompt, messages);
  const assistantMessage = db.addMessage(chatId, "assistant", answer);
  res.status(201).json({ userMessage: db.listMessages(chatId).at(-2), assistantMessage });
}));

app.post("/api/chats/:id/messages/stream", asyncRoute(async (req, res) => {
  const chatId = Number(req.params.id);
  const chat = db.getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  db.addMessage(chatId, "user", body.content);
  const messages = db.listMessages(chatId).map((message) => ({
    role: message.role,
    content: message.content
  }));
  const persona = db.getPersona(chat.personaId);
  if (!persona) {
    res.status(404).json({ error: "Persona not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  let answer = "";
  for await (const event of streamChatWithPersona(persona.systemPrompt, messages)) {
    if (event.type === "content") answer += event.text;
    writeSse(res, event.type, event);
  }
  if (answer.trim()) {
    db.addMessage(chatId, "assistant", answer.trim());
  }
  res.end();
}));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  const status = message.includes("required") ? 400 : 500;
  res.status(status).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`Persona Roleplay API listening on http://localhost:${config.port}`);
});
