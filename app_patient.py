import os
import sqlite3
import datetime as dt
import json
import random
import re
from functools import wraps
from urllib.parse import urlencode

from flask import Flask, send_from_directory, abort, request, jsonify, session, redirect, url_for, render_template, current_app
from dotenv import load_dotenv

# --- PHONE NORMALIZATION + DEBUG LOGGING ---
def _debug(msg):
    try:
        current_app.logger.info(msg)
    except Exception:
        print(msg)

def get_phone_string(req):
    """
    Always returns a string of digits, attempting to 'rescue' cases
    where the client sent a number (lost the leading 0).
    """
    raw_form = req.form.get("phone", None)
    raw_json = None
    try:
        raw_json = (req.get_json(silent=True) or {}).get("phone", None)
    except Exception:
        pass

    _debug(f"[book] raw phone form={repr(raw_form)} json={repr(raw_json)}")

    raw = raw_form if raw_form is not None else (raw_json if raw_json is not None else "")
    s = str(raw).strip()

    # Keep only digits for validation/storage
    digits = "".join(ch for ch in s if ch.isdigit())

    # If someone sent numeric 10 digits (lost leading 0), rescue it
    if len(digits) == 10 and not digits.startswith("0"):
        digits = "0" + digits

    # Final validation (Egypt style): 0 + 10 digits = 11 total
    if not re.fullmatch(r"0\d{10}", digits):
        raise ValueError(f"invalid phone format: {repr(s)} -> digits={digits}")

    return digits

# Load environment variables
load_dotenv()

# --- ABSOLUTE PATHS TO BUILDS ---
HERE = os.path.abspath(os.path.dirname(__file__))
PATIENT_DIST = os.path.abspath(os.path.join(HERE, 'patient', 'dist'))

app = Flask(__name__, static_folder=PATIENT_DIST, static_url_path="")

# Session configuration
app.secret_key = os.getenv("FLASK_SECRET", "change-me")

# Database setup
def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

def get_conn():
    conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), 'yarab', 'dental_appointments.db'))
    conn.row_factory = dict_factory
    return conn

# Capacity checking and date assignment
WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

class CapacityError(Exception):
    def __init__(self, day_name: str, capacity: int, used: int):
        super().__init__(f"Capacity reached for {day_name}: {used}/{capacity}")
        self.day_name = day_name
        self.capacity = capacity
        self.used = used

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

def get_next_available_date(conn: sqlite3.Connection) -> str:
    """Find the next available date based on daily capacity"""
    today = dt.date.today()
    
    # Check up to 30 days ahead
    for days_ahead in range(30):
        check_date = today + dt.timedelta(days=days_ahead)
        day_name = WEEK[check_date.weekday()]
        
        # Get capacity for this day
        cap_row = conn.execute(
            "SELECT capacity FROM daily_capacity WHERE day_name=?", (day_name,)
        ).fetchone()
        capacity = cap_row["capacity"] if cap_row else 10  # Default capacity is 10
        
        # Get current appointments for this date
        used = conn.execute(
            "SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?",
            (check_date.isoformat(),)
        ).fetchone()["c"]
        
        # If there's capacity, return this date
        if used < capacity:
            return check_date.isoformat()
    
    # If no capacity found in 30 days, return today + 30 days
    return (today + dt.timedelta(days=30)).isoformat()

# Ticket generation with national_id dependency
def make_ticket(scheduled_date: str, national_id: str, conn: sqlite3.Connection) -> int:
    ymd = scheduled_date.replace("-", "")
    cur = conn.execute("SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?", (scheduled_date,))
    seq = (cur.fetchone()["c"] or 0) + 1               # per-day sequence 001..999
    national_id_last4 = int(national_id[-4:]) if national_id and len(national_id) >= 4 else random.randint(0, 9999)
    return int(f"{ymd}{seq:03d}{national_id_last4:04d}")

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

# ------------- PATIENT API ROUTES -------------

