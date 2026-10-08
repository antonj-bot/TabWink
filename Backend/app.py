from fastapi import FastAPI
from search import search_documents

app = FastAPI()


@app.get("/search")
def search(q: str):

    results = search_documents(q)

    return {
        "count": len(results),
        "results": results
    }