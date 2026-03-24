from typing import TypedDict, Optional, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from ollama import Client
import chromadb
import chromadb.utils.embedding_functions as embedding_functions
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "chroma_db")

# Environment configurations
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

# Initialize Ollama client pointing to the specific host
ollama_client = Client(host=OLLAMA_BASE_URL)


class AdvisoryState(TypedDict):
    user_query: str  # Original input in user's language
    translated_query: str  # Input translated to English
    user_language: str  # e.g., 'hi', 'en', 'mr'
    image_symptoms: Optional[str]  # Extracted from VLM (if image provided)
    location_weather: Optional[str]  # Weather/Location context
    is_agricultural: bool  # True if related to agriculture
    retrieved_docs: List[str]  # Documents from RAG
    draft_answer: str  # Draft answer in English
    is_safe: bool  # Checked against fallbacks/safety
    final_answer: str  # Translated final answer


# Setup Chroma Client
client = chromadb.PersistentClient(path=DB_DIR)
default_ef = embedding_functions.DefaultEmbeddingFunction()
try:
    collection = client.get_collection(
        name="agri_compliance", embedding_function=default_ef
    )
except Exception:
    collection = None


def get_llm_response(prompt: str, model=OLLAMA_MODEL) -> str:
    """Helper to query Ollama locally or remotely."""
    try:
        response = ollama_client.chat(
            model=model, messages=[{"role": "user", "content": prompt}]
        )
        return response["message"]["content"].strip()
    except Exception as e:
        print(f"Ollama Error: {e}")
        return ""


def translate_to_english(state: AdvisoryState):
    """Translates the native user query to English."""
    print("--- Translating to English ---")
    query = state["user_query"]
    lang = state.get("user_language", "en")

    if lang == "en" or lang.lower() == "english":
        return {"translated_query": query}

    prompt = f"Translate the following text from {lang} to English. Preserve any local agricultural terms by transliterating them. Return ONLY the English translation.\nText: {query}"
    eng_query = get_llm_response(prompt)
    return {"translated_query": eng_query or query}


def check_intent(state: AdvisoryState):
    """Checks if the query is agricultural."""
    print("--- Checking Intent ---")
    query = state["translated_query"]

    prompt = f"Classify this query: '{query}'. Is this query related to agriculture, farming, crops, weather, or pests? Reply with ONLY 'YES' or 'NO'."
    ans = get_llm_response(prompt).upper()
    is_agri = "YES" in ans
    return {"is_agricultural": is_agri}


def fetch_rag_context(state: AdvisoryState):
    """Fetches relevant compliance guidelines from Vector DB."""
    print("--- Fetching RAG Context ---")
    if not collection:
        return {"retrieved_docs": []}

    query = state["translated_query"]
    if state.get("image_symptoms"):
        query += " " + state["image_symptoms"]

    results = collection.query(query_texts=[query], n_results=3)
    docs = results["documents"][0] if results["documents"] else []
    return {"retrieved_docs": docs}


def draft_advisory(state: AdvisoryState):
    """Drafts an answer based ONLY on the retrieved docs."""
    print("--- Drafting Advisory ---")
    docs = state.get("retrieved_docs", [])
    context = "\n\n".join(docs)
    query = state["translated_query"]
    symptoms = state.get("image_symptoms", "")
    weather = state.get("location_weather", "")

    if not docs:
        return {"draft_answer": "UNKNOWN", "is_safe": False}

    prompt = f"""You are a strict agricultural advisor in India. 
Context from official guidelines:
{context}

User Query: {query}
Image Symptoms: {symptoms}
Weather Context: {weather}

Answer the query based ONLY on the context provided above. 
If the context does not contain the answer, or if the user asks for a banned chemical, you MUST output exactly 'UNKNOWN'.
Do not guess. Do not hallucinate."""

    draft = get_llm_response(prompt)
    is_safe = draft != "UNKNOWN"
    return {"draft_answer": draft, "is_safe": is_safe}


def final_translation(state: AdvisoryState):
    """Translates the safe draft or the fallback back to the user's language."""
    print("--- Final Translation ---")
    lang = state.get("user_language", "en")
    is_agri = state.get("is_agricultural", True)
    is_safe = state.get("is_safe", True)
    draft = state.get("draft_answer", "")

    if not is_agri:
        msg = "I am an agricultural assistant. For human health, politics, or other matters, please consult a relevant professional."
    elif not is_safe or draft == "UNKNOWN":
        msg = "I do not have enough verified information to answer this safely. Please consult your local Krishi Vigyan Kendra (KVK) official or agricultural officer."
    else:
        msg = draft

    if lang == "en" or lang.lower() == "english":
        return {"final_answer": msg}

    prompt = f"Translate the following agricultural advice into {lang}. Use simple, conversational language suitable for a farmer.\nText: {msg}"
    final_ans = get_llm_response(prompt)
    return {"final_answer": final_ans or msg}


def build_graph():
    """Builds the LangGraph state machine."""
    workflow = StateGraph(AdvisoryState)

    # Add nodes
    workflow.add_node("translate", translate_to_english)
    workflow.add_node("intent", check_intent)
    workflow.add_node("rag", fetch_rag_context)
    workflow.add_node("draft", draft_advisory)
    workflow.add_node("finalize", final_translation)

    # Edges
    workflow.add_edge(START, "translate")
    workflow.add_edge("translate", "intent")

    # Conditional branching
    def route_intent(state):
        if state["is_agricultural"]:
            return "rag"
        return "finalize"

    workflow.add_conditional_edges(
        "intent", route_intent, {"rag": "rag", "finalize": "finalize"}
    )
    workflow.add_edge("rag", "draft")
    workflow.add_edge("draft", "finalize")
    workflow.add_edge("finalize", END)

    return workflow.compile()


# Singleton instance
agent_app = build_graph()
