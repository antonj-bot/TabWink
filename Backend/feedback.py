import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(
    prefix="/feedback",
    tags=["SOP Feedback"],
)

DATABASE_PATH = Path(__file__).resolve().parent / "tabwink_feedback.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def create_feedback_table():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                answer_id TEXT NOT NULL,
                question TEXT NOT NULL,
                response TEXT NOT NULL,

                state TEXT,
                sop_name TEXT NOT NULL,
                sop_url TEXT NOT NULL,

                feedback_type TEXT NOT NULL,
                user_note TEXT,

                status TEXT NOT NULL DEFAULT 'open',

                sme_comment TEXT,

                resolution_note TEXT,
                resolved_by TEXT,
                resolved_at TEXT,

                created_at TEXT NOT NULL
            )
            """
        )

        connection.commit()


class FeedbackCreate(BaseModel):
    answer_id: str
    question: str
    response: str

    state: str | None = None
    sop_name: str
    sop_url: str

    feedback_type: str
    user_note: str | None = None

    status: str = "open"


class SmeCommentRequest(BaseModel):
    comment: str


class ResolveFeedbackRequest(BaseModel):
    resolution_note: str
    resolved_by: str


class SourceUpdateRequest(BaseModel):
    sop_name: str
    sop_url: str


def row_to_dict(row):
    return dict(row)


@router.post("")
def create_feedback(payload: FeedbackCreate):
    valid_feedback_types = {
        "effective",
        "confusing",
        "outdated",
    }

    if payload.feedback_type not in valid_feedback_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid feedback type.",
        )

    status = (
        "effective"
        if payload.feedback_type == "effective"
        else "open"
    )

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO feedback (
                answer_id,
                question,
                response,
                state,
                sop_name,
                sop_url,
                feedback_type,
                user_note,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.answer_id,
                payload.question,
                payload.response,
                payload.state,
                payload.sop_name,
                payload.sop_url,
                payload.feedback_type,
                payload.user_note,
                status,
                created_at,
            ),
        )

        connection.commit()

        feedback_id = cursor.lastrowid

        row = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    return row_to_dict(row)


@router.get("")
def get_all_feedback():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM feedback
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.get("/open")
def get_open_feedback():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE status = 'open'
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.get("/resolved")
def get_resolved_feedback():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE status = 'resolved'
            ORDER BY resolved_at DESC
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.patch("/{feedback_id}/comment")
def add_sme_comment(
    feedback_id: int,
    payload: SmeCommentRequest,
):
    comment = payload.comment.strip()

    if not comment:
        raise HTTPException(
            status_code=400,
            detail="SME comment cannot be empty.",
        )

    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Feedback record not found.",
            )

        connection.execute(
            """
            UPDATE feedback
            SET sme_comment = ?
            WHERE id = ?
            """,
            (
                comment,
                feedback_id,
            ),
        )

        connection.commit()

        row = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    return row_to_dict(row)


@router.patch("/{feedback_id}/source")
def update_feedback_source(
    feedback_id: int,
    payload: SourceUpdateRequest,
):
    sop_name = payload.sop_name.strip()
    sop_url = payload.sop_url.strip()

    if not sop_name or not sop_url:
        raise HTTPException(
            status_code=400,
            detail="SOP name and URL are required.",
        )

    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Feedback record not found.",
            )

        connection.execute(
            """
            UPDATE feedback
            SET
                sop_name = ?,
                sop_url = ?
            WHERE id = ?
            """,
            (
                sop_name,
                sop_url,
                feedback_id,
            ),
        )

        connection.commit()

        row = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    return row_to_dict(row)


@router.patch("/{feedback_id}/resolve")
def resolve_feedback(
    feedback_id: int,
    payload: ResolveFeedbackRequest,
):
    resolution_note = payload.resolution_note.strip()
    resolved_by = payload.resolved_by.strip()

    if not resolution_note:
        raise HTTPException(
            status_code=400,
            detail="Resolution note is required.",
        )

    if not resolved_by:
        raise HTTPException(
            status_code=400,
            detail="Resolver name is required.",
        )

    resolved_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Feedback record not found.",
            )

        connection.execute(
            """
            UPDATE feedback
            SET
                status = 'resolved',
                resolution_note = ?,
                resolved_by = ?,
                resolved_at = ?
            WHERE id = ?
            """,
            (
                resolution_note,
                resolved_by,
                resolved_at,
                feedback_id,
            ),
        )

        connection.commit()

        row = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    return row_to_dict(row)


@router.patch("/{feedback_id}/reopen")
def reopen_feedback(feedback_id: int):
    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Feedback record not found.",
            )

        connection.execute(
            """
            UPDATE feedback
            SET
                status = 'open',
                resolution_note = NULL,
                resolved_by = NULL,
                resolved_at = NULL
            WHERE id = ?
            """,
            (feedback_id,),
        )

        connection.commit()

        row = connection.execute(
            """
            SELECT *
            FROM feedback
            WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    return row_to_dict(row)