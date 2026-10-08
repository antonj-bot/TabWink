from fastapi import FastAPI
from search import search_documents
from ai import ask_ai

app = FastAPI()


@app.get("/search")
def search(q: str):

    results = search_documents(q)

    return {
        "count": len(results),
        "results": results
    }

@app.get("/ask")
def ask(question: str):

    results = search_documents(question)

    if not results:
        return {
            "answer": "I could not find anything in the SOPs."
        }

    context = results[0]["text"]
    print("TOP RESULT:", results[0]["file"])

    answer = ask_ai(
        question,
        context
    )

    return {
        "answer": answer,
        "source": results[0]["file"],
        "page": results[0]["page"]
    }


