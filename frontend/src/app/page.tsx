"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { t, loadingPhrases } from "./i18n";
import { useChatSessions } from "@/components/chat/useChatSessions";
import ChatSidebar from "@/components/chat/ChatSidebar";

const DroneSimulatorScene = dynamic(
  () => import("@/components/drone-simulator/DroneSimulatorScene"),
  { ssr: false, loading: () => <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto max-w-4xl min-h-[400px] flex items-center justify-center text-gray-400">Loading 3D simulator...</div> }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PipelineMetadata {
  translate?: { original_query: string; translated_query: string; was_translated: boolean; source_language: string; duration_ms: number };
  intent?: { is_agricultural: boolean; raw_response: string; duration_ms: number };
  rag?: { num_documents: number; scores: number[]; sources: string[]; doc_previews: string[]; duration_ms: number };
  vision_validate?: { is_farm_image: boolean; description: string; model: string; duration_ms: number; error?: string };
  vision?: { filename: string; image_size_kb: number; model: string; symptoms_detected: string; duration_ms: number; error?: string };
  generate?: { model: string; english_response?: string; chunks_streamed: number; generation_duration_ms: number };
  translate_response?: { target_language: string; was_translated: boolean; duration_ms: number };
  tts?: { duration_ms: number; error?: string };
  total_duration_ms?: number;
}

interface Message {
  role: string;
  content: string;
  metadata?: PipelineMetadata;
  audioBase64?: string;
}

// SVG Icons
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h12v12H6z" />
  </svg>
);
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);
const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
  </svg>
);
const DroneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 10l-6-6H8l-6 6 6 6h8l6-6zM12 14.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 18h18v2H3v-2z"/>
  </svg>
);


