"use strict";

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function toast(msg, ms = 2500) {
  const el = qs('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), ms);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  // Handle redirect responses triggered by Flask during fetch
  if (res.redirected) {
    window.location.href = res.url;
    return;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return { json: await res.json(), status: res.status };
  return { text: await res.text(), status: res.status };
}

function setupTabs() {
  const staffBtn = qs('#tab-staff');
  const patientBtn = qs('#tab-patient');
  const staffPanel = qs('#panel-staff');
  const patientPanel = qs('#panel-patient');
  if (!staffBtn || !patientBtn) return;
  staffBtn.addEventListener('click', () => {
    staffBtn.classList.add('border-teal-600','text-teal-600');
    staffBtn.classList.remove('text-gray-500','border-transparent');
    patientBtn.classList.remove('border-teal-600','text-teal-600');
    patientBtn.classList.add('text-gray-500','border-transparent');
    staffPanel.classList.remove('hidden');
    patientPanel.classList.add('hidden');
  });
  patientBtn.addEventListener('click', () => {
    patientBtn.classList.add('border-teal-600','text-teal-600');
    patientBtn.classList.remove('text-gray-500','border-transparent');
    staffBtn.classList.remove('border-teal-600','text-teal-600');
    staffBtn.classList.add('text-gray-500','border-transparent');
    patientPanel.classList.remove('hidden');
    staffPanel.classList.add('hidden');
  });
}

function setupStaffLogin() {
  const form = qs('#staff-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      username: formData.get('username'),
      password: formData.get('password')
    };
    const { json, status } = await api('/api/login/staff', { method: 'POST', body: JSON.stringify(payload) });
    if (!json && status >= 200 && status < 400) return; // redirect handled
    if (status >= 400) {
      toast(json?.error?.message || 'Login failed');
    }
  });
}

function renderMatches(matches) {
  const wrap = qs('#patient-matches');
  const list = qs('#matches-list');
  if (!wrap || !list) return;
  list.innerHTML = '';
  matches.forEach((m) => {
    const li = document.createElement('li');
    li.className = 'border rounded p-2 flex items-center justify-between';
    const left = document.createElement('div');
    left.className = 'text-sm';
    left.textContent = `Ticket ${m.ticket_number} · ${m.scheduled_date} · ${m.status}`;
    const btn = document.createElement('button');
    btn.className = 'px-3 py-1 rounded bg-teal-600 text-white text-sm';
    btn.textContent = 'Use this';
    btn.addEventListener('click', () => {
      // Set session by making a minimal POST again with same filters but narrowed by date
      // The server will set session when single row resolved
      const payload = { national_id: String(m.ticket_number).slice(-4), date: m.scheduled_date };
      api('/api/login/patient', { method: 'POST', body: JSON.stringify(payload) });
    });
    li.appendChild(left);
    li.appendChild(btn);
    list.appendChild(li);
  });
  wrap.classList.remove('hidden');
}

function setupPatientLogin() {
  const form = qs('#patient-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      national_id: formData.get('national_id'),
      phone: formData.get('phone') || undefined,
      date: formData.get('date') || undefined,
    };
    const { json, status } = await api('/api/login/patient', { method: 'POST', body: JSON.stringify(payload) });
    if (!json && status >= 200 && status < 400) return; // redirect handled
    if (status === 200 && json?.data?.matches?.length) {
      renderMatches(json.data.matches);
      toast('Select your appointment');
    } else if (status >= 400) {
      toast(json?.error?.message || 'Not found');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupStaffLogin();
  setupPatientLogin();
  if (location.pathname.endsWith('/staff')) initStaffPage();
  if (location.pathname === '/' || location.pathname.endsWith('/patient')) initPatientPage();
});

// STAFF PAGE WIRING
function splitSymptoms(text) {
  if (!text) return ['', ''];
  const idx = String(text).indexOf('\n\nProcedures:\n');
  if (idx === -1) return [text, ''];
  return [text.slice(0, idx), text.slice(idx + '\n\nProcedures:\n'.length)];
}
function todayYMD() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function fetchAppointments(params = {}) {
  const q = new URLSearchParams({ page: '1', pageSize: '20', sort: 'created_at:desc', ...params });
  const { json, status } = await api(`/api/appointments?${q.toString()}`);
  if (status === 403) { window.location.href = '/login'; return { items: [] }; }
  if (json?.ok) return json.data;
  toast(json?.error?.message || 'Failed to load appointments');
  return { items: [] };
}

async function fetchAppointmentById(id) {
  const { json, status } = await api(`/api/appointments/${id}`);
  if (status === 403) { window.location.href = '/login'; return null; }
  if (json?.ok) return json.data;
  toast(json?.error?.message || 'Failed to load details');
  return null;
}

