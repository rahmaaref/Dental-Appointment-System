# Dental App Setup Guide

## ✅ What's Already Done

1. **Production Environment Files Created:**
   - `patient/.env.production` → `VITE_API_BASE=/api`
   - `staff/.env.production` → `VITE_API_BASE=/api`

2. **React Apps Built:**
   - `patient/dist/` → Patient app build
   - `staff/dist/` → Staff app build

3. **Flask App Templates Created:**
   - `app_patient.py` → Patient API + UI server (port 5000)
   - `app_staff.py` → Staff API + UI server (port 5001)

## 🚀 How to Run

### Step 1: Update Your Flask Apps

Replace your existing `app.py` and `app1.py` with the provided templates, or add the new code to your existing files:

**For Patient API (app.py or app_patient.py):**
```python
import os
from flask import Flask, send_from_directory

# NEW: Point to the patient React app build
PATIENT_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), 'patient', 'dist'))

app = Flask(__name__, static_folder=PATIENT_DIST, static_url_path='')

# --- your existing API routes all start with /api/... keep them as-is ---

# NEW: serve the React app (patient)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_patient_app(path):
    full_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

**For Staff API (app1.py or app_staff.py):**
```python
import os
from flask import Flask, send_from_directory

# NEW: Point to the staff React app build
STAFF_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), 'staff', 'dist'))

app = Flask(__name__, static_folder=STAFF_DIST, static_url_path='')

# --- your existing API routes under /api/... keep them as-is ---

# NEW: serve the React app (staff)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_staff_app(path):
    full_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5001)
```

### Step 2: Run the Apps

**Terminal A (Patient):**
```bash
python app.py     # or python app_patient.py
# Visit: http://localhost:5000  (Patient UI + API)
```

**Terminal B (Staff):**
```bash
python app1.py    # or python app_staff.py
# Visit: http://localhost:5001  (Staff UI + API)
```

## 🎯 What This Achieves

- **No CORS Issues**: React apps and APIs share the same origin
- **No Vite Dev Servers**: Flask serves the built React apps directly
- **Production Ready**: Optimized builds with proper routing
- **Simple Deployment**: Just run Flask apps, no separate frontend servers

## 📁 File Structure

```
Dental2/
├── patient/
│   ├── .env.production          # VITE_API_BASE=/api
│   └── dist/                    # Built React app
├── staff/
│   ├── .env.production          # VITE_API_BASE=/api
│   └── dist/                    # Built React app
├── shared/
│   └── api.ts                   # Shared API wrapper
├── app_patient.py               # Patient Flask app template
├── app_staff.py                 # Staff Flask app template
└── SETUP_GUIDE.md              # This file
```

## 🔧 Key Features

- **Patient App** (http://localhost:5000):
  - Track appointments by ticket or national_id/phone
  - Book appointments with image/voice upload
  - All API calls go to `/api/...` (same origin)

- **Staff App** (http://localhost:5001):
  - Login/logout with session cookies
  - Manage appointments (CRUD operations)
  - Set capacity limits
  - Export to CSV
  - System health monitoring
  - All API calls go to `/api/...` (same origin)

## 🐛 Troubleshooting

- **404 on routes**: Make sure you have the catch-all route (`/<path:path>`) at the end
- **Static files not loading**: Check that `static_folder` points to the correct `dist` folder
- **API calls failing**: Ensure your API routes start with `/api/` and are defined before the catch-all route
- **Build issues**: Run `npm run build` in both `patient/` and `staff/` directories

## 🔄 Rebuilding Frontend

If you make changes to the React apps:

```bash
# Rebuild patient app
cd patient && npm run build && cd ..

# Rebuild staff app  
cd staff && npm run build && cd ..
```

No need to restart Flask - the changes will be served immediately!
