import requests
from fastapi import FastAPI
import re
from fastapi import UploadFile, File
from PIL import Image
import easyocr
from pypdf import PdfReader

import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GEMINI_API_KEY")
)


app = FastAPI(
    title="SMEBOT"
)


@app.get("/")
def home():
    return {"message": "SMEBOT"}


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


def is_valid_vin(vin: str):

    pattern = r"^[A-HJ-NPR-Z0-9]{17}$"

    return bool(
        re.match(pattern, vin.upper())
    )


@app.get("/vin/{vin}")
def decode_vin(vin: str):
    
    vin = vin.upper()
    
    if not is_valid_vin(vin):
        return {
            "error": "Invalid VIN"
        }
        
    url = (
        f"https://vpic.nhtsa.dot.gov/api/"
        f"vehicles/DecodeVinValues/"
        f"{vin}?format=json"
    )

    response = requests.get(url)

    data = response.json()

    result = data["Results"][0]
  
    if not result.get("Make"):

        suggestions = generate_candidates(
            vin
        )

        match = try_candidates(
            suggestions
        )

        if match:

            return {
                "error": "VIN could not be decoded",
                "did_you_mean": match
            }

        return {
            "error": "VIN could not be decoded"
        }
    
    return {
        "vin": vin,
        "year": result["ModelYear"],
        "make": result["Make"],
        "model": result["Model"]
    }
    
    
reader = easyocr.Reader(["en"])

@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):

    contents = await file.read()

    with open("temp.jpg", "wb") as f:
        f.write(contents)

    result = reader.readtext(
        "temp.jpg",
        detail=0
    )

    possible_vins = find_possible_vins(result)

    suggestions = []

    for vin in possible_vins:

        candidates = generate_candidates(vin)

        match = try_candidates(candidates)

        if match:
            suggestions.append(match)

    detected_vin = None

    if possible_vins:
        detected_vin = possible_vins[0]

    suggestion = None

    if suggestions:
        suggestion = suggestions[0]

    return {
        "ocr_text": result,
        "detected_vin": detected_vin,
        "decoded": False,
        "did_you_mean": suggestion
    }
    
    
    
OCR_CORRECTIONS = {
    "O": "0",
    "I": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "Q": "0"
}

def generate_candidates(vin: str):

    candidates = []

    for bad, good in OCR_CORRECTIONS.items():

        if bad in vin:

            candidates.append(
                vin.replace(bad, good)
            )
            
    return candidates


def try_candidates(candidates):

    for candidate in candidates:

        url = (
            f"https://vpic.nhtsa.dot.gov/api/"
            f"vehicles/DecodeVinValues/"
            f"{candidate}?format=json"
        )

        response = requests.get(url)

        result = (
            response.json()["Results"][0]
        )

        if (
            result.get("Make")
            and result.get("Model")
        ):

            return {
                "suggested_vin": candidate,
                "make": result["Make"],
                "model": result["Model"],
                "year": result["ModelYear"]
            }

    return None

def find_possible_vins(texts):

    possible = []

    for text in texts:

        cleaned = (
            text.upper()
            .replace(" ", "")
            .strip()
        )

        if len(cleaned) >= 15:
            possible.append(cleaned)

    return possible



@app.get("/files")
def list_files():

    files = []

    for root, dirs, filenames in os.walk("knowledge"):

        for file in filenames:

            files.append(
                os.path.join(root, file)
            )

    return {
        "count": len(files),
        "files": files[:100]
    }

def load_document(path):

    with open(
        path,
        "r",
        encoding="utf-8",
        errors="ignore"
    ) as f:

        return f.read()

knowledge_base = []


def load_pdf_document(path):

    reader = PdfReader(path)

    text = ""

    for page in reader.pages:

        page_text = page.extract_text()

        if page_text:
            text += page_text + "\n"

    return text

def load_knowledge():

    knowledge_base.clear()

    for root, dirs, files in os.walk(
        "knowledge"
    ):

        for file in files:

            if not file.endswith(".pdf"):
                continue

            path = os.path.join(
                root,
                file
            )

            try:

                content = load_pdf_document(
                    path
                )

                knowledge_base.append(
                    {
                        "file": file,
                        "content": content
                    }
                )

            except Exception as e:

                print(
                    f"Failed to load: {file}"
                )
                
load_knowledge()

load_knowledge()


def search_documents(question):

    results = []

    query_words = (
        question.lower().split()
    )

    for doc in knowledge_base:

        content = (
            doc["content"].lower()
        )

        score = 0

        for word in query_words:

            if word in content:
                score += 1

        if score > 0:

            results.append(
                {
                    "file": doc["file"],
                    "score": score,
                    "content": doc["content"]
                }
            )

    results.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    return results[:3]


@app.get("/search")
def search(question: str):

    return search_documents(question)


@app.get("/ask")
def ask(question: str):

    results = search_documents(
        question
    )

    if not results:

        return {
            "answer":
            "I could not find anything relevant in the SOPs."
        }

    context = "\n\n".join(
        [
            doc["content"]
            for doc in results
        ]
    )

    prompt = f"""
Answer the user's question
using ONLY the SOP documentation.

If the answer cannot be found,
say you do not know.

Question:
{question}

Documentation:
{context}
"""

    response = client.responses.create(
        model="Gemini 3",
        input=prompt
    )

    return {
        "answer":
        response.output_text
    }
