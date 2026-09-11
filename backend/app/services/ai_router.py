from __future__ import annotations

import json
import logging
import urllib.request

from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class AIRouter:
    """Internal AI orchestration for Gamur.

    Users never choose a provider. Gamur selects the best available model for
    each capability and silently falls back when a provider is unavailable,
    rate-limited, out of quota, or not configured.
    """

    ROUTING = {
        "analyze": ["gemini", "xai", "mistral", "cohere", "huggingface", "openai"],
        "visualize": ["gemini", "xai", "mistral", "cohere", "huggingface", "openai"],
        "dashboard": ["gemini", "xai", "mistral", "cohere", "huggingface", "openai"],
        "report": ["gemini", "xai", "cohere", "mistral", "huggingface", "openai"],
        "forecast": ["mistral", "xai", "gemini", "cohere", "huggingface", "openai"],
        "question": ["gemini", "xai", "mistral", "cohere", "huggingface", "openai"],
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

    def _xai(self, key, model, messages):
        # xAI exposes an OpenAI-compatible Chat Completions API.
        return self._openai_compatible(
            key,
            "https://api.x.ai/v1",
            model,
            messages,
        )

    def _provider_order(self, task: str) -> list[str]:
        configured = {
            "default": self.s.ai_default_order,
            "analyze": self.s.ai_analyze_order,
            "visualize": self.s.ai_visualize_order,
            "dashboard": self.s.ai_visualize_order,
            "forecast": self.s.ai_forecast_order,
            "report": self.s.ai_report_order,
            "question": self.s.ai_question_order,
        }.get(task)
        if configured:
            order = [p.strip().lower() for p in configured.split(",") if p.strip()]
            if order:
                return order
        return self.ROUTING.get(task, self.ROUTING["analyze"])

    def complete(self, task, messages):
        failures = []

        for provider in self._provider_order(task):
            try:
                if provider == "gemini" and self.s.gemini_api_key:
                    text = self._gemini(
                        self.s.gemini_api_key.get_secret_value(),
                        self.s.gemini_model,
                        messages,
                    )
                elif provider == "xai" and self.s.xai_api_key:
                    text = self._xai(
                        self.s.xai_api_key.get_secret_value(),
                        self.s.xai_model,
                        messages,
                    )
                elif provider == "mistral" and self.s.mistral_api_key:
                    text = self._openai_compatible(
                        self.s.mistral_api_key.get_secret_value(),
                        "https://api.mistral.ai/v1",
                        self.s.mistral_model,
                        messages,
                    )
                elif provider == "openai" and self.s.openai_api_key:
                    text = self._openai_compatible(
                        self.s.openai_api_key.get_secret_value(),
                        "https://api.openai.com/v1",
                        self.s.openai_model,
                        messages,
                    )
                elif provider == "huggingface" and self.s.hf_token:
                    text = self._openai_compatible(
                        self.s.hf_token.get_secret_value(),
                        "https://router.huggingface.co/v1/",
                        self.s.hf_model,
                        messages,
                    )
                elif provider == "cohere" and self.s.cohere_api_key:
                    text = self._cohere(
                        self.s.cohere_api_key.get_secret_value(),
                        self.s.cohere_model,
                        messages,
                    )
                else:
                    continue

                if text.strip():
                    logger.info("AI provider succeeded: provider=%s task=%s", provider, task)
                    return text, provider, failures
                failures.append(f"{provider}: empty_response")
            except Exception as exc:
                # Never log API keys or request bodies. The provider name and
                # exception class are enough to diagnose fallback behavior.
                failures.append(f"{provider}: {type(exc).__name__}")
                logger.warning("AI provider failed: provider=%s task=%s error=%s", provider, task, type(exc).__name__)

        raise RuntimeError("No configured AI provider succeeded: " + "; ".join(failures))