export default function Home() {
  const {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    switchSession,
    updateSession,
    deleteSession,
  } = useChatSessions();

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("hi-IN");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [expandedMeta, setExpandedMeta] = useState<Set<number>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "drone">("chat");

  // Sync messages from active session on switch
  useEffect(() => {
    if (activeSession) {
      setMessages(activeSession.messages);
      setLanguage(activeSession.language);
      setExpandedMeta(new Set());
    }
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist messages to session whenever they change (debounced via ref to avoid loops)
  const persistRef = useRef(false);
  useEffect(() => {
    if (!activeSessionId || !persistRef.current) {
      persistRef.current = true;
      return;
    }
    updateSession(activeSessionId, messages, language);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = useCallback(() => {
    createSession(language);
    setMessages([]);
    setQuery("");
    setExpandedMeta(new Set());
    setActiveTab("chat");
  }, [createSession, language]);

  const handleSwitchSession = useCallback((id: string) => {
    switchSession(id);
    setActiveTab("chat");
  }, [switchSession]);

  // Audio playback state
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingIntervalRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingText]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ---------- Audio Recording (STT via backend) ----------
  const micStreamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const recordStartTimeRef = useRef(0);
  const pendingStopRef = useRef(false);

  // Pre-acquire mic permission on first press, then reuse the stream
  const ensureMicPermission = async (): Promise<MediaStream> => {
    if (micStreamRef.current && micStreamRef.current.active) {
      return micStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    return stream;
  };

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    pendingStopRef.current = false;

    try {
      const stream = await ensureMicPermission();

      // If user released button during the permission dialog, don't start
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        // Only transcribe if we recorded for at least 500ms
        if (Date.now() - recordStartTimeRef.current >= 500 && audioBlob.size > 100) {
          await sendAudioForTranscription(audioBlob);
        }
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    // If startRecording hasn't resolved yet (permission dialog open), mark pending stop
    if (!isRecordingRef.current) {
      pendingStopRef.current = true;
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    // State updates happen in mediaRecorder.onstop
  };

  const sendAudioForTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("language", language.split("-")[0]);

      const res = await fetch(`${API_URL}/api/transcribe`, { method: "POST", body: formData });
      if (!res.ok) {
        const detail = await res.text();
        console.error("Transcription failed:", res.status, detail);
        return;
      }
      const data = await res.json();
      if (data.text) setQuery(data.text);
    } catch (err) {
      console.error("Transcription error:", err);
    }
  };

  // ---------- Audio Playback ----------
  const playAudio = (audioBase64: string, index: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingIndex === index) { setPlayingIndex(null); return; }

    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    audioRef.current = audio;
    audio.onended = () => { setPlayingIndex(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingIndex(null); audioRef.current = null; };
    audio.play();
    setPlayingIndex(index);
  };

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingIndex(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setImageFile(e.target.files[0]);
  };

  const toggleMetadata = (index: number) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  // ---------- Main Ask ----------
  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() && !imageFile) return;

    const currentQuery = query || "Please analyze this image.";
    const userMessage = imageFile ? `[${imageFile.name}]\n${currentQuery}` : currentQuery;

    setMessages((prev) => [...prev, { role: "user", content: userMessage }, { role: "agent", content: "" }]);
    setQuery("");
    setLoading(true);

    let phraseIdx = 0;
    const phrases = loadingPhrases[language] || loadingPhrases["en-IN"];
    setLoadingText(phrases[0]);
    loadingIntervalRef.current = setInterval(() => {
      phraseIdx = (phraseIdx + 1) % phrases.length;
      setLoadingText(phrases[phraseIdx]);
    }, 2000);

    try {
      const backendLang = language.split("-")[0];
      let res;

      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        formData.append("language", backendLang);
        formData.append("query", currentQuery);
        res = await fetch(`${API_URL}/api/upload_image_stream`, { method: "POST", body: formData });
      } else {
        res = await fetch(`${API_URL}/api/ask_stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: currentQuery, language: backendLang }),
        });
      }

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      const metadata: PipelineMetadata = {};
      let audioBase64 = "";
      let sseBuffer = "";

      const processSSELine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const dataStr = line.slice(6).trim();
        if (!dataStr) return;

        let data;
        try { data = JSON.parse(dataStr); } catch { return; }

        if (data.type === "chunk") {
          if (loadingIntervalRef.current) {
            clearInterval(loadingIntervalRef.current);
            loadingIntervalRef.current = null;
            setLoadingText("");
          }
          fullText += data.content;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], content: fullText };
            return n;
          });
        } else if (data.type === "metadata") {
          (metadata as any)[data.step] = data.data;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], metadata: { ...metadata } };
            return n;
          });
        } else if (data.type === "audio") {
          audioBase64 = data.audio_base64;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], audioBase64 };
            return n;
          });
        } else if (data.type === "done") {
          metadata.total_duration_ms = data.total_duration_ms;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], metadata: { ...metadata } };
            return n;
          });
        } else if (data.type === "error") {
          fullText += `\n[Error: ${data.message}]`;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { ...n[n.length - 1], content: fullText };
            return n;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        // SSE events are delimited by double newlines; split on them
        const parts = sseBuffer.split("\n\n");
        // Last part may be incomplete — keep it in the buffer
        sseBuffer = parts.pop() || "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            processSSELine(line);
          }
        }
      }
      // Process any remaining buffer
      if (sseBuffer.trim()) {
        for (const line of sseBuffer.split("\n")) {
          processSSELine(line);
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const n = [...prev];
        n[n.length - 1] = { ...n[n.length - 1], content: t(language, "error_backend") };
        return n;
      });
    } finally {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      setLoading(false);
      setLoadingText("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---------- Rendering ----------
  const renderMessageContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const hasThink = !!thinkMatch;
    const thinkContent = hasThink ? thinkMatch[1] : "";
    const mainContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
    return (
      <>
        {hasThink && (
          <div className="bg-gray-200 p-3 rounded-md mb-3 text-sm text-gray-700 border border-gray-300">
            <span className="font-bold flex items-center gap-2 mb-1">{t(language, "thinking")}</span>
            <div className="whitespace-pre-wrap opacity-80">{thinkContent}</div>
          </div>
        )}
        <div className="whitespace-pre-wrap">{mainContent}</div>
      </>
    );
  };

  const renderConfidenceBar = (score: number) => {
    const pct = Math.round(score * 100);
    const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="w-24 bg-gray-200 rounded-full h-2">
          <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-gray-600">{pct}%</span>
      </div>
    );
  };

  const renderMetadata = (meta: PipelineMetadata) => (
    <div className="text-xs space-y-2 text-gray-600">
      {meta.translate && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "translation_input")}</span>
          {meta.translate.was_translated ? (
            <span className="ml-2 text-blue-600">{meta.translate.source_language} &rarr; English ({meta.translate.duration_ms}ms)</span>
          ) : (
            <span className="ml-2 text-gray-500">{t(language, "skipped_english")}</span>
          )}
          {meta.translate.was_translated && (
            <div className="ml-2 mt-1 text-gray-500 italic">&quot;{meta.translate.translated_query}&quot;</div>
          )}
        </div>
      )}

      {meta.intent && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "intent")}</span>
          <span className={`ml-2 font-mono ${meta.intent.is_agricultural ? "text-green-600" : "text-red-600"}`}>
            {meta.intent.is_agricultural ? t(language, "agricultural") : t(language, "rejected")}
          </span>
          <span className="ml-1 text-gray-400">({meta.intent.raw_response}) {meta.intent.duration_ms}ms</span>
        </div>
      )}

      {meta.vision_validate && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "image_validation")}</span>
          <span className={`ml-2 font-mono ${meta.vision_validate.is_farm_image ? "text-green-600" : "text-red-600"}`}>
            {meta.vision_validate.is_farm_image ? t(language, "farm_image") : t(language, "not_farm")}
          </span>
          <span className="ml-1 text-gray-400">{meta.vision_validate.duration_ms}ms</span>
          <div className="ml-2 mt-1 text-gray-500">{meta.vision_validate.description}</div>
        </div>
      )}

      {meta.vision && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "vision_analysis")}</span>
          <span className="ml-2 text-gray-500">{meta.vision.model} | {meta.vision.image_size_kb}KB | {meta.vision.duration_ms}ms</span>
          {meta.vision.error && <div className="ml-2 text-red-500">Error: {meta.vision.error}</div>}
          {meta.vision.symptoms_detected && !meta.vision.error && (
            <div className="ml-2 mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-gray-700">{meta.vision.symptoms_detected}</div>
          )}
        </div>
      )}

      {meta.rag && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "rag_context")}</span>
          <span className="ml-2 text-gray-500">{meta.rag.num_documents} docs | {meta.rag.duration_ms}ms</span>
          {meta.rag.scores && meta.rag.scores.length > 0 && (
            <div className="ml-2 mt-1 space-y-1">
              {meta.rag.scores.map((score, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-500 w-20 truncate" title={meta.rag?.sources?.[i]}>
                    {meta.rag?.sources?.[i] || `Doc ${i + 1}`}
                  </span>
                  {renderConfidenceBar(score)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {meta.generate && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "generation")}</span>
          <span className="ml-2 text-gray-500">{meta.generate.model} | {meta.generate.chunks_streamed} chunks | {meta.generate.generation_duration_ms}ms</span>
          {meta.generate.english_response && (
            <details className="ml-2 mt-1">
              <summary className="text-gray-400 cursor-pointer">{t(language, "english_response")}</summary>
              <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded text-gray-700">{meta.generate.english_response}</div>
            </details>
          )}
        </div>
      )}

      {meta.translate_response && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "translation_output")}</span>
          {meta.translate_response.was_translated ? (
            <span className="ml-2 text-blue-600">English &rarr; {meta.translate_response.target_language} ({meta.translate_response.duration_ms}ms)</span>
          ) : (
            <span className="ml-2 text-gray-500">{t(language, "skipped_english")}</span>
          )}
        </div>
      )}

      {meta.tts && (
        <div>
          <span className="font-semibold text-gray-700">{t(language, "tts_audio")}</span>
          <span className="ml-2 text-gray-500">{meta.tts.duration_ms}ms</span>
          {meta.tts.error && <span className="ml-2 text-red-500">{meta.tts.error}</span>}
        </div>
      )}

      {meta.total_duration_ms != null && (
        <div className="pt-1 border-t border-gray-200">
          <span className="font-semibold text-gray-700">{t(language, "total_pipeline")}</span>
          <span className="ml-2 text-gray-500">{meta.total_duration_ms}ms</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-green-50 text-gray-800">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        language={language}
        onNewChat={handleNewChat}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={deleteSession}
      />

      <main className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto">
        <div className="z-10 w-full max-w-5xl font-mono text-sm">
          <h1 className="text-3xl md:text-4xl font-bold text-center text-green-800 mb-8">{t(language, "title")}</h1>

          <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-6 w-full mx-auto max-w-2xl">
          <label className="block mb-2 font-bold">{t(language, "language_label")}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full p-2 border border-green-300 rounded text-black bg-white"
          >
            <option value="en-IN">English</option>
            <option value="hi-IN">हिंदी (Hindi)</option>
            <option value="mr-IN">मराठी (Marathi)</option>
            <option value="te-IN">తెలుగు (Telugu)</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 mx-auto max-w-2xl">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-2 px-4 rounded-t-lg font-bold text-sm transition-colors ${activeTab === "chat" ? "bg-white text-green-800 shadow-md" : "bg-green-200 text-green-700 hover:bg-green-100"}`}
          >
            {t(language, "tab_chat")}
          </button>
          <button
            onClick={() => setActiveTab("drone")}
            className={`flex-1 py-2 px-4 rounded-t-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${activeTab === "drone" ? "bg-white text-green-800 shadow-md" : "bg-green-200 text-green-700 hover:bg-green-100"}`}
          >
            <DroneIcon /> {t(language, "tab_drone")}
          </button>
        </div>

        {/* 3D Drone Survey Panel */}
        {activeTab === "drone" && <DroneSimulatorScene language={language} />}

        {/* Chat Panel */}
        <div className={`bg-white p-4 md:p-6 rounded-lg shadow-md w-full mx-auto max-w-2xl min-h-[400px] flex flex-col ${activeTab !== "chat" ? "hidden" : ""}`}>
          <div className="flex-grow overflow-y-auto mb-4 border-b border-gray-200 pb-4 h-96">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-center mt-10">{t(language, "placeholder_empty")}</p>
            ) : (
              messages.map((msg, i) =>
                msg.role === "agent" && !msg.content ? null : (
                  <div key={i} className={`mb-4 p-3 rounded-lg ${msg.role === "user" ? "bg-green-100 ml-auto w-5/6 md:w-3/4" : "bg-gray-100 mr-auto w-5/6 md:w-3/4"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-green-800">
                        {msg.role === "user" ? t(language, "you") : t(language, "kisan_ai")}
                      </span>
                      <div className="flex gap-1">
                        {msg.role === "agent" && msg.metadata && (
                          <button
                            onClick={() => toggleMetadata(i)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${expandedMeta.has(i) ? "bg-purple-200 text-purple-800" : "bg-gray-200 hover:bg-gray-300 text-gray-600"}`}
                            title={t(language, "insights_button")}
                          >
                            {expandedMeta.has(i) ? t(language, "hide_button") : t(language, "insights_button")}
                          </button>
                        )}
                        {msg.role === "agent" && msg.audioBase64 && (
                          <button
                            onClick={() => playingIndex === i ? stopAudio() : playAudio(msg.audioBase64!, i)}
                            className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${playingIndex === i ? "bg-green-200 hover:bg-green-300 text-green-800" : "bg-gray-200 hover:bg-gray-300 text-gray-600"}`}
                          >
                            {playingIndex === i ? <><StopIcon /> {t(language, "stop_button")}</> : <><PlayIcon /> {t(language, "listen_button")}</>}
                          </button>
                        )}
                      </div>
                    </div>

                    {msg.role === "agent" && msg.metadata && expandedMeta.has(i) && (
                      <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <div className="font-semibold text-xs text-gray-700 mb-2">{t(language, "model_insights")}</div>
                        {renderMetadata(msg.metadata)}
                      </div>
                    )}

                    {msg.role === "agent" ? renderMessageContent(msg.content) : <p className="text-sm md:text-base whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                )
              )
            )}
            {loadingText && (
              <div className="bg-gray-100 p-3 rounded-lg mr-auto w-5/6 md:w-3/4 text-gray-500 animate-pulse flex items-center gap-2">
                {loadingText}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {imageFile && (
            <div className="mb-2 text-sm text-blue-600 flex justify-between items-center bg-blue-50 p-2 rounded">
              <span>{imageFile.name}</span>
              <button onClick={() => { setImageFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-red-500 font-bold hover:text-red-700">X</button>
            </div>
          )}

          <form onSubmit={handleAsk} className="flex gap-2 items-center">
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => { if (isRecording) stopRecording(); }}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`p-3 rounded-full text-white transition-colors ${isRecording ? "bg-red-500 animate-pulse" : "bg-blue-500 hover:bg-blue-600"}`}
              title={t(language, "hold_to_record")}
            >
              <MicIcon />
            </button>

            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              title={t(language, "attach_image")}
            >
              <ImageIcon />
            </button>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRecording ? t(language, "recording") : t(language, "placeholder")}
              className="flex-grow p-3 border border-green-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loading}
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-3 md:px-6 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
              disabled={loading || (!query.trim() && !imageFile)}
            >
              {t(language, "ask_button")}
            </button>
          </form>
        </div>
        </div>
      </main>
    </div>
  );
}
