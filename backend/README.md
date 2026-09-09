# Economic Intelligence Backend

Backend foundation for the Economic Intelligence Platform.

- Supabase: authentication, PostgreSQL, private storage
- FastAPI: API layer
- Python analytics: profiling, cleaning, analysis and forecasting
- OpenAI: AI provider abstraction

Required runtime variables are documented in `.env.example`. Real secrets stay server-side and out of source control.

## Local validation

```bash
pip install -e ".[dev]"
pytest
ruff check .
```

## Development

```bash
pip install -e .
uvicorn app.main:app --reload
```
