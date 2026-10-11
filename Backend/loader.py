from pathlib import Path
from docx import Document
from docx.table import Table

DATA_DIR = Path(__file__).parent / "data"


def read_docx(path):
    doc = Document(path)
    lines = []
    for block in doc.iter_inner_content():
        if isinstance(block, Table):
            for row in block.rows:
                cells = [cell.text.strip() for cell in row.cells]
                lines.append(" | ".join(cells))
        else:
            text = block.text.strip()
            if text:
                lines.append(text)
    return "\n".join(lines)

SKIP = {"Version and Change Log"}

def load_documents():
    documents = []
    for path in sorted(DATA_DIR.glob("*.docx")):
        if path.name.startswith("~$") or path.stem in SKIP:
            continue
        text = read_docx(path)
        if text.strip():
            documents.append({"source": path.stem, "text": text})
    return documents


def split_into_chunks(text, max_chars=1500):
    chunks = []
    current = ""
    for line in text.split("\n"):
        if current and len(current) + len(line) > max_chars:
            chunks.append(current)
            current = ""
        current += line + "\n"
    if current:
        chunks.append(current)
    return chunks