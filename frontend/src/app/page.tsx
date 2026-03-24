"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("hi-IN"); // Web Speech API format
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
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
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = language;
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const speak = (text: string, lang: string) => {
    if ("speechSynthesis" in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      // You can adjust rate and pitch here if needed
      utterance.rate = 0.9; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    const currentQuery = query;
    setMessages((prev) => [...prev, { role: "user", content: currentQuery }]);
    setQuery("");
    setLoading(true);

    try {
      // Convert browser locale format to simple lang code for backend (hi-IN -> hi)
      const backendLang = language.split("-")[0];
      
      const res = await fetch("http://localhost:8000/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: currentQuery, language: backendLang }),
      });
      const data = await res.json();
      
      setMessages((prev) => [...prev, { role: "agent", content: data.final_answer }]);
      
      // Auto-play the TTS for the response
      speak(data.final_answer, language);
      
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "agent", content: "Error connecting to the backend." }]);
    } finally {
      setLoading(false);
    }
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
            <option value="hi-IN">Hindi (हिंदी)</option>
            <option value="mr-IN">Marathi (मराठी)</option>
            <option value="te-IN">Telugu (తెలుగు)</option>
          </select>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md w-full mx-auto max-w-2xl min-h-[400px] flex flex-col">
          <div className="flex-grow overflow-y-auto mb-4 border-b border-gray-200 pb-4 h-96">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-center mt-10">Ask a question about your crops or farming practices...</p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`mb-4 p-3 rounded-lg ${msg.role === "user" ? "bg-green-100 ml-auto w-5/6 md:w-3/4" : "bg-gray-100 mr-auto w-5/6 md:w-3/4"}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-green-800">{msg.role === "user" ? "You" : "Kisan AI"}</span>
                    {msg.role === "agent" && (
                      <button 
                        onClick={() => speak(msg.content, language)}
                        className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        🔊 Listen
                      </button>
                    )}
                  </div>
                  <p className="text-sm md:text-base">{msg.content}</p>
                </div>
              ))
            )}
            {loading && <p className="text-green-600 animate-pulse mt-4 font-bold text-center">Consulting ICAR Guidelines...</p>}
          </div>

          <form onSubmit={handleAsk} className="flex gap-2 items-center">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-full text-white ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}`}
              title="Click to speak"
            >
              🎤
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
              className="bg-green-600 text-white px-4 py-3 md:px-6 rounded font-bold hover:bg-green-700 disabled:opacity-50"
              disabled={loading || !query.trim()}
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
