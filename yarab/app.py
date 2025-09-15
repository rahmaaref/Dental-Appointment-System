import os
import sqlite3
import datetime as dt
from functools import wraps
from urllib.parse import urlencode

from flask import Flask, request, jsonify, session, redirect, url_for, render_template, send_from_directory
from dotenv import load_dotenv


# Load environment variables
load_dotenv()


def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def get_conn():
    conn = sqlite3.connect(os.getenv("DB_PATH", "./dental_appointments.db"))
    conn.row_factory = dict_factory
    return conn


class CapacityError(Exception):
    def __init__(self, day_name: str, capacity: int, used: int):
        super().__init__(f"Capacity reached for {day_name}: {used}/{capacity}")
        self.day_name = day_name
        self.capacity = capacity
        self.used = used


WEEK = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def check_capacity(scheduled_date: str, conn: sqlite3.Connection):
    d = dt.date.fromisoformat(scheduled_date)
    day = WEEK[d.weekday()]
    cap = conn.execute(
        "SELECT capacity FROM daily_capacity WHERE day_name=?", (day,)
    ).fetchone()
    # Default capacity is 10 per day when not set in DB
    cap_val = (cap["capacity"] if cap else 10)
    used = conn.execute(
        "SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?",
        (scheduled_date,),
    ).fetchone()["c"]
    if cap_val and used >= cap_val:
        raise CapacityError(day, cap_val, used)


def make_ticket(scheduled_date: str, national_id: str, conn: sqlite3.Connection) -> int:
    ymd = scheduled_date.replace("-", "")
    cur = conn.execute(
        "SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?",
        (scheduled_date,),
    )
    seq = (cur.fetchone()["c"] or 0) + 1
    last4 = int(str(national_id)[-4:])
    return int(f"{ymd}{seq:03d}{last4:04d}")


def find_by_last4(last4: int, phone: str | None, date: str | None, conn: sqlite3.Connection):
    q = "SELECT * FROM appointments WHERE (ticket_number % 10000)=?"
    args: list[object] = [last4]
    if phone:
        q += " AND phone LIKE ?"
        args.append(f"%{phone}%")
    if date:
        q += " AND scheduled_date=?"
        args.append(date)
    q += " ORDER BY created_at DESC"
    return conn.execute(q, tuple(args)).fetchall()

def find_by_ticket(ticket: int, conn: sqlite3.Connection):
    return conn.execute("SELECT * FROM appointments WHERE ticket_number=? ORDER BY created_at DESC", (ticket,)).fetchall()


def envelope(ok: bool, data=None, error=None):
    return jsonify({"ok": ok, "data": data, "error": error})


