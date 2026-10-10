import json
import re
import sys
from pathlib import Path


INDEX_PATH = Path(__file__).with_name("documents.json")
if getattr(sys, "frozen", False):
    INDEX_PATH = Path(sys._MEIPASS) / "documents.json"

with INDEX_PATH.open("r", encoding="utf-8") as index_file:
    DOCUMENTS = json.load(index_file)

STOP_WORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "can",
    "do", "does", "for", "from", "how", "i", "in", "is", "it", "of",
    "information", "key", "keyed", "keying", "name", "names", "on", "or",
    "process", "rule", "rules", "say", "section", "should", "sop", "sops",
    "that", "the", "this", "to", "was", "what", "when", "where", "which",
    "who", "why", "with", "you", "your"
}
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
INSTRUCTION_WORDS = {"check", "follow", "refer", "required", "use"}


def _normalize_token(token):
    if len(token) > 4 and token.endswith("s"):
        return token[:-1]
    return token


def _query_terms(query):
    return {
        _normalize_token(token)
        for token in TOKEN_PATTERN.findall(query.lower())
        if token not in STOP_WORDS
    }


def search_documents(query):
    query_terms = _query_terms(query)
    if not query_terms:
        return []

    results = []
    for document in DOCUMENTS:
        text_terms = {
            _normalize_token(token)
            for token in TOKEN_PATTERN.findall(document["text"].lower())
        }
        title_terms = {
            _normalize_token(token)
            for token in TOKEN_PATTERN.findall(
                f"{document['file']} {document.get('page_title', '')}".lower()
            )
        }
        score = len(query_terms & text_terms)
        score += 4 * len(query_terms & title_terms)
        matched_terms = query_terms & (text_terms | title_terms)
        if len(matched_terms) >= min(2, len(query_terms)):
            results.append({**document, "score": score})

    results.sort(key=lambda result: result["score"], reverse=True)
    return results[:10]


def _rank_passages(document, query_terms):
    lines = [line.strip() for line in document["text"].splitlines() if line.strip()]
    candidates = []
    for start in range(len(lines)):
        passage_lines = lines[start:start + 7]
        passage = " ".join(passage_lines)
        passage_terms = {
            _normalize_token(token)
            for token in TOKEN_PATTERN.findall(passage.lower())
        }
        matched_terms = query_terms & passage_terms
        if matched_terms:
            instruction_terms = passage_terms & INSTRUCTION_WORDS
            candidates.append((len(matched_terms) * 10 + len(instruction_terms), start, passage))

    candidates.sort(key=lambda candidate: (-candidate[0], candidate[1]))
    if not candidates:
        return []
    return [candidates[0][2][:700].rstrip()]


def answer_question(question):
    results = search_documents(question)
    if not results:
        return {"answer": "I could not find that information in the SOPs."}

    query_terms = _query_terms(question)
    matches = []
    for document in results:
        passages = _rank_passages(document, query_terms)
        if passages:
            title = document.get("page_title", "").lower()
            title_bonus = 3 if "keying rules" in title else 0
            matches.append((document["score"] + title_bonus, document, passages[0]))
    if not matches:
        return {"answer": "I could not find that information in the SOPs."}

    _, best_document, passage = max(matches, key=lambda match: match[0])

    return {
        "answer": passage,
        "source": best_document["file"],
        "page": best_document["page"],
        "page_title": best_document.get("page_title")
    }




