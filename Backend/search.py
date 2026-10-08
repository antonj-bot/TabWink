import json

with open(
    "documents.json",
    "r",
    encoding="utf-8"
) as f:

    DOCUMENTS = json.load(f)

STOP_WORDS = {
    "how",
    "is",
    "the",
    "a",
    "an",
    "in",
    "of",
    "what",
    "where",
    "when",
    "why",
    "coded"
}

def search_documents(query):

    query_words = [
        w.lower().replace("?", "")
        for w in query.split()
        if w.lower() not in STOP_WORDS
    ]
    print("QUERY WORDS:", query_words)
    results = []

    for doc in DOCUMENTS:

        score = 0

        text = doc["text"].lower()
        filename = doc["file"].lower()

        for word in query_words:

            if word in text:
                score += 1

            if word in filename:
                score += 10

        if score > 0:

            results.append({
                **doc,
                "score": score
            })

    results.sort(
        key=lambda x: x["score"],
        reverse=True
    )
    
    print("SEARCH RESULTS:")
    for r in results:
        print(r["file"], r["score"])
    
    return results[:5]




