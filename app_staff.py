import os
import sqlite3
import datetime as dt
import random
import re
from functools import wraps

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

    _debug(f"[staff] raw phone form={repr(raw_form)} json={repr(raw_json)}")

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
STAFF_DIST = os.path.abspath(os.path.join(HERE, 'staff', 'dist'))

app = Flask(__name__, static_folder=STAFF_DIST, static_url_path="")

# Session configuration for staff authentication
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax", 
    SESSION_COOKIE_SECURE=False
)
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
    cap_val = (cap["capacity"] if cap else 0)
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

# ------------- STAFF API ROUTES -------------

@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        with get_conn() as conn:
            conn.execute("SELECT 1")
        return {"status": "healthy", "service": "staff", "db": True, "time": dt.datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        return {"status": "unhealthy", "service": "staff", "error": str(exc)}, 500

@app.route("/api/login/staff", methods=["POST"])
def staff_login():
    data = request.get_json(silent=True) or request.form or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    
    if not username or not password:
        return jsonify({"error": "Missing credentials"}), 400
    
    # TODO: Replace with your actual authentication logic
    # For now, accept admin/admin
    if username == 'admin' and password == 'admin':
        session.clear()
        session['staff_logged_in'] = True
        session['username'] = username
        session['role'] = 'staff'
        return jsonify({"message": "Login successful"}), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401

@app.route("/api/logout", methods=["POST"])
def staff_logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"}), 200

@app.route("/api/auth/verify", methods=["GET"])
def verify_auth():
    if session.get('staff_logged_in'):
        return jsonify({
            "authenticated": True,
            "user": {
                "username": session.get('username'),
                "role": session.get('role')
            }
        }), 200
    else:
        return jsonify({"authenticated": False}), 401

@app.route("/api/appointments", methods=["GET"])
def get_appointments():
    # Get query parameters
    q = request.args.get('q', '')
    status = request.args.get('status', '')
    date = request.args.get('date', '')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('pageSize', 10))
    sort = request.args.get('sort', 'created_at:DESC')
    
    # Parse sort parameter
    sort_field, sort_dir = parse_sort(sort)
    
    # Build WHERE clause
    where = []
    args = []
    
    if q:
        where.append("(name LIKE ? OR ticket_number LIKE ? OR phone_text LIKE ?)")
        args.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    
    if status and status != 'all':
        where.append("COALESCE(status,'pending') = ?")
        args.append(status)
    
    if date:
        where.append("scheduled_date = ?")
        args.append(date)
    
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""
    
    # Calculate offset
    offset = (page - 1) * page_size
    
    # Build SQL queries
    base_sql = f"FROM appointments{where_sql}"
    sql = f"SELECT * {base_sql} ORDER BY {sort_field} {sort_dir} LIMIT ? OFFSET ?"
    count_sql = f"SELECT COUNT(*) AS c {base_sql}"
    
    try:
        with get_conn() as conn:
            # Get total count
            total = conn.execute(count_sql, tuple(args)).fetchone()["c"]
            
            # Get appointments
            rows = conn.execute(sql, tuple(args + [page_size, offset])).fetchall()
            
            # Convert to list and format dates
            appointments = []
            for row in rows:
                appointment = dict(row)
                # Ensure image_paths is a list
                if appointment.get('image_paths'):
                    try:
                        import json
                        appointment['image_paths'] = json.loads(appointment['image_paths'])
                    except:
                        appointment['image_paths'] = []
                else:
                    appointment['image_paths'] = []
                appointments.append(appointment)
            
            total_pages = (total + page_size - 1) // page_size
            
            return jsonify({
                "appointments": appointments,
                "totalPages": total_pages,
                "currentPage": page,
                "total": total
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/appointments/search", methods=["GET"])
def search_appointments():
    """Staff endpoint to search appointments by phone or ticket"""
    phone = request.args.get('phone')
    ticket = request.args.get('ticket')
    
    if not phone and not ticket:
        return jsonify({"error": "Phone or ticket number is required"}), 400
    
    try:
        with get_conn() as conn:
            if ticket:
                # Search by ticket number
                rows = conn.execute(
                    "SELECT * FROM appointments WHERE ticket_number = ?", 
                    (ticket,)
                ).fetchall()
            else:
                # Search by phone
                rows = conn.execute(
                    "SELECT * FROM appointments WHERE phone_text = ? ORDER BY created_at DESC", 
                    (phone,)
                ).fetchall()
            
            # Convert to list and format for JSON
            appointments = []
            for row in rows:
                appointment = dict(row)
                # Ensure image_paths is a list
                if appointment.get('image_paths'):
                    try:
                        import json
                        appointment['image_paths'] = json.loads(appointment['image_paths'])
                    except:
                        appointment['image_paths'] = []
                else:
                    appointment['image_paths'] = []
                appointments.append(appointment)
            
            return jsonify(appointments)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/appointments", methods=["POST"])
def create_appointment():
    """Staff endpoint to create new appointments"""
    data = request.get_json()
    
    # Validate required fields
    name = data.get('name', '').strip()
    national_id = data.get('national_id', '').strip()
    
    if not name or not national_id:
        return jsonify({"error": "Name and national ID are required"}), 400
    
    # Validate national ID format
    if not (national_id.isdigit() and len(national_id) == 14):
        return jsonify({"error": "National ID must be 14 digits"}), 400
    
    # 1) Read + normalize phone with hard logging
    try:
        phone = get_phone_string(request)  # ALWAYS a string like 01234567890
    except ValueError as e:
        _debug(f"[staff] phone validation error: {e}")
        return jsonify({"error": "Phone must be 11 digits starting with 0 (e.g., 01XXXXXXXXX)"}), 400
    
    try:
        with get_conn() as conn:
            # Check for duplicate appointments (national_id + non-completed)
            existing = conn.execute(
                """
                SELECT id, ticket_number, scheduled_date FROM appointments
                WHERE national_id=? AND COALESCE(status,'pending') != 'completed'
                ORDER BY created_at DESC
                """,
                (national_id,),
            ).fetchall()
            
            if existing:
                return jsonify({
                    "error": "Patient already has a pending appointment. Please complete the current appointment before creating a new one.",
                    "ticket_number": str(existing[0]["ticket_number"]),
                    "scheduled_date": existing[0]["scheduled_date"],
                    "duplicate": True
                }), 409
            
            # Automatically assign the next available date
            scheduled_date = get_next_available_date(conn)
            ticket_number = make_ticket(scheduled_date, national_id, conn)
            
            # Insert appointment
            cursor = conn.execute(
                """
                INSERT INTO appointments (ticket_number, name, phone, phone_text, national_id, symptoms, image_paths, voice_note_path, status, scheduled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ticket_number,
                    name,
                    phone,  # Store in both phone and phone_text for compatibility
                    phone,  # Store normalized phone in phone_text
                    national_id,
                    data.get('symptoms', ''),
                    None,  # image_paths
                    None,  # voice_note_path
                    'pending',
                    scheduled_date
                )
            )
            conn.commit()
            
            # Get the created appointment
            appointment = conn.execute("SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)).fetchone()
            
            return jsonify({
                "message": "Appointment created successfully",
                "appointment": dict(appointment)
            }), 201
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/appointments/<int:appointment_id>", methods=["PUT", "DELETE"])
def update_appointment(appointment_id):
    if request.method == "PUT":
        import re
        import datetime
        try:
            from zoneinfo import ZoneInfo  # py3.9+
        except ImportError:
            from backports.zoneinfo import ZoneInfo  # if needed: pip install backports.zoneinfo

        CAIRO = ZoneInfo("Africa/Cairo")
        
        body = request.get_json(force=True, silent=True) or {}
        status = body.get("status")
        use_now = bool(body.get("use_now"))
        manual = body.get("completion_hour")  # "HH:MM"
        procedures_done = body.get("procedures_done")

        fields, params = [], []

        # include your existing editable fields handling here, e.g.:
        for key in ("name","phone","symptoms","image_paths","voice_note_path","scheduled_date"):
            if key in body and body[key] is not None:
                fields.append(f"{key} = ?"); params.append(body[key])

        if status is not None:
            fields.append("status = ?"); params.append(status)

        if status == "completed":
            if use_now:
                now_hhmm = datetime.datetime.now(CAIRO).strftime("%H:%M")
                fields.append("completion_hour = ?"); params.append(now_hhmm)
            else:
                if not manual or not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", manual):
                    return jsonify({"message": "completion_hour must be HH:MM (24h) or set use_now=true"}), 400
                fields.append("completion_hour = ?"); params.append(manual)

            if procedures_done:
                fields.append("symptoms = COALESCE(symptoms,'') || ?")
                params.append(f"\nProcedures: {procedures_done}")

        if not fields:
            return jsonify({"message": "No changes"}), 400

        params.append(appointment_id)
        
        try:
            with get_conn() as conn:
                conn.execute(f"UPDATE appointments SET {', '.join(fields)} WHERE id = ?", params)
                conn.commit()
                
                # Get updated appointment
                updated = conn.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
                
            return jsonify({"ok": True, "message": f"Appointment {appointment_id} updated", "data": updated}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    elif request.method == "DELETE":
        try:
            with get_conn() as conn:
                cursor = conn.execute("DELETE FROM appointments WHERE id = ?", (appointment_id,))
                conn.commit()
                
                if cursor.rowcount == 0:
                    return jsonify({"error": "Appointment not found"}), 404
                    
            return jsonify({"message": f"Appointment {appointment_id} deleted"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route("/api/capacity", methods=["GET"])
@app.route("/api/capacity/<day_name>", methods=["PUT"])
def manage_capacity(day_name=None):
    WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    if request.method == "GET":
        try:
            with get_conn() as conn:
                rows = conn.execute("SELECT day_name, capacity FROM daily_capacity").fetchall()
            
            existing = {r["day_name"]: r["capacity"] for r in rows}
            data = [{"day": d, "capacity": int(existing.get(d, 0) or 0)} for d in WEEK]
            
            return jsonify(data)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    elif request.method == "PUT":
        data = request.get_json()
        capacity = data.get('capacity')
        
        if not isinstance(capacity, int) or capacity < 0:
            return jsonify({"error": "Capacity must be a non-negative integer"}), 400
        
        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO daily_capacity (day_name, capacity) VALUES (?, ?) ON CONFLICT(day_name) DO UPDATE SET capacity=excluded.capacity",
                    (day_name, capacity)
                )
                conn.commit()
            
            return jsonify({"message": f"Capacity for {day_name} updated to {capacity}"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route("/api/dashboard", methods=["GET"])
def get_dashboard_data():
    """Get comprehensive dashboard data from the database"""
    try:
        with get_conn() as conn:
            # Get today's date
            today = dt.date.today().isoformat()
            
            # 1. Total appointments count
            total_appointments = conn.execute("SELECT COUNT(*) as count FROM appointments").fetchone()["count"]
            
            # 2. Today's appointments
            today_appointments = conn.execute(
                "SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = ?", 
                (today,)
            ).fetchone()["count"]
            
            # 3. Pending appointments count
            pending_appointments = conn.execute(
                "SELECT COUNT(*) as count FROM appointments WHERE COALESCE(status,'pending') = 'pending'"
            ).fetchone()["count"]
            
            # 4. Completed appointments count
            completed_appointments = conn.execute(
                "SELECT COUNT(*) as count FROM appointments WHERE status = 'completed'"
            ).fetchone()["count"]
            
            # 5. Recent appointments (last 10)
            recent_appointments = conn.execute(
                """
                SELECT id, ticket_number, name, phone_text as phone, national_id, 
                       scheduled_date, status, symptoms, created_at
                FROM appointments 
                ORDER BY created_at DESC 
                LIMIT 10
                """
            ).fetchall()
            
            # 6. Today's appointments details
            today_appointments_details = conn.execute(
                """
                SELECT id, ticket_number, name, phone_text as phone, national_id,
                       scheduled_date, status, symptoms, created_at, completion_hour
                FROM appointments 
                WHERE scheduled_date = ?
                ORDER BY created_at ASC
                """,
                (today,)
            ).fetchall()
            
            # 7. Appointments by status (for charts)
            status_counts = conn.execute(
                """
                SELECT COALESCE(status,'pending') as status, COUNT(*) as count
                FROM appointments 
                GROUP BY COALESCE(status,'pending')
                """
            ).fetchall()
            
            # 8. Appointments by date (last 7 days)
            week_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
            daily_counts = conn.execute(
                """
                SELECT scheduled_date, COUNT(*) as count
                FROM appointments 
                WHERE scheduled_date >= ?
                GROUP BY scheduled_date
                ORDER BY scheduled_date ASC
                """,
                (week_ago,)
            ).fetchall()
            
            # 9. Capacity information
            capacity_info = conn.execute(
                """
                SELECT day_name, capacity FROM daily_capacity
                ORDER BY 
                CASE day_name
                    WHEN 'Monday' THEN 1
                    WHEN 'Tuesday' THEN 2
                    WHEN 'Wednesday' THEN 3
                    WHEN 'Thursday' THEN 4
                    WHEN 'Friday' THEN 5
                    WHEN 'Saturday' THEN 6
                    WHEN 'Sunday' THEN 7
                END
                """
            ).fetchall()
            
            # 10. Today's capacity usage
            today_capacity_used = conn.execute(
                """
                SELECT COUNT(*) as used FROM appointments 
                WHERE scheduled_date = ?
                """,
                (today,)
            ).fetchone()["used"]
            
            # Get today's capacity
            today_day = WEEK[dt.date.today().weekday()]
            today_capacity = conn.execute(
                "SELECT capacity FROM daily_capacity WHERE day_name = ?", 
                (today_day,)
            ).fetchone()
            today_capacity_value = today_capacity["capacity"] if today_capacity else 10
            
            # Format the response
            dashboard_data = {
                "summary": {
                    "total_appointments": total_appointments,
                    "today_appointments": today_appointments,
                    "pending_appointments": pending_appointments,
                    "completed_appointments": completed_appointments,
                    "today_capacity_used": today_capacity_used,
                    "today_capacity_total": today_capacity_value,
                    "today_capacity_percentage": round((today_capacity_used / today_capacity_value) * 100, 1) if today_capacity_value > 0 else 0
                },
                "recent_appointments": [dict(row) for row in recent_appointments],
                "today_appointments": [dict(row) for row in today_appointments_details],
                "status_counts": [dict(row) for row in status_counts],
                "daily_counts": [dict(row) for row in daily_counts],
                "capacity_info": [dict(row) for row in capacity_info],
                "last_updated": dt.datetime.utcnow().isoformat() + "Z"
            }
            
            return jsonify(dashboard_data)
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/dashboard/stats", methods=["GET"])
def get_dashboard_stats():
    """Get quick stats for dashboard widgets"""
    try:
        with get_conn() as conn:
            today = dt.date.today().isoformat()
            
            # Quick stats query
            stats = conn.execute(
                """
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN scheduled_date = ? THEN 1 ELSE 0 END) as today,
                    SUM(CASE WHEN COALESCE(status,'pending') = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                FROM appointments
                """,
                (today,)
            ).fetchone()
            
            return jsonify({
                "total": stats["total"],
                "today": stats["today"], 
                "pending": stats["pending"],
                "completed": stats["completed"]
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/uploads/images/<filename>", methods=["GET"])
def uploaded_image(filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'images')
    return send_from_directory(upload_dir, filename)

@app.route("/uploads/voices/<filename>", methods=["GET"])
def uploaded_voice(filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'voices')
    return send_from_directory(upload_dir, filename)

# ------------- PATIENT FILE SERVING ENDPOINTS -------------
@app.route("/uploads/patients/<patient_folder>/images/<filename>", methods=["GET"])
def uploaded_patient_image(patient_folder, filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'patients', patient_folder, 'images')
    return send_from_directory(upload_dir, filename)

@app.route("/uploads/patients/<patient_folder>/voices/<filename>", methods=["GET"])
def uploaded_patient_voice(patient_folder, filename):
    upload_dir = os.path.join(os.path.dirname(__file__), 'yarab', 'uploads', 'patients', patient_folder, 'voices')
    return send_from_directory(upload_dir, filename)

# ------------- STATIC FILES (STAFF REACT UI) -------------
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_staff_ui(path):
    # Don't serve index.html for API routes or uploads
    if path.startswith("api") or path.startswith("uploads"):
        abort(404)  # let API/upload routes process

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
    print("[staff] serving UI from:", STAFF_DIST)
    app.run(host="127.0.0.1", port=5001, debug=True)