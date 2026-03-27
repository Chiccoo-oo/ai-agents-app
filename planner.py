from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

def create_plan(user_query):
    prompt = f"""
    Break the following task into clear numbered steps:

    Task: {user_query}

    Only return steps in order.
    """

    response = client.chat.completions.create(
        model="openai/gpt-3.5-turbo",   # ✅ FREE model
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content





# SREAMLIT
# from llm import call_llm
# import json

# def create_plan(user_query):
#     prompt = f"""
#     Break the task into steps in JSON format.

#     Task: {user_query}

#     Output format:
#     {{
#         "steps": [
#             "step 1",
#             "step 2",
#             "step 3"
#         ]
#     }}
#     """

#     response = call_llm(prompt)

#     try:
#         return json.loads(response)
#     except:
#         return {"steps": [response]}