import os
import sqlite3
import datetime as dt
from functools import wraps

from flask import Flask, request, jsonify, session, redirect, url_for, render_template, send_from_directory
from dotenv import load_dotenv
from flask_cors import CORS
CORS(app,
     supports_credentials=True,
     origins=["http://localhost:5173","http://localhost:5174"])

# For staff app (app1.py) - add this too:
app.config.update(SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=False)

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
    cap_val = (cap["capacity"] if cap else 0)
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


@app.get("/")
def root():
    return redirect(url_for("login"))


@app.get("/login")
def login():
    return render_template("login.html")


@app.get("/staff")
def staff_page():
    if session.get("role") != "staff":
        return redirect(url_for("login"))
    return render_template("staff.html")


@app.get("/uploads/<path:subpath>")
def serve_uploads(subpath: str):
    # Serve uploaded images and voice notes for staff dashboard
    upload_root = os.path.join(os.getcwd(), "uploads")
    return send_from_directory(upload_root, subpath)


# Auth APIs (staff only here)
@app.post("/api/login/staff")
def api_login_staff():
    data = request.get_json(silent=True) or request.form or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    if not username or not password:
        return envelope(False, None, {"code": "bad_request", "message": "Missing credentials"}), 400
    if username == os.getenv("STAFF_USER") and password == os.getenv("STAFF_PASS"):
        session.clear()
        session["role"] = "staff"
        return redirect("/staff", code=302)
    return envelope(False, None, {"code": "unauthorized", "message": "Invalid credentials"}), 401


@app.post("/api/logout")
def api_logout():
    session.clear()
    return redirect("/login", code=302)


@app.get("/api/health")
def api_health():
    try:
        with get_conn() as conn:
            conn.execute("SELECT 1")
        return envelope(True, {"db": True, "time": dt.datetime.utcnow().isoformat() + "Z"}, None)
    except Exception as exc:  # noqa: BLE001
        return envelope(False, None, {"code": "db_error", "message": str(exc)}), 500


# Staff: list appointments
@app.get("/api/appointments")
@require_role("staff")
def api_list_appointments():
    q = (request.args.get("q") or "").strip()
    date = (request.args.get("date") or "").strip()
    status = (request.args.get("status") or "").strip()
    page = int(request.args.get("page") or 1)
    page_size = int(request.args.get("pageSize") or 20)
    sort_field, sort_dir = parse_sort(request.args.get("sort") or "created_at:desc")

    where = []
    args: list[object] = []
    if q:
        where.append("(name LIKE ? OR phone LIKE ?)")
        args.extend([f"%{q}%", f"%{q}%"])
    if date:
        where.append("scheduled_date = ?")
        args.append(date)
    if status:
        where.append("status = ?")
        args.append(status)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    offset = (page - 1) * page_size
    base = f"FROM appointments{where_sql}"
    sql = f"SELECT * {base} ORDER BY {sort_field} {sort_dir} LIMIT ? OFFSET ?"
    count_sql = f"SELECT COUNT(*) AS c {base}"

    with get_conn() as conn:
        total = conn.execute(count_sql, tuple(args)).fetchone()["c"]
        rows = conn.execute(sql, tuple(args + [page_size, offset])).fetchall()
    return envelope(True, {"items": rows, "page": page, "pageSize": page_size, "total": total}, None)


@app.get("/api/appointments/<int:appt_id>")
@require_role("staff")
def api_get_appointment(appt_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM appointments WHERE id=?", (appt_id,)).fetchone()
    if not row:
        return envelope(False, None, {"code": "not_found", "message": "Appointment not found"}), 404
    return envelope(True, row, None)


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
                if not name or not phone:
                    return None, ("bad_request", "name and phone are required")

                new_date = (payload.get("scheduled_date") or current.get("scheduled_date") or "").strip()
                symptoms = (payload.get("symptoms") if payload.get("symptoms") is not None else current.get("symptoms"))
                image_paths = (payload.get("image_paths") if payload.get("image_paths") is not None else current.get("image_paths"))
                voice_note_path = (payload.get("voice_note_path") if payload.get("voice_note_path") is not None else current.get("voice_note_path"))
                status = (payload.get("status") or current.get("status"))

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


@app.get("/api/capacity")
@require_role("staff")
def api_get_capacity():
    with get_conn() as conn:
        rows = conn.execute("SELECT day_name, capacity FROM daily_capacity").fetchall()
    existing = {r["day_name"]: r["capacity"] for r in rows}
    data = [{"day_name": d, "capacity": int(existing.get(d, 0) or 0)} for d in WEEK]
    return envelope(True, data, None)


@app.put("/api/capacity/<day_name>")
@require_role("staff")
def api_put_capacity(day_name: str):
    if day_name not in WEEK:
        return envelope(False, None, {"code": "bad_request", "message": "Invalid day_name"}), 400
    payload = request.get_json(silent=True) or {}
    try:
        capacity = int(payload.get("capacity"))
    except Exception:  # noqa: BLE001
        return envelope(False, None, {"code": "bad_request", "message": "capacity must be integer"}), 400
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO daily_capacity (day_name, capacity) VALUES (?, ?) ON CONFLICT(day_name) DO UPDATE SET capacity=excluded.capacity",
            (day_name, capacity),
        )
        conn.commit()
    return envelope(True, {"day_name": day_name, "capacity": capacity}, None)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)), debug=True)


