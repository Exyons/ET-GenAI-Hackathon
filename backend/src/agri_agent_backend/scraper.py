"""ICAR Document Scraper — downloads and converts agricultural advisories to markdown.

Sources:
  - KRISHI Portal (krishi.icar.gov.in) — ICAR knowledge repo
  - data.gov.in — Open Government agricultural datasets
  - State KVK advisories

Usage:
  uv run python -m agri_agent_backend.scraper
  uv run python -m agri_agent_backend.scraper --url <specific_url>
"""

import argparse
import hashlib
import os
import re
import sys

import httpx
from bs4 import BeautifulSoup

# Directories
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "icar_raw")
COMPLIANCE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "compliance")

# Known advisory URLs (curated list of high-quality ICAR pages)
KNOWN_SOURCES = [
    {
        "url": "https://krishi.icar.gov.in/jspui/simple-search?query=crop+advisory",
        "type": "search_results",
        "description": "KRISHI Portal crop advisory search",
    },
    {
        "url": "https://kvk.icar.gov.in/API/Content/PPupload/k0001/Advisory/Advisory.htm",
        "type": "kvk_advisory",
        "description": "KVK advisory page template",
    },
]


def ensure_dirs():
    """Create data directories if they don't exist."""
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(COMPLIANCE_DIR, exist_ok=True)


def fetch_page(url: str, timeout: int = 30) -> str | None:
    """Fetch a web page and return its HTML content."""
    headers = {
        "User-Agent": "KisanAI-Agricultural-Advisor/1.0 (research; contact: hackathon@example.com)",
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.text
    except httpx.HTTPError as e:
        print(f"  Error fetching {url}: {e}")
        return None


def html_to_markdown(html: str, source_url: str = "") -> str:
    """Convert HTML content to clean markdown for ChromaDB ingestion."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove script, style, nav, footer elements
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    lines = []
    if source_url:
        lines.append(f"**Source:** {source_url}\n")

    # Process main content
    content = soup.find("main") or soup.find("article") or soup.find("div", class_="content") or soup.body or soup

    if not content:
        return ""

    for element in content.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th", "pre"]):
        text = element.get_text(strip=True)
        if not text:
            continue

        if element.name == "h1":
            lines.append(f"\n# {text}\n")
        elif element.name == "h2":
            lines.append(f"\n## {text}\n")
        elif element.name == "h3":
            lines.append(f"\n### {text}\n")
        elif element.name == "h4":
            lines.append(f"\n#### {text}\n")
        elif element.name == "li":
            lines.append(f"- {text}")
        elif element.name in ("td", "th"):
            continue  # Skip individual cells, handle tables below
        elif element.name == "pre":
            lines.append(f"```\n{text}\n```")
        else:
            lines.append(text)

    # Process tables
    for table in content.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue

        md_table = []
        for i, row in enumerate(rows):
            cells = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]
            md_table.append("| " + " | ".join(cells) + " |")
            if i == 0:
                md_table.append("| " + " | ".join(["---"] * len(cells)) + " |")

        lines.append("\n" + "\n".join(md_table) + "\n")

    result = "\n".join(lines)

    # Clean up excessive whitespace
    result = re.sub(r"\n{3,}", "\n\n", result)

    return result.strip()


def download_pdf(url: str) -> str | None:
    """Download a PDF file and return the local path."""
    ensure_dirs()
    filename = hashlib.md5(url.encode()).hexdigest()[:12] + ".pdf"
    filepath = os.path.join(RAW_DIR, filename)

    if os.path.exists(filepath):
        print(f"  Already downloaded: {filename}")
        return filepath

    headers = {
        "User-Agent": "KisanAI-Agricultural-Advisor/1.0",
    }
    try:
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(resp.content)
            print(f"  Downloaded: {filename} ({len(resp.content) / 1024:.1f} KB)")
            return filepath
    except httpx.HTTPError as e:
        print(f"  Error downloading PDF {url}: {e}")
        return None


def scrape_url(url: str) -> str | None:
    """Scrape a URL and save as markdown in the compliance directory."""
    print(f"Scraping: {url}")

    if url.lower().endswith(".pdf"):
        pdf_path = download_pdf(url)
        if pdf_path:
            print(f"  PDF saved to: {pdf_path}")
            print("  Note: PDF text extraction requires `pymupdf` — run `uv add pymupdf` to enable")
        return pdf_path

    html = fetch_page(url)
    if not html:
        return None

    markdown = html_to_markdown(html, source_url=url)

    if len(markdown) < 100:
        print("  Skipped: content too short (likely navigation page)")
        return None

    # Generate filename from URL
    slug = re.sub(r"[^a-z0-9]+", "_", url.split("//")[-1].lower())[:60]
    filename = f"scraped_{slug}.md"
    filepath = os.path.join(COMPLIANCE_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"  Saved: {filename} ({len(markdown)} chars)")
    return filepath


def scrape_known_sources():
    """Scrape all known ICAR advisory sources."""
    ensure_dirs()
    results = []

    for source in KNOWN_SOURCES:
        result = scrape_url(source["url"])
        if result:
            results.append(result)

    print(f"\nScraped {len(results)} sources successfully.")
    return results


def main():
    parser = argparse.ArgumentParser(description="ICAR Document Scraper for Kisan AI")
    parser.add_argument("--url", type=str, help="Scrape a specific URL")
    parser.add_argument("--all", action="store_true", help="Scrape all known ICAR sources")
    parser.add_argument("--list", action="store_true", help="List known sources")

    args = parser.parse_args()

    if args.list:
        print("Known ICAR sources:")
        for s in KNOWN_SOURCES:
            print(f"  - {s['description']}: {s['url']}")
        return

    if args.url:
        scrape_url(args.url)
        print("\nRun `uv run python -m agri_agent_backend.ingest` to re-ingest into ChromaDB.")
        return

    if args.all:
        scrape_known_sources()
        print("\nRun `uv run python -m agri_agent_backend.ingest` to re-ingest into ChromaDB.")
        return

    # Default: show usage
    parser.print_help()
    print("\nTip: Use --url <URL> to scrape a specific ICAR advisory page.")


if __name__ == "__main__":
    main()
