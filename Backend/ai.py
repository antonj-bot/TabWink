import os
import boto3
from dotenv import load_dotenv

load_dotenv()

print("TOKEN EXISTS:", bool(os.getenv("AWS_BEARER_TOKEN_BEDROCK")))
print("REGION:", os.getenv("AWS_DEFAULT_REGION"))


client = boto3.client(
    "bedrock-runtime",
    region_name=os.environ["AWS_DEFAULT_REGION"]
)


def build_prompt(question, context):

    return f"""
You are TabWInk, an SOP assistant.

Answer using ONLY the SOP information provided.

If the answer cannot be found in the SOP information, respond with:
"I could not find that information in the SOP."

When possible, provide a concise answer.

SOP INFORMATION:
{context}

QUESTION:
{question}
"""


def ask_ai(question, context):

    prompt = build_prompt(
        question,
        context
    )

    try:

        response = client.converse(
            modelId="us.anthropic.claude-sonnet-4-6",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            inferenceConfig={
                "maxTokens": 300
            }
        )

        return response["output"]["message"]["content"][0]["text"]

    except Exception as e:

        return f"Claude Error: {e}"