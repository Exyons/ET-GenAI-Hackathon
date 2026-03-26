import os
import re
import glob
import chromadb
import chromadb.utils.embedding_functions as embedding_functions

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "compliance")
DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "chroma_db")

# Crop keywords for auto-tagging metadata
CROP_KEYWORDS = {
    "rice": ["rice", "paddy", "oryza", "chawal", "dhan"],
    "wheat": ["wheat", "triticum", "gehun", "gehu"],
    "cotton": ["cotton", "gossypium", "kapas"],
    "sugarcane": ["sugarcane", "saccharum", "ganna"],
    "maize": ["maize", "corn", "zea mays", "makka"],
    "soybean": ["soybean", "soya", "glycine max"],
    "chickpea": ["chickpea", "chana", "gram", "cicer"],
    "pigeon_pea": ["pigeon pea", "tur", "arhar", "cajanus"],
    "groundnut": ["groundnut", "peanut", "arachis", "moongfali"],
    "mustard": ["mustard", "rapeseed", "brassica", "sarson"],
    "tomato": ["tomato", "lycopersicon", "tamatar"],
    "onion": ["onion", "allium cepa", "pyaz", "pyaaz"],
    "potato": ["potato", "solanum tuberosum", "aloo"],
    "bajra": ["pearl millet", "bajra", "pennisetum"],
    "ragi": ["finger millet", "ragi", "eleusine"],
    "jowar": ["sorghum", "jowar", "sorghum bicolor"],
    "chilli": ["chilli", "chili", "capsicum", "mirch"],
    "okra": ["okra", "bhindi", "abelmoschus"],
    "sunflower": ["sunflower", "helianthus"],
    "moong": ["green gram", "moong", "mung", "vigna radiata"],
    "urad": ["black gram", "urad", "vigna mungo"],
}

CATEGORY_KEYWORDS = {
    "pest_management": ["pest", "insect", "borer", "aphid", "whitefly", "mite", "thrips", "caterpillar", "grub", "fly", "beetle", "hopper", "mealybug"],
    "disease_management": ["disease", "blight", "wilt", "rust", "rot", "smut", "mildew", "virus", "bacterial", "fungal", "mosaic"],
    "nutrient_management": ["fertilizer", "nutrient", "nitrogen", "phosphorus", "potassium", "micronutrient", "zinc", "iron", "boron", "sulphur", "manure", "compost"],
    "water_management": ["irrigation", "water", "drip", "sprinkler", "moisture", "drought", "rainfall", "fertigation"],
    "variety_recommendation": ["variety", "varieties", "hybrid", "cultivar", "seed rate", "recommended"],
    "organic_farming": ["organic", "bio-fertilizer", "vermicompost", "neem", "trichoderma", "panchagavya", "jeevamrutha"],
    "government_scheme": ["scheme", "subsidy", "PM-KISAN", "PMFBY", "KCC", "MSP", "government", "policy"],
    "soil_health": ["soil", "pH", "acidic", "alkaline", "saline", "organic carbon", "soil health card"],
    "harvest_storage": ["harvest", "storage", "post-harvest", "marketing", "grading", "moisture content"],
    "weed_management": ["weed", "herbicide", "pendimethalin", "2,4-D", "atrazine", "clodinafop"],
    "banned_chemicals": ["banned", "restricted", "prohibited", "illegal", "hazardous"],
}


def detect_crops(text: str) -> list[str]:
    """Auto-detect crop names from text content."""
    text_lower = text.lower()
    crops = []
    for crop, keywords in CROP_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            crops.append(crop)
    return crops or ["general"]


def detect_categories(text: str) -> list[str]:
    """Auto-detect advisory categories from text content."""
    text_lower = text.lower()
    categories = []
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if sum(1 for kw in keywords if kw in text_lower) >= 2:
            categories.append(cat)
    return categories or ["general_advisory"]


