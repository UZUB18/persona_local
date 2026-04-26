export type SourceRecord = {
  id: number;
  personaId: number | null;
  title: string;
  url: string;
  snippet: string;
  content: string;
  createdAt: string;
};

export type PersonaRecord = {
  id: number;
  name: string;
  description: string;
  systemPrompt: string;
  disclosure: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatRecord = {
  id: number;
  personaId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRecord = {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ResearchSource = {
  title: string;
  url: string;
  snippet: string;
  content: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
