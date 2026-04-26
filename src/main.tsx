import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Edit3, ExternalLink, MessageCircle, Plus, Save, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import "./styles.css";

type BuildPhase = "idle" | "research" | "synthesis";

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

type ChatRecord = {
  id: number;
  personaId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type StoredChatMessage = ChatMessage & {
  id: number;
  chatId: number;
  createdAt: string;
};

type PromptEditorState = {
  mode: "draft" | "saved";
  persona: DraftPersona | Persona;
};

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

function ChatThinkingAnimation() {
  return (
    <div className="thinking-panel" aria-live="polite">
      <div className="mailbot-scene" aria-hidden="true">
        <span className="mailbot left">
          <i />
        </span>
        <span className="mail-envelope" />
        <span className="mailbot right">
          <i />
        </span>
      </div>
      <span className="thinking-label">Thinking...</span>
    </div>
  );
}

function PersonaBuildAnimation({
  phase
}: {
  phase: Exclude<BuildPhase, "idle">;
}) {
  const chips = phase === "research"
    ? ["sources", "context", "evidence", "timeline", "signals", "voice"]
    : ["voice", "memory", "beliefs", "tone", "motives", "style"];
  const statusLines = [
    { label: "Initializing", text: "Reading the signal" },
    { label: "Researching", text: "Gathering context" },
    { label: "Synthesizing", text: "Shaping the voice" },
    { label: "Composing", text: "Writing the persona" },
    { label: "Finalizing", text: "Loading..." }
  ];

  return (
    <section className="build-stage" aria-live="polite" aria-label="Persona build progress">
      <div className="build-visual" aria-hidden="true">
        <div className="scan-grid" />
        <div className="source-ribbons">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="persona-core">
          <div className="core-ring" />
          <div className="core-card">
            <div className="portrait-mark" />
            <div className="prompt-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="trait-cloud">
          {chips.map((chip, index) => (
            <span style={{ "--chip-index": index } as React.CSSProperties} key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className="build-copy">
        <div className="build-status-stack">
          {statusLines.map((line, index) => (
            <div className="build-status-line" style={{ "--status-index": index } as React.CSSProperties} key={line.text}>
              <span>{line.label}</span>
              <h2>{line.text}</h2>
            </div>
          ))}
        </div>
        <div className="build-progress-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [buildPhase, setBuildPhase] = useState<BuildPhase>("idle");
  const [draft, setDraft] = useState<DraftPersona | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [thinkingActive, setThinkingActive] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [promptEditor, setPromptEditor] = useState<PromptEditorState | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editDisclosure, setEditDisclosure] = useState("");

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

  async function runResearch() {
    const personaQuery = query.trim();
    if (personaQuery.length < 2) return;
    setBusy(true);
    setError("");
    setDraft(null);
    setBuildPhase("research");
    setStatus("Searching");
    try {
      const research = await api<{ sources: ResearchSource[] }>("/api/research", {
        method: "POST",
        body: JSON.stringify({ query: personaQuery })
      });
      setSources(research.sources);
      setBuildPhase("synthesis");
      setStatus("Creating persona");
      const built = await api<{ persona: DraftPersona }>("/api/personas/build", {
        method: "POST",
        body: JSON.stringify({ query: personaQuery, sources: research.sources })
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
      setBuildPhase("idle");
    }
  }

  async function loadPersonaChats(personaId: number) {
    const data = await api<{ persona: Persona; chats: ChatRecord[] }>(`/api/personas/${personaId}`);
    setChats(data.chats);
    return data.chats;
  }

  async function loadChatMessages(chatId: number) {
    const data = await api<{ messages: StoredChatMessage[] }>(`/api/chats/${chatId}/messages`);
    setMessages(data.messages.map((message) => ({ role: message.role, content: message.content })));
  }

  async function createChat(personaId: number, openingContent?: string, clearCurrentMessages = true) {
    const title = openingContent ? descriptionPreview(openingContent).slice(0, 42) || "New chat" : "New chat";
    const data = await api<{ chat: ChatRecord }>(`/api/personas/${personaId}/chats`, {
      method: "POST",
      body: JSON.stringify({ title })
    });
    setChats((items) => [data.chat, ...items]);
    setActiveChatId(data.chat.id);
    if (clearCurrentMessages) setMessages([]);
    return data.chat;
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
      setChats([]);
      setActiveChatId(null);
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
        setChats([]);
        setActiveChatId(null);
        setChatOpen(false);
      }
      setStatus("Deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete persona");
    } finally {
      setBusy(false);
    }
  }

  async function openPersona(persona: Persona) {
    setActivePersonaId(persona.id);
    setDraft(null);
    setMessages([]);
    setChats([]);
    setActiveChatId(null);
    setChatInput("");
    setChatOpen(true);
    try {
      const loadedChats = await loadPersonaChats(persona.id);
      if (loadedChats[0]) {
        setActiveChatId(loadedChats[0].id);
        await loadChatMessages(loadedChats[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat history");
    }
  }

  async function startNewChat() {
    if (!activePersona) {
      setMessages([]);
      setActiveChatId(null);
      return;
    }
    setError("");
    try {
      await createChat(activePersona.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    }
  }

  async function selectChat(chatId: number) {
    setActiveChatId(chatId);
    setMessages([]);
    setError("");
    try {
      await loadChatMessages(chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    }
  }

  function openPromptEditor(mode: "draft" | "saved", persona: DraftPersona | Persona) {
    setPromptEditor({ mode, persona });
    setEditName(persona.name);
    setEditDescription(persona.description);
    setEditSystemPrompt(persona.systemPrompt);
    setEditDisclosure(persona.disclosure);
  }

  async function savePromptEdit() {
    if (!promptEditor) return;
    const nextPersona = {
      name: editName.trim(),
      description: editDescription.trim(),
      systemPrompt: editSystemPrompt.trim(),
      disclosure: editDisclosure.trim() || "Immersive persona generated from user request and retrieved sources."
    };
    if (!nextPersona.name || !nextPersona.description || !nextPersona.systemPrompt) {
      setError("Name, description, and system prompt are required.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (promptEditor.mode === "draft") {
        setDraft(nextPersona);
        setStatus("Draft updated");
      } else {
        const id = (promptEditor.persona as Persona).id;
        const updated = await api<{ persona: Persona }>(`/api/personas/${id}`, {
          method: "PUT",
          body: JSON.stringify(nextPersona)
        });
        setPersonas((items) => items.map((item) => (item.id === id ? updated.persona : item)));
        if (activePersonaId === id) {
          setActivePersonaId(id);
        }
        setStatus("Prompt updated");
      }
      setPromptEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update prompt");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const content = chatInput.trim();
    const systemPrompt = selectedPersona?.systemPrompt;
    if (!content || !systemPrompt) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setThinkingActive(true);
    setChatInput("");
    setBusy(true);
    setError("");
    try {
      const chatForSave = activePersona
        ? activeChatId
          ? { id: activeChatId }
          : await createChat(activePersona.id, content, false)
        : null;
      const response = chatForSave
        ? await fetch(`/api/chats/${chatForSave.id}/messages/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
          })
        : await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemPrompt,
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
      if (activePersona) {
        await loadPersonaChats(activePersona.id);
      }
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

        {buildPhase !== "idle" && (
          <PersonaBuildAnimation phase={buildPhase} />
        )}

        {draft && (
          <section className="draft-panel" aria-label="Generated persona">
            <div>
              <span className="eyebrow">New persona</span>
              <h2>{draft.name}</h2>
              <p>{descriptionPreview(draft.description)}</p>
            </div>
            <div className="draft-actions">
              <button className="secondary" type="button" disabled={busy} onClick={() => openPromptEditor("draft", draft)}>
                <Edit3 size={18} />
                <span>Edit prompt</span>
              </button>
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
              <div className="persona-actions">
                <button className="edit-button" type="button" onClick={() => openPromptEditor("saved", persona)} aria-label={`Edit ${persona.name} prompt`} title="Edit prompt">
                  <Edit3 size={16} />
                </button>
                <button className="delete-button" type="button" onClick={() => deletePersona(persona.id)} aria-label={`Delete ${persona.name}`} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
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
              <div className="chat-header-actions">
                {activePersona && (
                  <button className="secondary compact" type="button" disabled={busy} onClick={startNewChat}>
                    <Plus size={16} />
                    <span>New chat</span>
                  </button>
                )}
                <button className="icon-button" type="button" onClick={() => setChatOpen(false)} aria-label="Close chat" title="Close">
                  <X size={20} />
                </button>
              </div>
            </header>

            {activePersona && (
              <div className="chat-history-bar" aria-label="Chat history">
                {chats.length === 0 && <span className="chat-history-empty">No saved chats yet</span>}
                {chats.map((chat) => (
                  <button
                    className={chat.id === activeChatId ? "chat-history-item active" : "chat-history-item"}
                    type="button"
                    key={chat.id}
                    onClick={() => selectChat(chat.id)}
                    disabled={busy}
                    title={chat.title}
                  >
                    {chat.title}
                  </button>
                ))}
              </div>
            )}

            <div className="message-list">
              {messages.length === 0 && <p className="chat-empty">Ask the first question.</p>}
              {messages.map((message, index) => (
                <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <p>{message.content}</p>
                </div>
              ))}
              {thinkingActive && (
                <ChatThinkingAnimation />
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

      {promptEditor && (
        <section className="editor-overlay" aria-label="Edit persona prompt">
          <div className="editor-modal">
            <header className="editor-header">
              <div>
                <span>{promptEditor.mode === "draft" ? "Unsaved draft" : "Saved persona"}</span>
                <h2>Edit persona prompt</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setPromptEditor(null)} aria-label="Close editor" title="Close">
                <X size={20} />
              </button>
            </header>

            <div className="editor-fields">
              <label>
                <span>Name</span>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </label>
              <label>
                <span>Description</span>
                <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={5} />
              </label>
              <label>
                <span>System prompt</span>
                <textarea className="system-prompt-editor" value={editSystemPrompt} onChange={(event) => setEditSystemPrompt(event.target.value)} rows={14} />
              </label>
              <label>
                <span>Disclosure</span>
                <input value={editDisclosure} onChange={(event) => setEditDisclosure(event.target.value)} />
              </label>
            </div>

            <footer className="editor-actions">
              <button className="secondary" type="button" disabled={busy} onClick={() => setPromptEditor(null)}>
                <X size={18} />
                <span>Cancel</span>
              </button>
              <button className="primary" type="button" disabled={busy} onClick={savePromptEdit}>
                <Save size={18} />
                <span>Save changes</span>
              </button>
            </footer>
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
