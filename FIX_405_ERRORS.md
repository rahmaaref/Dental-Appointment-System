# 🔧 Fix 405 "Method Not Allowed" Errors

## 🎯 **Root Cause:**
405 errors happen when:
1. Flask route exists but doesn't allow the HTTP method (GET vs POST)
2. React form submits as GET instead of POST
3. Fetch request missing `method: "POST"`

## 🚀 **Quick Fix Steps:**

### **1. Backend: Add Proper Method Declarations**

**In `app_patient.py`** (add these routes with correct methods):

```python
# ------------- YOUR EXISTING PATIENT API & UPLOAD ROUTES -------------

@app.route("/api/patient/appointments", methods=["GET"])
def get_patient_appointments():
    # Your existing logic from yarab/app.py
    pass

@app.route("/api/patient/book", methods=["POST"])  # ← MUST specify POST
def book_appointment():
    # Your existing logic from yarab/app.py
    pass

@app.route("/api/health", methods=["GET"])
def health_check():
    # Your existing logic from yarab/app.py
    pass

@app.route("/uploads/images/<filename>", methods=["GET"])
def uploaded_image(filename):
    # Your existing upload serving logic
    pass

@app.route("/uploads/voices/<filename>", methods=["GET"])
def uploaded_voice(filename):
    # Your existing upload serving logic
    pass
```

**In `app_staff.py`** (add these routes with correct methods):

```python
# ------------- YOUR EXISTING STAFF API & UPLOAD ROUTES -------------

@app.route("/api/login/staff", methods=["POST"])  # ← MUST specify POST
def staff_login():
    # Your existing logic from yarab/app1.py
    pass

@app.route("/api/logout", methods=["POST"])  # ← MUST specify POST
def staff_logout():
    # Your existing logic from yarab/app1.py
    pass

@app.route("/api/appointments", methods=["GET"])
def get_appointments():
    # Your existing logic from yarab/app1.py
    pass

@app.route("/api/appointments/<id>", methods=["PUT", "DELETE"])  # ← Multiple methods
def update_appointment(id):
    # Your existing logic from yarab/app1.py
    pass

@app.route("/api/capacity", methods=["GET"])
@app.route("/api/capacity/<day_name>", methods=["PUT"])  # ← PUT for updates
def manage_capacity(day_name=None):
    # Your existing logic from yarab/app1.py
    pass

@app.route("/api/health", methods=["GET"])
def health_check():
    # Your existing logic from yarab/app1.py
    pass

@app.route("/uploads/images/<filename>", methods=["GET"])
def uploaded_image(filename):
    # Your existing upload serving logic
    pass

@app.route("/uploads/voices/<filename>", methods=["GET"])
def uploaded_voice(filename):
    # Your existing upload serving logic
    pass
```

### **2. Frontend: Fix React Forms**

**Patient Booking Form** (`patient/src/components/RegisterAppointment.tsx`):

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault(); // ← CRITICAL: Prevent default form submission
  
  // Validation...
  
  const data = new FormData();
  data.append('name', formData.name);
  data.append('phone', formData.phone);
  data.append('national_id', formData.nationalId);
  if (formData.symptoms) data.append('symptoms', formData.symptoms);
  if (imageFile) data.append('image', imageFile);
  if (voiceFile) data.append('voice', voiceFile);

  const response = await api('/api/patient/book', {
    method: 'POST', // ← CRITICAL: Specify POST method
    body: data, // FormData for multipart
  });
  
  // Handle response...
};
```

**Staff Login Form** (`staff/src/pages/Login.tsx`):

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault(); // ← CRITICAL: Prevent default form submission
  
  const response = await api('/api/login/staff', {
    method: 'POST', // ← CRITICAL: Specify POST method
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials), // JSON body
  });
  
  // Handle response...
};
```

**Staff API Calls** (all staff API calls need cookies):

```typescript
// All staff API calls must include credentials
const response = await api('/api/appointments', {
  method: 'GET',
  // credentials: 'include' is handled by the shared API wrapper
});

const response = await api(`/api/appointments/${id}`, {
  method: 'PUT', // ← Specify method for updates
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ status: newStatus }),
});

const response = await api(`/api/appointments/${id}`, {
  method: 'DELETE', // ← Specify method for deletes
});
```

### **3. Test with curl Commands**

**Test Patient Booking:**
```bash
curl -i -X POST http://localhost:5000/api/patient/book \
  -F "name=Test User" \
  -F "phone=01234567890" \
  -F "national_id=12345678901234" \
  -F "symptoms=tooth pain"
```

**Test Staff Login:**
```bash
curl -i -X POST http://localhost:5001/api/login/staff \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Both should return 200/4xx JSON, NOT 405.

### **4. Browser DevTools Check**

1. **Open DevTools → Network tab**
2. **Submit a form**
3. **Check the request:**
   - Method should be `POST` (not GET)
   - URL should be `/api/...` on same origin
   - Request body should contain data

### **5. Common Gotchas to Fix**

**❌ Wrong:**
```typescript
// Missing preventDefault
const handleSubmit = async (e: React.FormEvent) => {
  // Browser does GET submit
};

// Missing method
const response = await fetch('/api/patient/book', {
  body: data, // Defaults to GET
});

// Wrong content type for FormData
const response = await fetch('/api/patient/book', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }, // Wrong for FormData
  body: formData,
});
```

**✅ Correct:**
```typescript
// Proper form handling
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault(); // Prevent default
  const response = await fetch('/api/patient/book', {
    method: 'POST', // Specify method
    body: formData, // No Content-Type header for FormData
  });
};

// Proper JSON handling
const response = await fetch('/api/login/staff', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

## 🧪 **Verification Checklist:**

- [ ] **Flask routes** have correct `methods=["POST"]` declarations
- [ ] **React forms** call `e.preventDefault()`
- [ ] **Fetch requests** specify `method: "POST"`
- [ ] **FormData** requests don't set Content-Type header
- [ ] **JSON requests** set Content-Type: application/json
- [ ] **Staff requests** include credentials for cookies
- [ ] **curl tests** return 200/4xx (not 405)
- [ ] **Browser Network tab** shows POST requests

## 🎯 **Expected Results:**

- ✅ **No 405 errors** in browser console
- ✅ **POST requests** in Network tab
- ✅ **API calls work** (create/update/delete operations)
- ✅ **Forms submit properly** without page refresh
- ✅ **Database updates** when creating/editing data

**Fix these issues and your 405 errors will disappear!**