function renderAppointments(data) {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (data.items || []).forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'bg-white border-b hover:bg-gray-50 cursor-pointer';
    tr.dataset.id = String(r.id);
    const statusBadge = (s) => {
      const map = { confirmed: 'bg-green-100 text-green-800', pending: 'bg-yellow-100 text-yellow-800', cancelled: 'bg-red-100 text-red-800', completed: 'bg-blue-100 text-blue-800' };
      const cls = map[String(s||'pending').toLowerCase()] || 'bg-gray-100 text-gray-800';
      return `<span class="px-2 py-1 text-xs font-medium rounded-full ${cls}">${s || 'pending'}</span>`;
    };
    tr.innerHTML = `
      <td class="px-6 py-4 font-medium text-[var(--primary-color)]">#${r.ticket_number}</td>
      <td class="px-6 py-4 font-medium text-[var(--text-primary)]">${r.name || ''}</td>
      <td class="px-6 py-4 text-[var(--text-secondary)]">${r.phone || ''}</td>
      <td class="px-6 py-4 text-[var(--text-secondary)]">${r.scheduled_date || ''}</td>
      <td class="px-6 py-4 text-[var(--text-secondary)]"></td>
      <td class="px-6 py-4">${statusBadge(r.status)}</td>
      <td class="px-6 py-4 text-right">
        <button class="px-2 py-1 text-sm text-teal-700 hover:underline" data-action="edit" data-id="${r.id}">Edit</button>
        <button class="px-2 py-1 text-sm text-red-700 hover:underline" data-action="cancel" data-id="${r.id}">Cancel</button>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    const row = e.target.closest('tr[data-id]');
    const id = Number(btn?.dataset.id || row?.dataset.id);
    if (!btn) {
      if (!Number.isFinite(id)) return;
      const detail = await fetchAppointmentById(id);
      if (detail) renderDetails(detail);
      return;
    }
    if (btn.dataset.action === 'cancel') {
      if (!confirm('Cancel this appointment?')) return;
      const { json, status } = await api(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' })});
      if (json?.ok) { toast('Cancelled'); initStaffPage(); } else { toast(json?.error?.message || 'Cancel failed'); }
    } else if (btn.dataset.action === 'edit') {
      const newStatus = prompt('Update status (pending/confirmed/completed/cancelled):', 'confirmed');
      const newDate = prompt('Update date (YYYY-MM-DD) or leave empty:', '');
      const payload = {};
      if (newStatus) payload.status = newStatus;
      if (newDate) payload.scheduled_date = newDate;
      const { json, status } = await api(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (json?.ok) { toast('Updated'); initStaffPage(); } else { toast(json?.error?.message || 'Update failed'); }
    }
  });
}

function renderDetails(a) {
  const pane = document.querySelector('#details-content');
  if (!pane) return;
  const [sym, proc] = splitSymptoms(a.symptoms);
  const statusLower = String(a.status || 'pending').toLowerCase();
  pane.innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div><div class="text-[var(--text-secondary)]">Ticket #</div><div class="font-medium">#${a.ticket_number || ''}</div></div>
      <div><div class="text-[var(--text-secondary)]">Status</div><div class="font-medium">${a.status || 'pending'}</div></div>
      <div><div class="text-[var(--text-secondary)]">Name</div><div class="font-medium">${a.name || ''}</div></div>
      <div><div class="text-[var(--text-secondary)]">Phone</div><div class="font-medium">${a.phone || ''}</div></div>
      <div><div class="text-[var(--text-secondary)]">Scheduled Date</div><div class="font-medium">${a.scheduled_date || ''}</div></div>
    </div>
    ${statusLower === 'completed' ? '' : `<div class="flex gap-2 mt-3">
      <button class="px-3 py-1.5 rounded bg-yellow-600 text-white text-sm" data-action="mark-pending" data-id="${a.id}">Mark Pending</button>
      <button class="px-3 py-1.5 rounded bg-blue-700 text-white text-sm" data-action="mark-completed" data-id="${a.id}">Mark Completed</button>
    </div>`}
    <div>
      <div class="text-[var(--text-secondary)] mb-1">Symptoms</div>
      <div class="bg-gray-50 rounded p-3 whitespace-pre-wrap">${sym || ''}</div>
    </div>
    ${proc ? `<div><div class="text-[var(--text-secondary)] mb-1">Procedures</div><div class="bg-gray-50 rounded p-3 whitespace-pre-wrap">${proc}</div></div>` : ''}
    ${a.image_paths ? `<div><div class="text-[var(--text-secondary)] mb-1">Image</div><img src="/${a.image_paths}" alt="upload" class="max-w-full rounded border" /></div>` : ''}
    ${a.voice_note_path ? `<div><div class="text-[var(--text-secondary)] mb-1">Voice</div><audio controls src="/${a.voice_note_path}" class="w-full"></audio></div>` : ''}
  `;

  // Status change handlers
  const makeUpdate = async (id, status) => {
    let payload = { status };
    if (status === 'completed') {
      const procedures = prompt('List procedures done (will be appended to symptoms):', '');
      if (procedures) payload.symptoms = (sym ? (sym + '\n\nProcedures:\n') : 'Procedures:\n') + procedures;
    }
    const { json } = await api(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (json?.ok) { toast('Status updated'); renderDetails(json.data); initStaffPage(); } else { toast(json?.error?.message || 'Update failed'); }
  };
  pane.querySelector('[data-action="mark-pending"]')?.addEventListener('click', (e) => makeUpdate(e.currentTarget.dataset.id, 'pending'));
  pane.querySelector('[data-action="mark-completed"]')?.addEventListener('click', (e) => makeUpdate(e.currentTarget.dataset.id, 'completed'));
}

async function initStaffPage() {
  // Load default (today)
  const sortSelect = document.getElementById('sort-select');
  const dateSelect = document.getElementById('date-select');
  const params = { date: todayYMD(), sort: sortSelect?.value || 'created_at:desc' };
  if (dateSelect) {
    dateSelect.value = todayYMD();
  }
  // Hook search input if present (first input in filters)
  const search = document.querySelector('input[placeholder="Search appointments..."]');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const data = await fetchAppointments({ ...params, q: search.value });
        renderAppointments(data);
      }, 250);
    });
  }
  // New Appointment option removed
  if (sortSelect) {
    sortSelect.addEventListener('change', async () => {
      const data = await fetchAppointments({ ...params, date: dateSelect?.value || params.date, sort: sortSelect.value });
      renderAppointments(data);
    });
  }
  if (dateSelect) {
    dateSelect.addEventListener('change', async () => {
      const data = await fetchAppointments({ ...params, date: dateSelect.value, sort: sortSelect?.value || params.sort });
      renderAppointments(data);
    });
  }
  const data = await fetchAppointments({ ...params, date: dateSelect?.value || params.date });
  renderAppointments(data);
}

