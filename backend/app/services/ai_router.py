from __future__ import annotations

import json
import urllib.request

from openai import OpenAI

from app.core.config import get_settings


class AIRouter:
    def __init__(self):
        self.s = get_settings()

    def _openai_compatible(self, api_key, base_url, model, messages):
        return (
            OpenAI(api_key=api_key, base_url=base_url)
            .chat.completions.create(model=model, messages=messages)
            .choices[0]
            .message.content
            or ""
        )

    def _gemini(self, key, model, messages):
        prompt = "\n\n".join(f"{m['role']}: {m['content']}" for m in messages)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()
        req = urllib.request.Request(
            url, body, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)["candidates"][0]["content"]["parts"][0]["text"]

    def _cohere(self, key, model, messages):
        body = json.dumps({"model": model, "messages": messages}).encode()
        req = urllib.request.Request(
            "https://api.cohere.com/v2/chat",
            body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)["message"]["content"][0]["text"]

    def complete(self, task, messages):
        order = getattr(self.s, f"ai_{task}_order", "") or self.s.ai_default_order
        providers = [p.strip().lower() for p in order.split(",") if p.strip()]
        failures = []

        for p in providers:
            try:
                if p == "openai" and self.s.openai_api_key:
                    return self._openai_compatible(
                        self.s.openai_api_key.get_secret_value(),
                        "https://api.openai.com/v1",
                        self.s.openai_model,
                        messages,
                    ), p, failures

                if p == "mistral" and self.s.mistral_api_key:
                    return self._openai_compatible(
                        self.s.mistral_api_key.get_secret_value(),
                        "https://api.mistral.ai/v1",
                        self.s.mistral_model,
                        messages,
                    ), p, failures

                # Ollama local installs do not require an API key.
                if p == "ollama":
                    return self._openai_compatible(
                        self.s.ollama_api_key.get_secret_value() if self.s.ollama_api_key else "ollama",
                        self.s.ollama_base_url,
                        self.s.ollama_model,
                        messages,
                    ), p, failures

                if p == "huggingface" and self.s.hf_token:
                    return self._openai_compatible(
                        self.s.hf_token.get_secret_value(),
                        "https://router.huggingface.co/v1/",
                        self.s.hf_model,
                        messages,
                    ), p, failures

                if p == "gemini" and self.s.gemini_api_key:
                    return self._gemini(
                        self.s.gemini_api_key.get_secret_value(), self.s.gemini_model, messages
                    ), p, failures

                if p == "cohere" and self.s.cohere_api_key:
                    return self._cohere(
                        self.s.cohere_api_key.get_secret_value(), self.s.cohere_model, messages
                    ), p, failures
            except Exception as exc:
                failures.append(f"{p}: {type(exc).__name__}")

        raise RuntimeError("No configured AI provider succeeded: " + "; ".join(failures))
