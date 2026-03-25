"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const loadingPhrases: Record<string, string[]> = {
  "en-IN": ["Analyzing soil data...", "Consulting KVK guidelines...", "Checking weather patterns...", "Sowing seeds of thought..."],
  "hi-IN": ["मिट्टी का विश्लेषण...", "KVK दिशा-निर्देश देख रहे हैं...", "मौसम की जांच...", "विचारों के बीज बो रहे हैं..."],
  "mr-IN": ["मातीचे विश्लेषण...", "KVK मार्गदर्शक तत्त्वे...", "हवामान तपासत आहे...", "विचारांचे बीज पेरत आहे..."],
  "te-IN": ["మట్టి విశ్లేషణ...", "KVK మార్గదర్శకాలు...", "వాతావరణం తనిఖీ...", "ఆలోచనల విత్తనాలు నాటుతున్నాము..."]
};

interface PipelineMetadata {
  translate?: { original_query: string; translated_query: string; was_translated: boolean; source_language: string; duration_ms: number };
  intent?: { is_agricultural: boolean; raw_response: string; duration_ms: number };
  rag?: { num_documents: number; scores: number[]; sources: string[]; doc_previews: string[]; duration_ms: number };
  vision?: { filename: string; image_size_kb: number; model: string; symptoms_detected: string; duration_ms: number; error?: string };
  generate?: { model: string; chunks_streamed: number; generation_duration_ms: number };
  total_duration_ms?: number;
}

interface Message {
  role: string;
  content: string;
  metadata?: PipelineMetadata;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("hi-IN");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sttSupported, setSttSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [expandedMeta, setExpandedMeta] = useState<Set<number>>(new Set());

