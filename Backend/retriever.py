import re
from loader import split_into_chunks
from states import detect_state

GENERAL = "GENERAL SOP"

STOP_WORDS = {"what", "is", "the", "of", "in", "a", "an", "for", "to",
              "does", "do", "mean", "meaning", "how", "and", "on", "i"}


def get_words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def find_context(question, documents, top_k=3):
    q = question.lower()

    # 1. State file + GENERAL SOP when a state is named
    state = detect_state(question)
    if state:
        state_docs = [d for d in documents if detect_state(d["source"]) == state]
        if not state_docs:
            return "", []   # no SOP for that state
        general = [d for d in documents if d["source"] == GENERAL]
        docs = state_docs + general
    else:
        docs = documents

    # 2. Keep only the words that matter
    q_words = set(get_words(question)) - STOP_WORDS

    # 3. Score every chunk by how many question words it contains
    scored = []
    for doc in docs:
        for chunk in split_into_chunks(doc["text"]):
            score = len(q_words & set(get_words(chunk)))
            if score > 0:
                bonus = 0.5 if doc["source"] != GENERAL else 0
                scored.append((score + bonus, doc["source"], chunk))

    # 4. Keep the best few chunks
    scored.sort(key=lambda item: item[0], reverse=True)
    top = scored[:top_k]

    context = "\n\n".join(f"[Source: {src}]\n{chunk}" for _, src, chunk in top)
    sources = list(dict.fromkeys(src for _, src, _ in top))
    return context, sources