"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface PipelineMetadata {
  [key: string]: any;
}

export interface Message {
  role: string;
  content: string;
  metadata?: PipelineMetadata;
  audioBase64?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  language: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "kisan-ai-chat-sessions";
const ACTIVE_KEY = "kisan-ai-active-session";
const MAX_TITLE_LENGTH = 40;

function generateId(): string {
  return crypto.randomUUID();
}

function generateTitle(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "New Chat";
  const text = firstUserMsg.content.replace(/\[.*?\]\n?/, "").trim(); // strip image filename prefix
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return text.slice(0, MAX_TITLE_LENGTH) + "...";
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loaded = loadSessions();
    const savedActiveId = loadActiveId();

    if (loaded.length === 0) {
      // Create a default session
      const newSession: ChatSession = {
        id: generateId(),
        title: "New Chat",
        language: "hi-IN",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
      saveSessions([newSession]);
      saveActiveId(newSession.id);
    } else {
      setSessions(loaded);
      // Restore active or pick most recent
      const activeExists = loaded.some((s) => s.id === savedActiveId);
      const id = activeExists ? savedActiveId! : loaded[0].id;
      setActiveSessionId(id);
      saveActiveId(id);
    }
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const createSession = useCallback((language: string) => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "New Chat",
      language,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => {
      const next = [newSession, ...prev];
      saveSessions(next);
      return next;
    });
    setActiveSessionId(newSession.id);
    saveActiveId(newSession.id);
    return newSession;
  }, []);

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
    saveActiveId(id);
  }, []);

  const updateSession = useCallback(
    (id: string, messages: Message[], language?: string) => {
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== id) return s;
          return {
            ...s,
            messages,
            title: messages.length > 0 ? generateTitle(messages) : s.title,
            language: language || s.language,
            updatedAt: Date.now(),
          };
        });
        // Sort by updatedAt desc
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        saveSessions(next);
        return next;
      });
    },
    []
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);

        if (next.length === 0) {
          // Always keep at least one session
          const newSession: ChatSession = {
            id: generateId(),
            title: "New Chat",
            language: "hi-IN",
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          const result = [newSession];
          saveSessions(result);
          setActiveSessionId(newSession.id);
          saveActiveId(newSession.id);
          return result;
        }

        saveSessions(next);

        // If we deleted the active session, switch to the first one
        if (id === activeSessionId) {
          setActiveSessionId(next[0].id);
          saveActiveId(next[0].id);
        }

        return next;
      });
    },
    [activeSessionId]
  );

  return {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    switchSession,
    updateSession,
    deleteSession,
  };
}
