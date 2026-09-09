from io import BytesIO

import pytest
from fastapi import HTTPException
from fastapi import UploadFile

from app.api.datasets import _MAX_FILE_SIZE, _read_upload, _validate_upload


def test_validate_upload_accepts_csv_and_xlsx() -> None:
    assert _validate_upload("economic.csv") == ".csv"
    assert _validate_upload("economic.XLSX") == ".xlsx"


@pytest.mark.parametrize("filename", ["data.json", "data.pdf", "data", "data.csv.exe"])
def test_validate_upload_rejects_unsupported_types(filename: str) -> None:
    with pytest.raises(HTTPException) as exc:
        _validate_upload(filename)
    assert exc.value.status_code == 400


def test_read_upload_rejects_empty_file() -> None:
    upload = UploadFile(filename="empty.csv", file=BytesIO(b""))
    with pytest.raises(HTTPException) as exc:
        _read_upload(upload, ".csv")
    assert exc.value.status_code == 400


def test_read_upload_enforces_100mb_limit() -> None:
    upload = UploadFile(filename="large.csv", file=BytesIO(b"x" * (_MAX_FILE_SIZE + 1)))
    with pytest.raises(HTTPException) as exc:
        _read_upload(upload, ".csv")
    assert exc.value.status_code == 413


def test_read_upload_returns_bytes() -> None:
    payload = b"date,value\n2026-01-01,10\n"
    upload = UploadFile(filename="economic.csv", file=BytesIO(payload))
    assert _read_upload(upload, ".csv") == payload
