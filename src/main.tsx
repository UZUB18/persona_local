import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, MessageCircle, Plus, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import "./styles.css";

type ResearchSource = {
  title: string;
  url: string;
  snippet: string;
  content: string;
};

type Persona = {
  id: number;
  name: string;
  description: string;
  systemPrompt: string;
  disclosure: string;
  createdAt: string;
  updatedAt: string;
};

type DraftPersona = Omit<Persona, "id" | "createdAt" | "updatedAt">;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const THINKING_WORDS = [
  "Ruminating",
  "Understanding",
  "Considering",
  "Reflecting",
  "Interpreting",
  "Listening",
  "Orienting",
  "Weighing",
  "Composing",
  "Imagining",
  "Recalling",
  "Inferring",
  "Connecting",
  "Sifting",
  "Reframing",
  "Noticing",
  "Tracing",
  "Balancing",
  "Sketching",
  "Shaping",
  "Tuning",
  "Gathering",
  "Examining",
  "Aligning",
  "Distilling",
  "Forming",
  "Choosing",
  "Refining",
  "Preparing",
  "Answering"
];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed: ${response.status}`);
  }
  return data as T;
}

function descriptionPreview(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function App() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [draft, setDraft] = useState<DraftPersona | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [thinkingActive, setThinkingActive] = useState(false);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? null,
    [personas, activePersonaId]
  );

  const selectedPersona = activePersona ?? draft;

  async function loadPersonas() {
    const data = await api<{ personas: Persona[] }>("/api/personas");
    setPersonas(data.personas);
  }

  useEffect(() => {
    loadPersonas().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!thinkingActive) return;
    const timer = window.setInterval(() => {
      setThinkingIndex((current) => (current + 1) % THINKING_WORDS.length);
    }, 850);
    return () => window.clearInterval(timer);
  }, [thinkingActive]);

  async function runResearch() {
    setBusy(true);
    setError("");
    setStatus("Searching");
    try {
      const research = await api<{ sources: ResearchSource[] }>("/api/research", {
        method: "POST",
        body: JSON.stringify({ query })
      });
      setSources(research.sources);
      setStatus("Creating persona");
      const built = await api<{ persona: DraftPersona }>("/api/personas/build", {
        method: "POST",
        body: JSON.stringify({ query, sources: research.sources })
      });
      setDraft(built.persona);
      setActivePersonaId(null);
      setMessages([]);
      setStatus("Persona ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build persona");
      setStatus("Blocked");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ persona: Persona }>("/api/personas", {
        method: "POST",
        body: JSON.stringify({ ...draft, sources })
      });
      await loadPersonas();
      setActivePersonaId(saved.persona.id);
      setDraft(null);
      setMessages([]);
      setChatOpen(true);
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save persona");
    } finally {
      setBusy(false);
    }
  }

  async function deletePersona(id: number) {
    setBusy(true);
    setError("");
    try {
      await fetch(`/api/personas/${id}`, { method: "DELETE" });
      setPersonas((items) => items.filter((item) => item.id !== id));
      if (activePersonaId === id) {
        setActivePersonaId(null);
        setMessages([]);
        setChatOpen(false);
      }
      setStatus("Deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete persona");
    } finally {
      setBusy(false);
    }
  }

  function openPersona(persona: Persona) {
    setActivePersonaId(persona.id);
    setDraft(null);
    setMessages([]);
    setChatInput("");
    setChatOpen(true);
  }

  async function sendMessage() {
    const content = chatInput.trim();
    const systemPrompt = selectedPersona?.systemPrompt;
    if (!content || !systemPrompt) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setThinkingIndex(0);
    setThinkingActive(true);
    setChatInput("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: activePersona?.id,
          systemPrompt: activePersona ? undefined : systemPrompt,
          messages: nextMessages
        })
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${response.status}`);
      }

      let assistantText = "";
      let eventName = "message";
      let buffer = "";
      const decoder = new TextDecoder();
      const reader = response.body.getReader();

      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      setStatus("Replying");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const lines = frame.split("\n");
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLines.push(line.slice(6));
          }
          if (dataLines.length === 0) continue;
          const payload = JSON.parse(dataLines.join("\n")) as { text?: string };
          if (eventName === "content" && payload.text) {
            setThinkingActive(false);
            assistantText += payload.text;
            setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
          }
        }
      }
      setStatus("Ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
      setMessages(messages);
    } finally {
      setThinkingActive(false);
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="studio">
        <header className="hero">
          <div>
            <span className="kicker">{status}</span>
            <h1>Persona Roleplay</h1>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="search-panel" aria-label="Create persona">
          <div className="query-row">
            <Search size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Who do you want to talk to?"
              aria-label="Persona research query"
            />
            <button className="primary" type="button" disabled={busy || query.trim().length < 2} onClick={runResearch}>
              <Sparkles size={18} />
              <span>{busy ? "Working" : "Create"}</span>
            </button>
          </div>
        </section>

        {draft && (
          <section className="draft-panel" aria-label="Generated persona">
            <div>
              <span className="eyebrow">New persona</span>
              <h2>{draft.name}</h2>
              <p>{descriptionPreview(draft.description)}</p>
            </div>
            <div className="draft-actions">
              <button className="secondary" type="button" disabled={busy} onClick={() => setChatOpen(true)}>
                <MessageCircle size={18} />
                <span>Try chat</span>
              </button>
              <button className="primary" type="button" disabled={busy} onClick={saveDraft}>
                <Plus size={18} />
                <span>Save</span>
              </button>
            </div>
          </section>
        )}

        {sources.length > 0 && (
          <section className="sources" aria-label="Sources">
            {sources.map((source) => (
              <a className="source-link" href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                <span>{source.title}</span>
                <ExternalLink size={15} />
              </a>
            ))}
          </section>
        )}

        <section className="persona-grid" aria-label="Saved personas">
          {personas.map((persona) => (
            <article className="persona-card" key={persona.id}>
              <button className="persona-open" type="button" onClick={() => openPersona(persona)}>
                <span>{persona.name}</span>
                <small>{descriptionPreview(persona.description)}</small>
              </button>
              <button className="delete-button" type="button" onClick={() => deletePersona(persona.id)} aria-label={`Delete ${persona.name}`} title="Delete">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
          {personas.length === 0 && !draft && <p className="empty-state">Create a persona to begin.</p>}
        </section>
      </section>

      {chatOpen && selectedPersona && (
        <section className="chat-overlay" aria-label="Persona chat">
          <div className="chat-modal">
            <header className="chat-header">
              <div>
                <span>Chatting with</span>
                <h2>{selectedPersona.name}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setChatOpen(false)} aria-label="Close chat" title="Close">
                <X size={20} />
              </button>
            </header>

            <div className="message-list">
              {messages.length === 0 && <p className="chat-empty">Ask the first question.</p>}
              {messages.map((message, index) => (
                <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <p>{message.content}</p>
                </div>
              ))}
              {thinkingActive && (
                <div className="thinking-panel" aria-live="polite">
                  {THINKING_WORDS[thinkingIndex]}...
                </div>
              )}
            </div>

            <div className="composer">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask anything..."
                aria-label="Chat message"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button className="icon-button send" type="button" disabled={busy || !chatInput.trim()} onClick={sendMessage} aria-label="Send message" title="Send">
                <Send size={20} />
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
