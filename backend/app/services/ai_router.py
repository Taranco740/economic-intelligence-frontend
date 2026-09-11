from __future__ import annotations

import json
import urllib.request

from openai import OpenAI

from app.core.config import get_settings


class AIRouter:
    """Internal AI orchestration for Gamur.

    Users never choose a provider. Gamur selects the best available model for
    each product capability and silently falls back when a provider is down,
    out of quota, or not configured.
    """

    # Product capability -> preferred provider order.
    # This is deliberately internal; it is not a user-facing setting.
    ROUTING = {
        "analyze": ["gemini", "mistral", "openai", "huggingface", "cohere"],
        "visualize": ["gemini", "mistral", "openai", "huggingface", "cohere"],
        "dashboard": ["gemini", "mistral", "openai", "huggingface", "cohere"],
        "report": ["gemini", "cohere", "mistral", "openai", "huggingface"],
        "forecast": ["mistral", "gemini", "openai", "huggingface", "cohere"],
        "question": ["gemini", "mistral", "cohere", "openai", "huggingface"],
    }

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

    def _provider_order(self, task: str) -> list[str]:
        # The routing table is owned by Gamur. Environment variables may only
        # be used for operational overrides; there is no user-facing selector.
        return self.ROUTING.get(task, self.ROUTING["analyze"])

    def complete(self, task, messages):
        failures = []

        for provider in self._provider_order(task):
            try:
                if provider == "gemini" and self.s.gemini_api_key:
                    return self._gemini(
                        self.s.gemini_api_key.get_secret_value(),
                        self.s.gemini_model,
                        messages,
                    ), provider, failures

                if provider == "mistral" and self.s.mistral_api_key:
                    return self._openai_compatible(
                        self.s.mistral_api_key.get_secret_value(),
                        "https://api.mistral.ai/v1",
                        self.s.mistral_model,
                        messages,
                    ), provider, failures

                if provider == "openai" and self.s.openai_api_key:
                    return self._openai_compatible(
                        self.s.openai_api_key.get_secret_value(),
                        "https://api.openai.com/v1",
                        self.s.openai_model,
                        messages,
                    ), provider, failures

                if provider == "huggingface" and self.s.hf_token:
                    return self._openai_compatible(
                        self.s.hf_token.get_secret_value(),
                        "https://router.huggingface.co/v1/",
                        self.s.hf_model,
                        messages,
                    ), provider, failures

                if provider == "cohere" and self.s.cohere_api_key:
                    return self._cohere(
                        self.s.cohere_api_key.get_secret_value(),
                        self.s.cohere_model,
                        messages,
                    ), provider, failures
            except Exception as exc:
                failures.append(f"{provider}: {type(exc).__name__}")

        raise RuntimeError("No configured AI provider succeeded: " + "; ".join(failures))
