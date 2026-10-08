from io import BytesIO
import re

import pytesseract
import requests
from fastapi import FastAPI
from fastapi import File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from search import search_documents
from ai import ask_ai

app = FastAPI()

VIN_PATTERN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
OCR_CORRECTIONS = {
    "O": "0",
    "I": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "Q": "0"
}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024


def is_valid_vin(vin: str) -> bool:
    return bool(VIN_PATTERN.fullmatch(vin.upper()))


def decode_vin_data(vin: str):
    url = (
        "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/"
        f"{vin}?format=json"
    )

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        result = response.json()["Results"][0]
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="The NHTSA VIN decoding service is unavailable."
        ) from exc

    if not result.get("Make") or not result.get("Model"):
        return None

    return {
        "vin": vin,
        "year": result.get("ModelYear"),
        "make": result["Make"],
        "model": result["Model"]
    }


def generate_candidates(vin: str):
    candidates = []

    for incorrect, corrected in OCR_CORRECTIONS.items():
        if incorrect in vin:
            candidate = vin.replace(incorrect, corrected)
            if is_valid_vin(candidate) and candidate not in candidates:
                candidates.append(candidate)

    return candidates


def try_candidates(candidates):
    for candidate in candidates:
        vehicle = decode_vin_data(candidate)
        if vehicle:
            return {
                "suggested_vin": vehicle["vin"],
                "year": vehicle["year"],
                "make": vehicle["make"],
                "model": vehicle["model"]
            }

    return None


def find_possible_vins(text: str):
    possible_vins = []

    for line in text.upper().splitlines():
        cleaned = re.sub(r"[^A-Z0-9]", "", line)
        if not 17 <= len(cleaned) <= 40:
            continue

        for start in range(len(cleaned) - 16):
            candidate = cleaned[start:start + 17]
            if sum(character in "OIQ" for character in candidate) > 2:
                continue
            if candidate not in possible_vins:
                possible_vins.append(candidate)

    return possible_vins


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


@app.get("/vin/{vin}")
def decode_vin(vin: str):
    vin = vin.strip().upper()

    if not is_valid_vin(vin):
        return {"error": "Invalid VIN"}

    vehicle = decode_vin_data(vin)
    if vehicle:
        return vehicle

    return {
        "error": "VIN could not be decoded",
        "did_you_mean": try_candidates(generate_candidates(vin))
    }


@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):
    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller.")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")

    try:
        image = Image.open(BytesIO(contents)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Upload a valid image file.") from exc

    if image.width * image.height > 30_000_000:
        raise HTTPException(status_code=413, detail="Image dimensions are too large.")

    try:
        ocr_text = pytesseract.image_to_string(image, config="--psm 6")
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Tesseract OCR is not installed on the backend."
        ) from exc

    possible_vins = find_possible_vins(ocr_text)
    if not possible_vins:
        return {
            "ocr_text": ocr_text,
            "detected_vin": None,
            "decoded": False,
            "vehicle": None,
            "did_you_mean": None
        }

    detected_vin = possible_vins[0]
    for candidate in possible_vins[:3]:
        if is_valid_vin(candidate):
            vehicle = decode_vin_data(candidate)
            if vehicle:
                return {
                    "ocr_text": ocr_text,
                    "detected_vin": detected_vin,
                    "decoded": True,
                    "vehicle": vehicle,
                    "did_you_mean": None
                }

        suggestion = try_candidates(generate_candidates(candidate))
        if suggestion:
            return {
                "ocr_text": ocr_text,
                "detected_vin": detected_vin,
                "decoded": False,
                "vehicle": None,
                "did_you_mean": suggestion
            }

    return {
        "ocr_text": ocr_text,
        "detected_vin": detected_vin if is_valid_vin(detected_vin) else None,
        "decoded": False,
        "vehicle": None,
        "did_you_mean": None
    }