  // TTS State
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingIntervalRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingText]);

  // Initialize STT
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasSpeechRecognition = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    setSttSupported(hasSpeechRecognition);
    setTtsSupported("speechSynthesis" in window);

    if (hasSpeechRecognition) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    // Pre-load TTS voices
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const toggleListening = () => {
    if (!sttSupported) {
      alert("Speech-to-Text requires Google Chrome or a Chromium-based browser (Edge, Brave, etc.). Please switch browsers to use voice input.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = language;
        recognitionRef.current.start();
        setIsListening(true);
      }
    }
  };

  const findVoiceForLang = useCallback((lang: string): SpeechSynthesisVoice | null => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    // Try exact match first (e.g. "hi-IN")
    let voice = voices.find(v => v.lang === lang);
    if (voice) return voice;
    // Try prefix match (e.g. "hi")
    const prefix = lang.split("-")[0];
    voice = voices.find(v => v.lang.startsWith(prefix));
    if (voice) return voice;
    // Fallback to any English voice
    voice = voices.find(v => v.lang.startsWith("en"));
    return voice || null;
  }, []);

  const toggleSpeech = useCallback((text: string, lang: string, index: number) => {
    if (!ttsSupported) return;

    // If clicking the same message
    if (playingIndex === index) {
      if (isPaused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    } else {
      // Clean <think> tags out of spoken text
      const cleanText = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
      if (!cleanText) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = lang;
      utterance.rate = 0.9;

      // Try to find a voice for the language
      const voice = findVoiceForLang(lang);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => { setPlayingIndex(null); setIsPaused(false); };
      utterance.onerror = (e) => { console.error("TTS error:", e); setPlayingIndex(null); setIsPaused(false); };
      utterance.onpause = () => setIsPaused(true);
      utterance.onresume = () => setIsPaused(false);

      window.speechSynthesis.speak(utterance);
      setPlayingIndex(index);
      setIsPaused(false);
    }
  }, [playingIndex, isPaused, ttsSupported, findVoiceForLang]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImageFile(e.target.files[0]);
    }
  };

  const toggleMetadata = (index: number) => {
    setExpandedMeta(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() && !imageFile) return;

    const currentQuery = query || "Please analyze this image.";
    const userMessage = imageFile ? `[Attached: ${imageFile.name}]\n${currentQuery}` : currentQuery;

    setMessages((prev) => [...prev, { role: "user", content: userMessage }, { role: "agent", content: "" }]);
    setQuery("");
    setLoading(true);

    // Start farming loading phrases
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

        res = await fetch(`${API_URL}/api/upload_image_stream`, {
          method: "POST",
          body: formData,
        });
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === "chunk") {
                // Clear loading state on first chunk
                if (loadingIntervalRef.current) {
                  clearInterval(loadingIntervalRef.current);
                  loadingIntervalRef.current = null;
                  setLoadingText("");
                }

                fullText += data.content;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: fullText };
                  return newMsgs;
                });
              } else if (data.type === "metadata") {
                // Collect pipeline metadata
                const step = data.step as keyof PipelineMetadata;
                (metadata as any)[step] = data.data;
                // Update metadata on the message in real-time
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], metadata: { ...metadata } };
                  return newMsgs;
                });
              } else if (data.type === "done") {
                metadata.total_duration_ms = data.total_duration_ms;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], metadata: { ...metadata } };
                  return newMsgs;
                });
              } else if (data.type === "error") {
                fullText += `\n[Error: ${data.message}]`;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: fullText };
                  return newMsgs;
                });
              }
            } catch (err) {
              console.error("Error parsing SSE JSON:", err);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: "Error connecting to the backend." };
        return newMsgs;
      });
    } finally {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      setLoading(false);
      setLoadingText("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const renderMessageContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const hasThink = !!thinkMatch;
    const thinkContent = hasThink ? thinkMatch[1] : "";
    const mainContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();

    return (
      <>
        {hasThink && (
          <div className="bg-gray-200 p-3 rounded-md mb-3 text-sm text-gray-700 border border-gray-300">
            <span className="font-bold flex items-center gap-2 mb-1">Thinking...</span>
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

  const renderMetadata = (meta: PipelineMetadata) => {
    return (
      <div className="text-xs space-y-2 text-gray-600">
        {/* Translation */}
        {meta.translate && (
          <div>
            <span className="font-semibold text-gray-700">Translation</span>
            {meta.translate.was_translated ? (
              <span className="ml-2 text-blue-600">{meta.translate.source_language} &rarr; en ({meta.translate.duration_ms}ms)</span>
            ) : (
              <span className="ml-2 text-gray-500">skipped (already English)</span>
            )}
            {meta.translate.was_translated && (
              <div className="ml-2 mt-1 text-gray-500 italic">&quot;{meta.translate.translated_query}&quot;</div>
            )}
          </div>
        )}

        {/* Intent */}
        {meta.intent && (
          <div>
            <span className="font-semibold text-gray-700">Intent Check</span>
            <span className={`ml-2 font-mono ${meta.intent.is_agricultural ? "text-green-600" : "text-red-600"}`}>
              {meta.intent.is_agricultural ? "AGRICULTURAL" : "REJECTED"}
            </span>
            <span className="ml-1 text-gray-400">({meta.intent.raw_response}) {meta.intent.duration_ms}ms</span>
          </div>
        )}

        {/* Vision */}
        {meta.vision && (
          <div>
            <span className="font-semibold text-gray-700">Vision Analysis</span>
            <span className="ml-2 text-gray-500">{meta.vision.model} | {meta.vision.image_size_kb}KB | {meta.vision.duration_ms}ms</span>
            {meta.vision.error && <div className="ml-2 text-red-500">Error: {meta.vision.error}</div>}
            {meta.vision.symptoms_detected && !meta.vision.error && (
              <div className="ml-2 mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-gray-700">{meta.vision.symptoms_detected}</div>
            )}
          </div>
        )}

        {/* RAG */}
        {meta.rag && (
          <div>
            <span className="font-semibold text-gray-700">RAG Context</span>
            <span className="ml-2 text-gray-500">{meta.rag.num_documents} docs | {meta.rag.duration_ms}ms</span>
            {meta.rag.scores && meta.rag.scores.length > 0 && (
              <div className="ml-2 mt-1 space-y-1">
                {meta.rag.scores.map((score, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-gray-500 w-20 truncate" title={meta.rag?.sources?.[i]}>
                      {meta.rag?.sources?.[i] || `Doc ${i + 1}`}
                    </span>
                    {renderConfidenceBar(score)}
                    {meta.rag?.doc_previews?.[i] && (
                      <span className="text-gray-400 truncate max-w-xs" title={meta.rag.doc_previews[i]}>
                        {meta.rag.doc_previews[i].substring(0, 60)}...
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Generation */}
        {meta.generate && (
          <div>
            <span className="font-semibold text-gray-700">Generation</span>
            <span className="ml-2 text-gray-500">{meta.generate.model} | {meta.generate.chunks_streamed} chunks | {meta.generate.generation_duration_ms}ms</span>
          </div>
        )}

        {/* Total */}
        {meta.total_duration_ms && (
          <div className="pt-1 border-t border-gray-200">
            <span className="font-semibold text-gray-700">Total Pipeline</span>
            <span className="ml-2 text-gray-500">{meta.total_duration_ms}ms</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8 bg-green-50 text-gray-800">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-3xl md:text-4xl font-bold text-center text-green-800 mb-8">Kisan AI - Agricultural Advisor</h1>

        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-6 w-full mx-auto max-w-2xl">
          <label className="block mb-2 font-bold">Preferred Language:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full p-2 border border-green-300 rounded mb-4 text-black bg-white"
          >
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="mr-IN">Marathi</option>
            <option value="te-IN">Telugu</option>
          </select>

          {/* Browser compatibility notices */}
          {!sttSupported && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded mb-2">
              Voice input requires Chrome/Edge/Brave. Use text input instead.
            </div>
          )}
          {!ttsSupported && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
              Text-to-Speech is not available in this browser.
            </div>
          )}
        </div>

        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md w-full mx-auto max-w-2xl min-h-[400px] flex flex-col">
          <div className="flex-grow overflow-y-auto mb-4 border-b border-gray-200 pb-4 h-96">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-center mt-10">Ask a question about your crops or farming practices...</p>
            ) : (
              messages.map((msg, i) =>
                msg.role === "agent" && !msg.content ? null : (
                  <div key={i} className={`mb-4 p-3 rounded-lg ${msg.role === "user" ? "bg-green-100 ml-auto w-5/6 md:w-3/4" : "bg-gray-100 mr-auto w-5/6 md:w-3/4"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-green-800">{msg.role === "user" ? "You" : "Kisan AI"}</span>
                      <div className="flex gap-1">
                        {msg.role === "agent" && msg.metadata && (
                          <button
                            onClick={() => toggleMetadata(i)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${expandedMeta.has(i) ? "bg-purple-200 text-purple-800" : "bg-gray-200 hover:bg-gray-300 text-gray-600"}`}
                            title="Show pipeline details"
                          >
                            {expandedMeta.has(i) ? "Hide Details" : "Pipeline"}
                          </button>
                        )}
                        {msg.role === "agent" && msg.content && ttsSupported && (
                          <button
                            onClick={() => toggleSpeech(msg.content, language, i)}
                            className={`text-xs px-3 py-1 rounded transition-colors ${playingIndex === i ? (isPaused ? "bg-yellow-200 hover:bg-yellow-300 text-yellow-800" : "bg-green-200 hover:bg-green-300 text-green-800") : "bg-gray-200 hover:bg-gray-300"}`}
                          >
                            {playingIndex === i ? (isPaused ? "Resume" : "Pause") : "Listen"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pipeline metadata panel */}
                    {msg.role === "agent" && msg.metadata && expandedMeta.has(i) && (
                      <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <div className="font-semibold text-xs text-gray-700 mb-2">Pipeline Details</div>
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
              onClick={toggleListening}
              className={`p-3 rounded-full text-white transition-colors ${!sttSupported ? "bg-gray-400 cursor-not-allowed" : isListening ? "bg-red-500 animate-pulse" : "bg-blue-500 hover:bg-blue-600"}`}
              title={sttSupported ? "Click to speak" : "Voice input not supported in this browser"}
            >
              Mic
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              title="Attach Image"
            >
              Img
            </button>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type or use microphone..."
              className="flex-grow p-3 border border-green-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loading}
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-3 md:px-6 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
              disabled={loading || (!query.trim() && !imageFile)}
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