@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        with get_conn() as conn:
            conn.execute("SELECT 1")
        return {"status": "healthy", "service": "patient", "db": True, "time": dt.datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        return {"status": "unhealthy", "service": "patient", "error": str(exc)}, 500

@app.route("/api/patient/appointments", methods=["GET"])
def get_patient_appointments():
    # Get query parameters
    ticket = request.args.get('ticket')
    national_id = request.args.get('national_id')
    phone = request.args.get('phone')
    date = request.args.get('date')
    
    # Either ticket OR national_id, not both
    if ticket and national_id:
        return jsonify({"error": "Provide either ticket or national_id, not both"}), 400
    
    try:
        with get_conn() as conn:
            if ticket:
                # Search by ticket number
                try:
                    rows = find_by_ticket(int(ticket), conn)
                except ValueError:
                    rows = []
            else:
                if not national_id or len(national_id) < 4:
                    return jsonify({"error": "national_id required unless ticket provided"}), 400
                last4 = int(str(national_id)[-4:])
                rows = find_by_last4(last4, phone, date, conn)
            
            # Convert to list and format for JSON
            appointments = []
            for row in rows:
                appointment = dict(row)
                # Ensure image_paths is a list
                if appointment.get('image_paths'):
                    try:
                        appointment['image_paths'] = json.loads(appointment['image_paths'])
                    except:
                        appointment['image_paths'] = []
                else:
                    appointment['image_paths'] = []
                appointments.append(appointment)
            
            return jsonify(appointments)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/patient/book", methods=["POST"])
def book_appointment():
    # Accept JSON or multipart/form-data with optional image and voice files
    is_multipart = request.content_type and "multipart/form-data" in request.content_type
    
    if is_multipart:
        data = request.form
        files = request.files
        name = (data.get("name") or "").strip()
        national_id = (data.get("national_id") or "").strip()
        symptoms = (data.get("symptoms") or "").strip()
        image = files.get("image")
        voice = files.get("voice")
        
        # Handle file uploads - create patient-specific folders
        image_path = None
        voice_path = None
        uploads_root = os.path.join(os.path.dirname(__file__), "yarab", "uploads")
        
        # Create patient-specific folder using national_id
        patient_folder = f"patient_{national_id}"
        patient_images_dir = os.path.join(uploads_root, "patients", patient_folder, "images")
        patient_voices_dir = os.path.join(uploads_root, "patients", patient_folder, "voices")
        
        os.makedirs(patient_images_dir, exist_ok=True)
        os.makedirs(patient_voices_dir, exist_ok=True)
        ts = dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        
        if image and getattr(image, "filename", ""):
            # Get file extension
            file_ext = os.path.splitext(image.filename)[1] if '.' in image.filename else '.jpg'
            fname = f"img_{ts}{file_ext}"
            full = os.path.join(patient_images_dir, fname)
            image.save(full)
            image_path = f"uploads/patients/{patient_folder}/images/{fname}"
            
        if voice and getattr(voice, "filename", ""):
            # Get file extension
            file_ext = os.path.splitext(voice.filename)[1] if '.' in voice.filename else '.webm'
            fname = f"voice_{ts}{file_ext}"
            full = os.path.join(patient_voices_dir, fname)
            voice.save(full)
            voice_path = f"uploads/patients/{patient_folder}/voices/{fname}"
            
        payload = {
            "name": name,
            "national_id": national_id,
            "symptoms": symptoms or None,
            "image_paths": image_path,
            "voice_note_path": voice_path,
        }
    else:
        payload = request.get_json(silent=True) or {}

    # Basic validation: national_id (14 digits)
    nid = str(payload.get("national_id") or "").strip()
    if not (nid.isdigit() and len(nid) == 14):
        return jsonify({"error": "National ID must be 14 digits"}), 400

    # 1) Read + normalize phone with hard logging
    try:
        phone = get_phone_string(request)  # ALWAYS a string like 01234567890
    except ValueError as e:
        _debug(f"[book] phone validation error: {e}")
        return jsonify({"error": "Phone must be 11 digits starting with 0 (e.g., 01XXXXXXXXX)"}), 400

    # Duplicate prevention: same person (national_id) cannot book if any non-completed exists
    try:
        with get_conn() as conn:
            # 2) Duplicate rule: only block if PENDING for today/future based on national_id
            existing = conn.execute(
                """
                SELECT id, status, ticket_number, scheduled_date, name
                  FROM appointments
                 WHERE national_id = ?
                   AND COALESCE(status,'pending')='pending'
                   AND date(COALESCE(scheduled_date, date('now'))) >= date('now')
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
                (nid,),
            ).fetchone()
            
            if existing:
                _debug(f"[book] duplicate pending for national_id={nid}: ticket={existing['ticket_number']}")
                # Return clear message that user cannot make another appointment
                return jsonify({
                    "error": "You already have a pending appointment. Please complete your current appointment before booking a new one.",
                    "ticket_number": str(existing["ticket_number"]),
                    "scheduled_date": existing["scheduled_date"],
                    "status": existing["status"],
                    "duplicate": True
                }), 409

            # Auto-assign next available scheduled_date
            scheduled_date = get_next_available_date(conn)
            payload["scheduled_date"] = scheduled_date

            # Generate ticket number
            ticket_number = make_ticket(scheduled_date, payload["national_id"], conn)
            
            # Insert appointment into database (with phone_text column)
            cursor = conn.execute(
                """
                INSERT INTO appointments (ticket_number, name, phone, phone_text, national_id, symptoms, image_paths, voice_note_path, status, scheduled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ticket_number,
                    payload["name"],
                    phone,  # Store in both phone and phone_text for compatibility
                    phone,  # Store normalized phone in phone_text
                    payload["national_id"],
                    payload.get("symptoms"),
                    payload.get("image_paths"),
                    payload.get("voice_note_path"),
                    'pending',
                    scheduled_date
                )
            )
            conn.commit()
            
            # Get the created appointment
            appointment = conn.execute("SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)).fetchone()
            
            response_data = {
                "ticket_number": str(ticket_number),
                "scheduled_date": scheduled_date,
                "status": "pending",
                "symptoms": payload.get("symptoms"),
                "image_paths": [payload.get("image_paths")] if payload.get("image_paths") else [],
                "voice_note_path": payload.get("voice_note_path")
            }
            
            return jsonify(response_data), 201
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/uploads/patients/<patient_folder>/images/<filename>", methods=["GET"])
def uploaded_patient_image(patient_folder, filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'patients', patient_folder, 'images')
    return send_from_directory(upload_dir, filename)

@app.route("/uploads/patients/<patient_folder>/voices/<filename>", methods=["GET"])
def uploaded_patient_voice(patient_folder, filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'patients', patient_folder, 'voices')
    return send_from_directory(upload_dir, filename)

# Legacy endpoints for backward compatibility
@app.route("/uploads/images/<filename>", methods=["GET"])
def uploaded_image(filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'images')
    return send_from_directory(upload_dir, filename)

@app.route("/uploads/voices/<filename>", methods=["GET"])
def uploaded_voice(filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'voices')
    return send_from_directory(upload_dir, filename)

# ------------- STATIC FILES (PATIENT REACT UI) -------------
# Catch-all must be LAST and must not intercept /api or /uploads.
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_patient_ui(path):
    # Don't serve index.html for API routes or uploads
    if path.startswith("api") or path.startswith("uploads"):
        abort(404)  # let real API/upload routes handle it

    # For static assets (JS, CSS, images, etc.), serve them if they exist
    if path and not path.endswith('/'):
        full = os.path.join(app.static_folder, path)
        if os.path.exists(full) and os.path.isfile(full):
            return send_from_directory(app.static_folder, path)

    # For all other routes (including client-side routes), serve index.html
    # This allows React Router to handle client-side routing
    index_path = os.path.join(app.static_folder, "index.html")
    if not os.path.exists(index_path):
        return "Build not found: {}".format(index_path), 500
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    print("[patient] serving UI from:", PATIENT_DIST)
    app.run(host="127.0.0.1", port=5000, debug=True)