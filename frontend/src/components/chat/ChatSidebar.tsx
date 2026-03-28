"use client";

import { useState } from "react";
import { ChatSession } from "./useChatSessions";
import { t } from "@/app/i18n";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  language: string;
  onNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  language,
  onNewChat,
  onSwitchSession,
  onDeleteSession,
}: ChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-green-700">
        <h2 className="font-bold text-green-100 text-sm mb-3">
          {t(language, "chat_history")}
        </h2>
        <button
          onClick={onNewChat}
          className="w-full bg-green-600 hover:bg-green-500 text-white py-2 px-3 rounded text-sm font-bold transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t(language, "new_chat")}
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSwitchSession(session.id)}
            className={`group flex items-start gap-2 p-2.5 rounded cursor-pointer transition-colors ${
              session.id === activeSessionId
                ? "bg-green-700/60 text-white"
                : "text-green-200 hover:bg-green-700/30"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{session.title}</div>
              <div className="text-[10px] text-green-400 mt-0.5">
                {session.messages.length > 0
                  ? `${Math.ceil(session.messages.length / 2)} msgs · ${formatTime(session.updatedAt)}`
                  : formatTime(session.createdAt)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-red-400 transition-all p-0.5 shrink-0"
              title={t(language, "delete_chat")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-green-800 text-white p-2 rounded-lg shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40 h-screen
          w-64 bg-green-900 flex-shrink-0
          transition-transform duration-200 ease-in-out
          md:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
