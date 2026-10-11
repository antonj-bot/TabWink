import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna")

# NEW: rules the model must follow on every question
INSTRUCTIONS = """You are TabWInk, an SOP assistant.

Rules:
- Answer ONLY using the SOP text provided. Never use outside knowledge or opinions.
- If the SOP text does not contain the answer, reply exactly: "I couldn't find that in the SOPs."
- Copy codes and values exactly as written in the SOP.
- Keep answers short and direct."""


def ask_ai(question, context):
    client = OpenAI()

    response = client.responses.create(
        model=MODEL,
        instructions=INSTRUCTIONS,   # NEW
        input=f"SOP:\n{context}\n\nQuestion: {question}"
    )

    return response.output_text

context = "Albert Einstein is the smartest person in the world"

print(ask_ai("who is the smartest person in the world?", context ))