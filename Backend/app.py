from io import BytesIO
from itertools import combinations
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
VIN_CHARACTERS = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ"
VIN_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2)
VIN_TRANSLITERATION = {
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7,
    "H": 8, "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7,
    "R": 9, "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7,
    "Y": 8, "Z": 9
}
OCR_CORRECTIONS = {
    "O": "0",
    "I": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "Q": "0"
}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_VIN_CANDIDATES = 50
MAX_VIN_MATCHES = 10


def is_valid_vin(vin: str) -> bool:
    vin = vin.upper()
    return (
        bool(VIN_PATTERN.fullmatch(vin))
        and calculate_vin_check_digit(vin) == vin[8]
    )


def calculate_vin_check_digit(vin: str):
    if len(vin) != 17:
        return None

    total = 0
    for position, character in enumerate(vin):
        if position == 8:
            continue
        value = int(character) if character.isdigit() else VIN_TRANSLITERATION.get(character)
        if value is None:
            return None
        total += value * VIN_WEIGHTS[position]

    remainder = total % 11
    return "X" if remainder == 10 else str(remainder)


def decode_vin_data(vin: str, timeout: float = 10):
    url = (
        "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/"
        f"{vin}?format=json"
    )

    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        result = response.json()["Results"][0]
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="The NHTSA VIN decoding service is unavailable."
        ) from exc

    if (
        str(result.get("ErrorCode", "")) != "0"
        or not result.get("Make")
        or not result.get("Model")
    ):
        return None

    return {
        "vin": vin,
        "year": result.get("ModelYear"),
        "make": result["Make"],
        "model": result["Model"]
    }


def generate_candidates(vin: str):
    normalized = re.sub(r"[^A-Z0-9]", "", vin.upper())
    if not re.fullmatch(r"[A-Z0-9]{17}", normalized):
        return []

    candidates = []
    position_candidates = {position: [] for position in range(17)}
    seen = {normalized}

    def add_candidate(candidate: str):
        if is_valid_vin(candidate) and candidate not in seen:
            seen.add(candidate)
            candidates.append(candidate)

    corrections = []
    for position, character in enumerate(normalized):
        corrected = OCR_CORRECTIONS.get(character)
        if corrected:
            candidate = normalized[:position] + corrected + normalized[position + 1:]
            add_candidate(candidate)
            corrections.append((position, corrected))

    check_digit = calculate_vin_check_digit(normalized)
    if check_digit:
        add_candidate(normalized[:8] + check_digit + normalized[9:])

    for position in range(17):
        if position == 8:
            continue
        for replacement in VIN_CHARACTERS:
            if replacement == normalized[position]:
                continue
            candidate = normalized[:position] + replacement + normalized[position + 1:]
            if calculate_vin_check_digit(candidate) == candidate[8]:
                if is_valid_vin(candidate) and candidate not in seen:
                    seen.add(candidate)
                    position_candidates[position].append(candidate)

    for candidate_index in range(max(map(len, position_candidates.values()))):
        for position in range(17):
            position_options = position_candidates[position]
            if candidate_index < len(position_options):
                candidates.append(position_options[candidate_index])

    for (first_position, first_replacement), (second_position, second_replacement) in combinations(corrections, 2):
        candidate = list(normalized)
        candidate[first_position] = first_replacement
        candidate[second_position] = second_replacement
        add_candidate("".join(candidate))

    return candidates[:MAX_VIN_CANDIDATES]


def try_candidates(candidates):
    candidates = candidates[:MAX_VIN_CANDIDATES]
    if not candidates:
        return []

    try:
        response = requests.post(
            "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/",
            data={"data": ";".join(candidates) + ";", "format": "json"},
            timeout=10
        )
        response.raise_for_status()
        results = response.json()["Results"]
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="The NHTSA VIN decoding service is unavailable."
        ) from exc

    matches = []
    seen_vins = set()
    for result in results:
        if (
            str(result.get("ErrorCode", "")) == "0"
            and result.get("Make")
            and result.get("Model")
        ):
            candidate = {
                "suggested_vin": result["VIN"],
                "year": result.get("ModelYear"),
                "make": result["Make"],
                "model": result["Model"]
            }
            if candidate["suggested_vin"] not in seen_vins:
                matches.append(candidate)
                seen_vins.add(candidate["suggested_vin"])
            if len(matches) == MAX_VIN_MATCHES:
                break

    return matches


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

    if is_valid_vin(vin):
        vehicle = decode_vin_data(vin)
        if vehicle:
            return vehicle

    suggestions = try_candidates(generate_candidates(vin))

    return {
        "error": "VIN could not be decoded" if is_valid_vin(vin) else "Invalid VIN",
        "did_you_mean": suggestions[0] if suggestions else None,
        "closest_matches": suggestions
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
            "did_you_mean": None,
            "closest_matches": []
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

        suggestions = try_candidates(generate_candidates(candidate))
        if suggestions:
            return {
                "ocr_text": ocr_text,
                "detected_vin": detected_vin,
                "decoded": False,
                "vehicle": None,
            "did_you_mean": suggestions[0],
            "closest_matches": suggestions
            }

    return {
        "ocr_text": ocr_text,
        "detected_vin": detected_vin if is_valid_vin(detected_vin) else None,
        "decoded": False,
        "vehicle": None,
        "did_you_mean": None,
        "closest_matches": []
    }