def require_role(expected_role: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = session.get("role")
            if role != expected_role:
                return envelope(
                    False,
                    None,
                    {"code": "forbidden", "message": "Forbidden"},
                ), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def parse_sort(sort_param: str):
    allowed = {"created_at", "scheduled_date", "status", "name"}
    if not sort_param:
        return "created_at", "DESC"
    field, _, direction = sort_param.partition(":")
    if field not in allowed:
        field = "created_at"
    direction = direction.upper() if direction else "DESC"
    if direction not in {"ASC", "DESC"}:
        direction = "DESC"
    return field, direction


app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("FLASK_SECRET", "change-me")


@app.after_request
def add_cors_headers(resp):
    allowed = os.getenv("ALLOWED_ORIGINS")
    if allowed:
        resp.headers["Access-Control-Allow-Origin"] = allowed
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers[
            "Access-Control-Allow-Headers"
        ] = "Content-Type, X-Requested-With"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp


# Pages (patient-only app)
@app.get("/")
def root():
    return render_template("patient.html")


@app.get("/patient")
def patient_page():
    return render_template("patient.html")


@app.get("/uploads/<path:subpath>")
def serve_uploads(subpath: str):
    upload_root = os.path.join(os.getcwd(), "uploads")
    return send_from_directory(upload_root, subpath)


# Patient APIs (no auth required)
@app.get("/api/patient/appointments")
def api_patient_appointments():
    national_id = (request.args.get("national_id") or "").strip()
    ticket = (request.args.get("ticket") or "").strip() or None
    phone = (request.args.get("phone") or "").strip() or None
    date = (request.args.get("date") or "").strip() or None
    # Either ticket OR national_id, not both
    if ticket and national_id:
        return envelope(False, None, {"code": "bad_request", "message": "Provide either ticket or national_id, not both"}), 400
    if ticket:
        with get_conn() as conn:
            try:
                rows = find_by_ticket(int(ticket), conn)
            except ValueError:
                rows = []
    else:
        if not national_id or len(national_id) < 4:
            return envelope(False, None, {"code": "bad_request", "message": "national_id required unless ticket provided"}), 400
        last4 = int(str(national_id)[-4:])
        with get_conn() as conn:
            rows = find_by_last4(last4, phone, date, conn)
    return envelope(True, rows, None)


# Health
@app.get("/api/health")
def api_health():
    try:
        with get_conn() as conn:
            conn.execute("SELECT 1")
        return envelope(True, {"db": True, "time": dt.datetime.utcnow().isoformat() + "Z"}, None)
    except Exception as exc:  # noqa: BLE001
        return envelope(False, None, {"code": "db_error", "message": str(exc)}), 500


def find_next_available_date(conn: sqlite3.Connection, start: dt.date | None = None, horizon_days: int = 60) -> str:
    start_date = start or dt.date.today()
    for i in range(horizon_days):
        day = start_date + dt.timedelta(days=i)
        try:
            check_capacity(day.isoformat(), conn)
            return day.isoformat()
        except CapacityError:
            continue
    # If no capacity limit set or horizon exhausted, pick next day regardless
    return (start_date + dt.timedelta(days=1)).isoformat()


def _create_or_update_appointment(payload: dict, is_update: bool, appt_id: int | None = None):
    with get_conn() as conn:
        try:
            if is_update:
                current = conn.execute(
                    "SELECT * FROM appointments WHERE id=?", (appt_id,)
                ).fetchone()
                if not current:
                    return None, ("not_found", "Appointment not found")

                name = (payload.get("name") or current.get("name") or "").strip()
                phone = (payload.get("phone") or current.get("phone") or "").strip()
                # enforce non-empty for NOT NULL columns on update as well
                if not name or not phone:
                    return None, ("bad_request", "name and phone are required")

                new_date = (payload.get("scheduled_date") or current.get("scheduled_date") or "").strip()
                symptoms = (payload.get("symptoms") if payload.get("symptoms") is not None else current.get("symptoms"))
                image_paths = (payload.get("image_paths") if payload.get("image_paths") is not None else current.get("image_paths"))
                voice_note_path = (payload.get("voice_note_path") if payload.get("voice_note_path") is not None else current.get("voice_note_path"))
                status = (payload.get("status") or current.get("status"))

                # If date changed, capacity check and recompute ticket with same last4
                new_ticket = current["ticket_number"]
                if new_date != (current.get("scheduled_date") or ""):
                    check_capacity(new_date, conn)
                    last4 = current["ticket_number"] % 10000
                    ymd = new_date.replace("-", "")
                    seq = (
                        conn.execute(
                            "SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?",
                            (new_date,),
                        ).fetchone()["c"]
                        or 0
                    ) + 1
                    new_ticket = int(f"{ymd}{seq:03d}{last4:04d}")

                conn.execute(
                    """
                    UPDATE appointments
                       SET name=?, phone=?, symptoms=?, image_paths=?, voice_note_path=?, status=?, scheduled_date=?, ticket_number=?
                     WHERE id=?
                    """,
                    (
                        name,
                        phone,
                        (symptoms or None),
                        (image_paths or None),
                        (voice_note_path or None),
                        status or "pending",
                        new_date,
                        new_ticket,
                        appt_id,
                    ),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM appointments WHERE id=?", (appt_id,)).fetchone()
                return row, None
            else:
                # Create requires basic fields
                for f in ["name", "phone", "scheduled_date", "national_id"]:
                    if not (payload.get(f) or "").strip():
                        return None, ("bad_request", f"Missing field: {f}")
                name = payload.get("name").strip()
                phone = payload.get("phone").strip()
                scheduled_date = payload.get("scheduled_date").strip()
                symptoms = (payload.get("symptoms") or "").strip() or None
                image_paths = (payload.get("image_paths") or "").strip() or None
                voice_note_path = (payload.get("voice_note_path") or "").strip() or None
                status = (payload.get("status") or "pending")
                national_id = str(payload.get("national_id")).strip()

                check_capacity(scheduled_date, conn)
                ticket_number = make_ticket(scheduled_date, national_id, conn)
                cur = conn.execute(
                    """
                    INSERT INTO appointments (ticket_number, name, phone, symptoms, image_paths, voice_note_path, status, scheduled_date)
                    VALUES (?,?,?,?,?,?,?,?)
                    """,
                    (
                        ticket_number,
                        name,
                        phone,
                        symptoms,
                        image_paths,
                        voice_note_path,
                        status,
                        scheduled_date,
                    ),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM appointments WHERE id=?", (cur.lastrowid,)).fetchone()
                return row, None
        except CapacityError as ce:
            return None, ("capacity", str(ce))
        except sqlite3.IntegrityError as ie:
            return None, ("conflict", f"Integrity error: {ie}")


@app.post("/api/appointments")
@require_role("staff")
def api_create_appointment():
    payload = request.get_json(silent=True) or {}
    row, err = _create_or_update_appointment(payload, is_update=False)
    if err:
        code, msg = err
        http = 409 if code in {"capacity", "conflict"} else 400
        return envelope(False, None, {"code": code, "message": msg}), http
    return envelope(True, {"ticket_number": row["ticket_number"], "appointment": row}, None), 201


@app.put("/api/appointments/<int:appt_id>")
@require_role("staff")
def api_update_appointment(appt_id: int):
    payload = request.get_json(silent=True) or {}
    row, err = _create_or_update_appointment(payload, is_update=True, appt_id=appt_id)
    if err:
        code, msg = err
        http = 409 if code in {"capacity", "conflict"} else (404 if code == "not_found" else 400)
        return envelope(False, None, {"code": code, "message": msg}), http
    return envelope(True, row, None)


@app.delete("/api/appointments/<int:appt_id>")
@require_role("staff")
def api_delete_appointment(appt_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM appointments WHERE id=?", (appt_id,))
        conn.commit()
        if cur.rowcount == 0:
            return envelope(False, None, {"code": "not_found", "message": "Appointment not found"}), 404
    return envelope(True, {"deleted": appt_id}, None)


@app.post("/api/patient/book")
def api_patient_book():
    # Accept JSON or multipart/form-data with optional image and voice files
    is_multipart = request.content_type and "multipart/form-data" in request.content_type
    if is_multipart:
        data = request.form
        files = request.files
        name = (data.get("name") or "").strip()
        phone = (data.get("phone") or "").strip()
        national_id = (data.get("national_id") or "").strip()
        symptoms = (data.get("symptoms") or "").strip()
        image = files.get("image")
        voice = files.get("voice")
        image_path = None
        voice_path = None
        uploads_root = os.path.join(os.getcwd(), "uploads")
        os.makedirs(os.path.join(uploads_root, "images"), exist_ok=True)
        os.makedirs(os.path.join(uploads_root, "voices"), exist_ok=True)
        ts = dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        if image and getattr(image, "filename", ""):
            fname = f"img_{ts}_{image.filename}"
            full = os.path.join(uploads_root, "images", fname)
            image.save(full)
            image_path = f"uploads/images/{fname}"
        if voice and getattr(voice, "filename", ""):
            fname = f"voice_{ts}_{voice.filename}"
            full = os.path.join(uploads_root, "voices", fname)
            voice.save(full)
            voice_path = f"uploads/voices/{fname}"
        payload = {
            "name": name,
            "phone": phone,
            "national_id": national_id,
            "symptoms": symptoms or None,
            "image_paths": image_path,
            "voice_note_path": voice_path,
        }
    else:
        payload = request.get_json(silent=True) or {}

    # Basic validation: phone (11 digits), national_id (14 digits)
    ph = (payload.get("phone") or "").strip()
    nid = str(payload.get("national_id") or "").strip()
    if not (ph.isdigit() and len(ph) == 11):
        return envelope(False, None, {"code": "bad_request", "message": "Phone must be 11 digits"}), 400
    if not (nid.isdigit() and len(nid) == 14):
        return envelope(False, None, {"code": "bad_request", "message": "National ID must be 14 digits"}), 400

    # Duplicate prevention: same person (last4 of national id + phone) cannot book if any non-completed exists
    last4 = int(nid[-4:])
    with get_conn() as conn:
        existing = conn.execute(
            """
            SELECT id, status, ticket_number, scheduled_date
              FROM appointments
             WHERE (ticket_number % 10000)=? AND phone=? AND COALESCE(status,'pending') != 'completed'
             ORDER BY created_at DESC
            """,
            (last4, ph),
        ).fetchall()
    if existing:
        return envelope(
            False,
            None,
            {"code": "conflict", "message": "You already have a pending appointment."},
        ), 409

    # Auto-assign next available scheduled_date
    with get_conn() as conn:
        scheduled_date = find_next_available_date(conn)
    payload["scheduled_date"] = scheduled_date

    row, err = _create_or_update_appointment(payload, is_update=False)
    if err:
        code, msg = err
        http = 409 if code in {"capacity", "conflict"} else 400
        return envelope(False, None, {"code": code, "message": msg}), http
    return envelope(True, {"ticket_number": row["ticket_number"], "scheduled_date": row["scheduled_date"], "appointment": row}, None), 201


# Staff-only endpoints removed from patient app


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)

# placeholder
