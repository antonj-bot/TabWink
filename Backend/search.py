import json

with open(
    "documents.json",
    "r",
    encoding="utf-8"
) as f:

    DOCUMENTS = json.load(f)


def search_documents(query):

    query_words = query.lower().split()

    results = []

    for doc in DOCUMENTS:

        score = 0

        text = doc["text"].lower()

        for word in query_words:

            if word in text:
                score += 1

        if score > 0:

            results.append(
                {
                    **doc,
                    "score": score
                }
            )

    results.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    return results[:5]