// PATIENT PAGE WIRING
async function initPatientPage() {
  // TRACK: fetch by national id (+ optional phone/date)
  const trackForm = document.querySelector('#track-form');
  if (trackForm) {
    trackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(trackForm);
      const params = new URLSearchParams();
      if (fd.get('ticket')) {
        params.set('ticket', fd.get('ticket'));
      } else {
        params.set('national_id', fd.get('national_id'));
        if (fd.get('phone')) params.set('phone', fd.get('phone'));
        if (fd.get('date')) params.set('date', fd.get('date'));
      }
      const { json } = await api(`/api/patient/appointments?${params.toString()}`);
      const wrap = document.querySelector('#track-results');
      if (json?.ok) {
        const items = json.data || [];
        wrap.innerHTML = items.length ? items.map(a => {
          const [sym, proc] = splitSymptoms(a.symptoms);
          return `<div class="border rounded p-3 text-sm">Ticket ${a.ticket_number} · ${a.scheduled_date} · ${a.status || 'pending'}<br>${sym || ''}${proc ? `<br><strong>Procedures:</strong><br>${proc}` : ''}</div>`;
        }).join('') : '<div class="text-sm text-gray-500">No matching appointments.</div>';
      } else {
        wrap.innerHTML = '<div class="text-sm text-red-600">Failed to load.</div>';
      }
    });
  }

  // BOOK: submit multipart form
  const bookForm = document.querySelector('#book-form');
  // Voice recording controls and transcription
  let recordedBlob = null;
  let mediaRecorder = null;
  let chunks = [];
  const recStart = document.getElementById('record-start');
  const recStop = document.getElementById('record-stop');
  const recPreview = document.getElementById('record-audio');
  const symptomsEl = document.getElementById('book-symptoms');

  if (recStart && recStop) {
    recStart.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
          recordedBlob = new Blob(chunks, { type: 'audio/webm' });
          if (recPreview) {
            recPreview.src = URL.createObjectURL(recordedBlob);
            recPreview.classList.remove('hidden');
          }
          // Attach to file input so it's included even without JS FormData override
          const voiceInput = document.getElementById('book-voice');
          if (voiceInput && recordedBlob) {
            const file = new File([recordedBlob], 'recording.webm', { type: 'audio/webm' });
            const dt = new DataTransfer();
            dt.items.add(file);
            voiceInput.files = dt.files;
          }
        };
        mediaRecorder.start();
        toast('Recording...');
      } catch (err) {
        toast('Mic permission denied');
      }
    });
    recStop.addEventListener('click', () => {
      try { mediaRecorder?.stop(); toast('Recording stopped'); } catch {}
    });
  }

  // Transcription removed per request
  if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(bookForm);
      if (recordedBlob) fd.set('voice', recordedBlob, 'recording.webm');
      const res = await fetch('/api/patient/book', { method: 'POST', body: fd, credentials: 'include' });
      if (res.redirected) { window.location.href = res.url; return; }
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        const modal = document.getElementById('book-modal');
        const msg = document.getElementById('book-modal-msg');
        const closeBtn = document.getElementById('book-modal-close');
        if (modal && msg && closeBtn) {
          msg.textContent = `Your reservation is scheduled for ${json.data.scheduled_date}. Ticket #${json.data.ticket_number}.`;
          modal.classList.remove('hidden');
          const hide = () => modal.classList.add('hidden');
          closeBtn.addEventListener('click', hide, { once: true });
          modal.querySelector('.absolute.inset-0.bg-black\\/50')?.addEventListener('click', hide, { once: true });
        } else {
          toast(`Booked! Ticket ${json.data.ticket_number} on ${json.data.scheduled_date}`);
        }
        bookForm.reset();
      } else {
        toast(json?.error?.message || 'Booking failed');
      }
    });
  }
}
