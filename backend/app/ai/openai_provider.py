from openai import OpenAI
from app.ai.providers import AIProvider, AIRequest
class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str) -> None: self.client=OpenAI(api_key=api_key)
    def generate(self, request: AIRequest) -> str:
        response=self.client.responses.create(model=request.model,instructions=request.system,input=request.user)
        return response.output_text
