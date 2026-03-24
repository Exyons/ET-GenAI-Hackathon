"use client";

import { useState, useRef, useEffect } from "react";

const loadingPhrases: Record<string, string[]> = {
  "en-IN": ["Analyzing soil data...", "Consulting KVK guidelines...", "Checking weather patterns...", "Sowing seeds of thought..."],
  "hi-IN": ["मिट्टी का विश्लेषण...", "KVK दिशा-निर्देश देख रहे हैं...", "मौसम की जांच...", "विचारों के बीज बो रहे हैं..."],
  "mr-IN": ["मातीचे विश्लेषण...", "KVK मार्गदर्शक तत्त्वे...", "हवामान तपासत आहे...", "विचारांचे बीज पेरत आहे..."],
  "te-IN": ["మట్టి విశ్లేషణ...", "KVK మార్గదర్శకాలు...", "వాతావరణం తనిఖీ...", "ఆలోచనల విత్తనాలు నాటుతున్నాము..."]
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("hi-IN"); // Web Speech API format
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // TTS State
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingIntervalRef = useRef<any>(null);

  useEffect(() => {
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

  const toggleSpeech = (text: string, lang: string, index: number) => {
    if (!("speechSynthesis" in window)) return;
    
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
      const cleanText = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = lang;
      utterance.rate = 0.9;
      
      utterance.onend = () => { setPlayingIndex(null); setIsPaused(false); };
      utterance.onpause = () => setIsPaused(true);
      utterance.onresume = () => setIsPaused(false);
      
      window.speechSynthesis.speak(utterance);
      setPlayingIndex(index);
      setIsPaused(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImageFile(e.target.files[0]);
    }
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
        
        res = await fetch("http://localhost:8000/api/upload_image_stream", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("http://localhost:8000/api/ask_stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: currentQuery, language: backendLang }),
        });
      }

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
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
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = fullText;
                  return newMsgs;
                });
              } else if (data.type === "error") {
                fullText += `\n[Error: ${data.message}]`;
              }
            } catch (err) {
              console.error("Error parsing JSON:", err);
            }
          }
        }
      }
      
      // Speak final answer
      if (fullText.trim()) {
        toggleSpeech(fullText, language, messages.length + 1); // messages.length + 1 is the agent's index
      }
      
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "Error connecting to the backend.";
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
    // Check if there is a think block
    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const hasThink = !!thinkMatch;
    const thinkContent = hasThink ? thinkMatch[1] : "";
    const mainContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();

    return (
      <>
        {hasThink && (
          <div className="bg-gray-200 p-3 rounded-md mb-3 text-sm text-gray-700 border border-gray-300">
            <span className="font-bold flex items-center gap-2 mb-1">
              🌾 Thinking...
            </span>
            <div className="whitespace-pre-wrap opacity-80">{thinkContent}</div>
          </div>
        )}
        <div className="whitespace-pre-wrap">{mainContent}</div>
      </>
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
                (msg.role === "agent" && !msg.content) ? null : (
                  <div key={i} className={`mb-4 p-3 rounded-lg ${msg.role === "user" ? "bg-green-100 ml-auto w-5/6 md:w-3/4" : "bg-gray-100 mr-auto w-5/6 md:w-3/4"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-green-800">{msg.role === "user" ? "You" : "Kisan AI"}</span>
                      {msg.role === "agent" && msg.content && (
                        <button 
                          onClick={() => toggleSpeech(msg.content, language, i)}
                          className={`text-xs px-3 py-1 rounded transition-colors ${playingIndex === i ? (isPaused ? 'bg-yellow-200 hover:bg-yellow-300 text-yellow-800' : 'bg-green-200 hover:bg-green-300 text-green-800') : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                          {playingIndex === i ? (isPaused ? '▶️ Resume' : '⏸️ Pause') : '🔊 Listen'}
                        </button>
                      )}
                    </div>
                    {msg.role === "agent" ? renderMessageContent(msg.content) : <p className="text-sm md:text-base whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                )
              ))
            )}
            {loadingText && (
              <div className="bg-gray-100 p-3 rounded-lg mr-auto w-5/6 md:w-3/4 text-gray-500 animate-pulse flex items-center gap-2">
                ⏳ {loadingText}
              </div>
            )}
          </div>

          {imageFile && (
             <div className="mb-2 text-sm text-blue-600 flex justify-between items-center bg-blue-50 p-2 rounded">
               <span>📎 {imageFile.name}</span>
               <button onClick={() => { setImageFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-red-500 font-bold hover:text-red-700">X</button>
             </div>
          )}

          <form onSubmit={handleAsk} className="flex gap-2 items-center">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-full text-white transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}`}
              title="Click to speak"
            >
              🎤
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
              📎
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
