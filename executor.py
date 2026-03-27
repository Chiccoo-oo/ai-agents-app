from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

def execute_step(step, context):
    prompt = f"""
    Execute the following step in detail:

    Step: {step}

    Context so far:
    {context}
    """

    response = client.chat.completions.create(
        model="openai/gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content



# streamlit
# from llm import call_llm

# def execute_step(step, context):
#     prompt = f"""
#     Execute this step clearly:

#     Step: {step}

#     Context:
#     {context}
#     """

#     return call_llm(prompt)