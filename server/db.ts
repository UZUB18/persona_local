import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { ChatMessageRecord, ChatRecord, PersonaRecord, ResearchSource, SourceRecord } from "./types";

export class AppDb {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        disclosure TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        persona_id INTEGER,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        snippet TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        persona_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
    `);
  }

  listPersonas(): PersonaRecord[] {
    return this.db.prepare(`
      SELECT id, name, description, system_prompt AS systemPrompt, disclosure, created_at AS createdAt, updated_at AS updatedAt
      FROM personas ORDER BY updated_at DESC
    `).all() as PersonaRecord[];
  }

  getPersona(id: number): PersonaRecord | undefined {
    return this.db.prepare(`
      SELECT id, name, description, system_prompt AS systemPrompt, disclosure, created_at AS createdAt, updated_at AS updatedAt
      FROM personas WHERE id = ?
    `).get(id) as PersonaRecord | undefined;
  }

  createPersona(input: { name: string; description: string; systemPrompt: string; disclosure: string; sources: ResearchSource[] }): PersonaRecord {
    const insertPersona = this.db.prepare(`
      INSERT INTO personas (name, description, system_prompt, disclosure)
      VALUES (?, ?, ?, ?)
    `);
    const insertSource = this.db.prepare(`
      INSERT INTO sources (persona_id, title, url, snippet, content)
      VALUES (?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction(() => {
      const result = insertPersona.run(input.name, input.description, input.systemPrompt, input.disclosure);
      const personaId = Number(result.lastInsertRowid);
      for (const source of input.sources) {
        insertSource.run(personaId, source.title, source.url, source.snippet, source.content);
      }
      return personaId;
    });
    return this.getPersona(transaction())!;
  }

  updatePersona(id: number, input: { name: string; description: string; systemPrompt: string; disclosure: string }): PersonaRecord | undefined {
    this.db.prepare(`
      UPDATE personas
      SET name = ?, description = ?, system_prompt = ?, disclosure = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.name, input.description, input.systemPrompt, input.disclosure, id);
    return this.getPersona(id);
  }

  deletePersona(id: number) {
    this.db.prepare("DELETE FROM personas WHERE id = ?").run(id);
  }

  listSources(personaId: number): SourceRecord[] {
    return this.db.prepare(`
      SELECT id, persona_id AS personaId, title, url, snippet, content, created_at AS createdAt
      FROM sources WHERE persona_id = ? ORDER BY id ASC
    `).all(personaId) as SourceRecord[];
  }

  createChat(personaId: number, title: string): ChatRecord {
    const result = this.db.prepare("INSERT INTO chats (persona_id, title) VALUES (?, ?)").run(personaId, title);
    return this.getChat(Number(result.lastInsertRowid))!;
  }

  getChat(id: number): ChatRecord | undefined {
    return this.db.prepare(`
      SELECT id, persona_id AS personaId, title, created_at AS createdAt, updated_at AS updatedAt
      FROM chats WHERE id = ?
    `).get(id) as ChatRecord | undefined;
  }

  listChats(personaId: number): ChatRecord[] {
    return this.db.prepare(`
      SELECT id, persona_id AS personaId, title, created_at AS createdAt, updated_at AS updatedAt
      FROM chats WHERE persona_id = ? ORDER BY updated_at DESC
    `).all(personaId) as ChatRecord[];
  }

  addMessage(chatId: number, role: "user" | "assistant", content: string): ChatMessageRecord {
    const result = this.db.prepare("INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)").run(chatId, role, content);
    this.db.prepare("UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(chatId);
    return this.db.prepare(`
      SELECT id, chat_id AS chatId, role, content, created_at AS createdAt
      FROM chat_messages WHERE id = ?
    `).get(Number(result.lastInsertRowid)) as ChatMessageRecord;
  }

  listMessages(chatId: number): ChatMessageRecord[] {
    return this.db.prepare(`
      SELECT id, chat_id AS chatId, role, content, created_at AS createdAt
      FROM chat_messages WHERE chat_id = ? ORDER BY id ASC
    `).all(chatId) as ChatMessageRecord[];
  }
}
