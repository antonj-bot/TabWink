import os
from dotenv import load_dotenv
from openai import OpenAI

USE_MOCK = True

MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna")


def ask_ai(question, context):
    if USE_MOCK:
        print("Nigga")
