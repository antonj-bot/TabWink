from pypdf import PdfReader
import json
import os

DATA_FOLDER = "data"

documents = []

for filename in os.listdir(DATA_FOLDER):

    if filename.endswith(".pdf"):

        reader = PdfReader(
            os.path.join(DATA_FOLDER, filename)
        )

        for page_num, page in enumerate(reader.pages):

            text = page.extract_text()

            if text:

                documents.append(
                    {
                        "file": filename,
                        "page": page_num + 1,
                        "text": text
                    }
                )

with open(
    "documents.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        documents,
        f,
        indent=2
    )

print(f"Indexed {len(documents)} pages")