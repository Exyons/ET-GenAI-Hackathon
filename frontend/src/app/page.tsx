"use client";

import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("hi");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, language }),
      });
      const data = await res.json();
      
      setMessages((prev) => [...prev, { role: "agent", content: data.final_answer }]);
      setQuery("");
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "agent", content: "Error connecting to the backend." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 bg-green-50 text-gray-800">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center text-green-800 mb-8">Kisan AI - Agricultural Advisor</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 w-full mx-auto max-w-2xl">
          <label className="block mb-2 font-bold">Preferred Language:</label>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full p-2 border border-green-300 rounded mb-4 text-black"
          >
            <option value="en">English</option>
            <option value="hi">Hindi (हिंदी)</option>
            <option value="mr">Marathi (मराठी)</option>
            <option value="te">Telugu (తెలుగు)</option>
          </select>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto max-w-2xl min-h-[400px] flex flex-col">
          <div className="flex-grow overflow-y-auto mb-4 border-b border-gray-200 pb-4 h-96">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-center mt-10">Ask a question about your crops or farming practices...</p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`mb-4 p-3 rounded-lg ${msg.role === "user" ? "bg-green-100 ml-auto w-3/4" : "bg-gray-100 mr-auto w-3/4"}`}>
                  <span className="font-bold block mb-1 text-sm">{msg.role === "user" ? "You" : "Kisan AI"}</span>
                  <p>{msg.content}</p>
                </div>
              ))
            )}
            {loading && <p className="text-green-600 animate-pulse mt-4">Consulting ICAR Guidelines...</p>}
          </div>

          <form onSubmit={handleAsk} className="flex gap-2">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., My tomato leaves have brown spots, what to do?"
              className="flex-grow p-3 border border-green-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loading}
            />
            <button 
              type="submit" 
              className="bg-green-600 text-white px-6 py-3 rounded font-bold hover:bg-green-700 disabled:opacity-50"
              disabled={loading}
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