def chunk_markdown(content: str, max_chunk_size: int = 1500) -> list[dict]:
    """Split markdown by ## headers into semantically meaningful chunks.

    Each chunk contains the document title (# header) + one ## section.
    If a section is too long, it's split further by ### headers.
    If still too long, it's split by paragraphs.
    """
    lines = content.split("\n")

    # Extract document title (first # header)
    doc_title = ""
    for line in lines:
        if line.startswith("# ") and not line.startswith("## "):
            doc_title = line.strip("# ").strip()
            break

    # Split by ## headers
    sections = []
    current_section = {"header": "", "lines": []}

    for line in lines:
        if line.startswith("## "):
            if current_section["lines"]:
                sections.append(current_section)
            current_section = {"header": line.strip("# ").strip(), "lines": [line]}
        else:
            current_section["lines"].append(line)

    if current_section["lines"]:
        sections.append(current_section)

    # Build chunks
    chunks = []
    for section in sections:
        section_text = "\n".join(section["lines"]).strip()
        if not section_text:
            continue

        # Prepend doc title for context
        if doc_title and section["header"]:
            section_text = f"# {doc_title}\n\n{section_text}"

        if len(section_text) <= max_chunk_size:
            chunks.append({
                "text": section_text,
                "section": section["header"] or doc_title,
            })
        else:
            # Split by ### sub-headers
            sub_chunks = _split_by_subheaders(section_text, max_chunk_size, doc_title, section["header"])
            chunks.extend(sub_chunks)

    return chunks if chunks else [{"text": content, "section": doc_title or "document"}]


def _split_by_subheaders(text: str, max_size: int, doc_title: str, section_header: str) -> list[dict]:
    """Split a section by ### headers, then by paragraphs if needed."""
    parts = re.split(r'(?=^### )', text, flags=re.MULTILINE)

    result = []
    for part in parts:
        part = part.strip()
        if not part:
            continue

        if len(part) <= max_size:
            # Extract sub-header if present
            sub_header = ""
            first_line = part.split("\n")[0]
            if first_line.startswith("### "):
                sub_header = first_line.strip("# ").strip()

            result.append({
                "text": part,
                "section": f"{section_header} > {sub_header}" if sub_header else section_header,
            })
        else:
            # Split by double newlines (paragraphs)
            paragraphs = part.split("\n\n")
            current = ""
            for para in paragraphs:
                if len(current) + len(para) + 2 > max_size and current:
                    result.append({
                        "text": current.strip(),
                        "section": section_header,
                    })
                    current = para
                else:
                    current = current + "\n\n" + para if current else para
            if current.strip():
                result.append({
                    "text": current.strip(),
                    "section": section_header,
                })

    return result


def ingest_compliance_data():
    """Ingests Markdown compliance documents into ChromaDB with proper chunking and metadata."""
    print("Initializing ChromaDB...")

    client = chromadb.PersistentClient(path=DB_DIR)
    default_ef = embedding_functions.DefaultEmbeddingFunction()

    collection_name = "agri_compliance"
    try:
        client.delete_collection(name=collection_name)
        print(f"Deleted existing collection: {collection_name}")
    except Exception:
        pass

    collection = client.create_collection(
        name=collection_name,
        embedding_function=default_ef,
        metadata={"hnsw:space": "cosine"}
    )

    md_files = glob.glob(os.path.join(DATA_DIR, "*.md"))

    documents = []
    metadatas = []
    ids = []
    chunk_id = 0

    for file_path in sorted(md_files):
        filename = os.path.basename(file_path)
        print(f"Processing: {filename}")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Chunk the document
        chunks = chunk_markdown(content)

        for chunk in chunks:
            text = chunk["text"]

            # Auto-detect metadata
            crops = detect_crops(text)
            categories = detect_categories(text)

            documents.append(text)
            metadatas.append({
                "source": filename,
                "section": chunk["section"],
                "crops": ",".join(crops),
                "categories": ",".join(categories),
                "type": "compliance_advisory",
            })
            ids.append(f"chunk_{chunk_id}")
            chunk_id += 1

    if documents:
        # ChromaDB has a batch size limit — add in batches of 100
        batch_size = 100
        for i in range(0, len(documents), batch_size):
            batch_end = min(i + batch_size, len(documents))
            collection.add(
                documents=documents[i:batch_end],
                metadatas=metadatas[i:batch_end],
                ids=ids[i:batch_end],
            )
            print(f"  Added chunks {i+1}-{batch_end} of {len(documents)}")

        print(f"\nIngestion complete! {len(documents)} chunks from {len(md_files)} files.")
        print(f"Crops covered: {sorted(set(c for m in metadatas for c in m['crops'].split(',')))}")
        print(f"Categories: {sorted(set(c for m in metadatas for c in m['categories'].split(',')))}")
    else:
        print("No documents found to ingest.")


if __name__ == "__main__":
    ingest_compliance_data()
