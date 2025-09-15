// CSV export functionality for staff app
export interface AppointmentData {
  id: string;
  ticket_number: string;
  name: string;
  phone: string;
  national_id?: string;  // Optional since database doesn't have this column
  created_at: string;
  scheduled_date: string;
  status: string;
  completion_hour?: string;
  symptoms: string;
  image_paths?: string[];
  voice_note_path?: string;
}

export function exportToCSV(data: AppointmentData[], filename = 'appointments.csv') {
  const headers = [
    'ID',
    'Ticket Number',
    'Name',
    'Phone',
    'National ID (Masked)',
    'Created At',
    'Scheduled Date',
    'Status',
    'Completion Hour',
    'Symptoms',
    'Image Paths',
    'Voice Note Path'
  ];

  const csvContent = [
    headers.join(','),
    ...data.map(row => [
      row.id,
      row.ticket_number,
      `"${row.name}"`,
      row.phone,
      `"${row.national_id ? maskNationalId(row.national_id) : 'N/A'}"`,
      row.created_at,
      row.scheduled_date,
      row.status,
      row.completion_hour || '—',
      `"${row.symptoms || ''}"`,
      `"${(row.image_paths || []).join(';')}"`,
      `"${row.voice_note_path || ''}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function maskNationalId(nationalId: string): string {
  if (nationalId.length <= 4) return nationalId;
  return '*'.repeat(nationalId.length - 4) + nationalId.slice(-4);
}
