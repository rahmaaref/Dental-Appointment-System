# Faculty of Dentistry Appointment system - Minimal Flask API + Dashboards

Small, reliable Flask app connecting provided HTML dashboards to an existing SQLite DB.

- Python: 3.11+
- Stack: Flask, sqlite3, python-dotenv
- DB: `./dental_appointments.db` (existing; do not change schema)
- App root serves `templates/` and `static/`
  - Place your logo at `static/logo.png`

## Environment

Create `.env` in project root with:

```
FLASK_SECRET=change-me
STAFF_USER=admin
STAFF_PASS=admin123
DB_PATH=./dental_appointments.db
ALLOWED_ORIGINS=http://localhost:5000
```

## Setup and Run (Windows PowerShell)

1) Create venv
```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Install
```
pip install -r requirements.txt
```

3) Run (two separate apps)

- Patient app (public):
```
set FLASK_APP=app.py
flask run --port 5000
```
Open `http://localhost:5000/` for patient page.

- Staff app (internal):
```
set FLASK_APP=app1.py
flask run --port 5001
```
Open `http://localhost:5001/login` for staff login and `/staff` dashboard.

## Endpoints (Overview)

Patient app (port 5000):
- Pages: `/` (patient)
- Patient: `GET /api/patient/appointments?ticket=...` or `?national_id=...&phone=&date=` (not both)
- Patient: `POST /api/patient/book` (JSON or multipart with `image`, `voice`); assigns earliest available date automatically
- Health: `GET /api/health`

Staff app (port 5001):
- Pages: `/login`, `/staff`
- Auth: `POST /api/login/staff`, `POST /api/logout`
- Staff Appointments: `GET/POST/PUT/DELETE /api/appointments`
- Capacity: `GET /api/capacity`, `PUT /api/capacity/{day_name}`
- Health: `GET /api/health`

## What’s Done

- Separated apps: `app.py` (patient-only), `app1.py` (staff-only).
- Patient page shows two options: track appointments by ID; register new appointment.
- Auto-assigns earliest available date after patient submission and saves optional image/voice uploads.
- Staff dashboard and APIs preserved in `app1.py`.

## Next Up (handoff plan)

1. Finalize README screenshots.

## Notes

- No schema changes allowed; all logic respects existing tables.
- Sorting whitelist: `created_at`, `scheduled_date`, `status`, `name`.
- Capacity keys: `Monday..Sunday`. Ticket = `YYYYMMDD + per-day seq (001..) + last4` of National ID.
- Static serving for uploads via `/uploads/...` (images under `uploads/images/`, voices under `uploads/voices/`).

## Recent Changes (Edits)

- Branding
  - Updated titles and headers to “Faculty of Dentistry Appointment system”.
  - Added logo usage across pages; increased logo size.

- Staff app (port 5001)
  - UI refactor: simplified master-detail layout with a searchable list and details panel.
  - Sorting: added dropdown to sort by submission time (`created_at` asc/desc).
  - Status controls: in details, buttons to mark as Pending or Completed.
    - On Completed, staff is prompted to enter procedures; these are appended to `symptoms`.
  - Media viewing: images display inline; voice notes are playable via audio control.
  - Removed ability to create new appointments from the staff UI.

- Patient app (port 5000)
  - Booking: shows a centered confirmation modal with assigned date and ticket, dismissible with X.
  - Uploads: supports image and voice uploads.
  - Recording: added in-browser voice recording; the recorded audio is attached automatically to the form as the voice file.
  - Tracking: simplified “Track My Appointments” (removed date field; optional phone retained). Supports searching by Ticket Number or National ID (mutually exclusive).
  - Header cleanup: removed Home/About/Services/Contact.
  - Location: added section with embedded Google Map.
  - Transcription removed for now.

- Login
  - Admin login page simplified to admin-only; patient login removed from that page.

Validations and booking rules
- Phone must be 11 digits; National ID must be 14 digits.
- Duplicate prevention: a patient (phone + last 4 of national ID) cannot book if an existing appointment is not completed (API returns 409 with a clear message).

Notes
- No DB schema changes were made.
