import os
import glob
import chromadb
import chromadb.utils.embedding_functions as embedding_functions

# Path to compliance data
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "compliance")
DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "chroma_db")

def ingest_compliance_data():
    """Ingests Markdown compliance documents into ChromaDB."""
    print("Initializing ChromaDB...")
    
    # Initialize Chroma client
    client = chromadb.PersistentClient(path=DB_DIR)
    
    # chromadb's default embedding function
    default_ef = embedding_functions.DefaultEmbeddingFunction()
    
    # Get or create collection
    collection_name = "agri_compliance"
    try:
        # Try to delete if it exists to start fresh during dev
        client.delete_collection(name=collection_name)
        print(f"Deleted existing collection: {collection_name}")
    except Exception:
        pass
        
    collection = client.create_collection(
        name=collection_name, 
        embedding_function=default_ef,
        metadata={"hnsw:space": "cosine"}
    )
    
    # Find all markdown files
    md_files = glob.glob(os.path.join(DATA_DIR, "*.md"))
    
    documents = []
    metadatas = []
    ids = []
    
    for i, file_path in enumerate(md_files):
        print(f"Processing: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        filename = os.path.basename(file_path)
        
        # Simple chunking for now (entire file as one document, since they are small)
        documents.append(content)
        metadatas.append({"source": filename, "type": "compliance_advisory"})
        ids.append(f"doc_{i}")

    if documents:
        print(f"Adding {len(documents)} documents to ChromaDB...")
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        print("Ingestion complete!")
    else:
        print("No documents found to ingest.")

if __name__ == "__main__":
    ingest_compliance_data()
