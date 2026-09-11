from __future__ import annotations

from io import BytesIO
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from supabase import Client

from app.api.deps import get_current_user_id, get_supabase_client
from app.api.intelligence import _clean, _load

router = APIRouter(prefix="/projects/{project_id}/intelligence", tags=["exports"])


@router.get("/cleaned/{dataset_id}")
def download_cleaned_dataset(
    project_id: UUID,
    dataset_id: UUID,
    format: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_client),
):
    df = _load(project_id, dataset_id, user_id, supabase)
    cleaned, _ = _clean(df)
    safe_name = "gamur-cleaned-dataset"

    if format == "csv":
        payload = cleaned.to_csv(index=False).encode("utf-8-sig")
        return StreamingResponse(
            BytesIO(payload),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
        )

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        cleaned.to_excel(writer, index=False, sheet_name="Cleaned Data")
        ws = writer.book["Cleaned Data"]
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for cell in ws[1]:
            cell.font = cell.font.copy(bold=True, color="FFFFFF")
            cell.fill = cell.fill.copy(fill_type="solid", fgColor="173A5E")
        for column_cells in ws.columns:
            letter = column_cells[0].column_letter
            width = min(40, max(12, max(len(str(c.value or "")) for c in column_cells[:100]) + 2))
            ws.column_dimensions[letter].width = width

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'},
    )
