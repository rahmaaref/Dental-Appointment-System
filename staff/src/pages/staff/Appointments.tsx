import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Search, Filter, Download, Edit, Trash2, CheckCircle, Clock, Calendar, ChevronLeft, ChevronRight, Image, Play, Pause, Volume2, X, Eye } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { exportToCSV, AppointmentData } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import CompletionDialog from '@/components/CompletionDialog';

interface Appointment {
  id: string;
  ticket_number: string;
  name: string;
  phone: string;
  national_id: string;
  created_at: string;
  scheduled_date: string;
  status: 'pending' | 'completed';
  completion_hour?: string;
  symptoms: string;
  image_paths?: string[];
  voice_note_path?: string;
}

interface MediaViewerState {
  isOpen: boolean;
  type: 'image' | 'voice' | null;
  urls: string[];
  currentIndex: number;
  appointmentName: string;
}

const Appointments: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState>({
    isOpen: false,
    type: null,
    urls: [],
    currentIndex: 0,
    appointmentName: ''
  });
  const [completionDialog, setCompletionDialog] = useState<{
    isOpen: boolean;
    appointmentId: string;
    appointmentName: string;
  }>({ isOpen: false, appointmentId: '', appointmentName: '' });

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchTerm,
        status: statusFilter === 'all' ? '' : statusFilter,
        date: selectedDate,
        page: page.toString(),
        pageSize: pageSize.toString(),
        sort: 'created_at:DESC'
      });

      const response = await api(`/api/appointments?${params}`);
      
      if (response.ok) {
        setAppointments(response.data.appointments || []);
        setTotalPages(response.data.totalPages || 1);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: response.error?.message || "Failed to fetch appointments",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Network error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [searchTerm, statusFilter, page, selectedDate]);

  // Date navigation helpers
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = new Date(currentDate);
    
    if (direction === 'prev') {
      newDate.setDate(currentDate.getDate() - 1);
    } else {
      newDate.setDate(currentDate.getDate() + 1);
    }
    
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Media viewer helpers
  const openImageViewer = (imagePaths: string[], appointmentName: string, nationalId: string, startIndex: number = 0) => {
    // Convert image paths to full URLs with patient folder structure
    const fullUrls = imagePaths.map(path => {
      if (path.startsWith('uploads/patients/')) {
        return `/${path}`;
      } else {
        // Legacy path - construct patient-specific path
        const patientFolder = `patient_${nationalId}`;
        const filename = path.split('/').pop();
        return `/uploads/patients/${patientFolder}/images/${filename}`;
      }
    });
    
    setMediaViewer({
      isOpen: true,
      type: 'image',
      urls: fullUrls,
      currentIndex: startIndex,
      appointmentName
    });
  };

  const openVoicePlayer = (voicePath: string, appointmentName: string, nationalId: string) => {
    // Convert voice path to full URL with patient folder structure
    let fullUrl;
    if (voicePath.startsWith('uploads/patients/')) {
      fullUrl = `/${voicePath}`;
    } else {
      // Legacy path - construct patient-specific path
      const patientFolder = `patient_${nationalId}`;
      const filename = voicePath.split('/').pop();
      fullUrl = `/uploads/patients/${patientFolder}/voices/${filename}`;
    }
    
    setMediaViewer({
      isOpen: true,
      type: 'voice',
      urls: [fullUrl],
      currentIndex: 0,
      appointmentName
    });
  };

  const closeMediaViewer = () => {
    setMediaViewer({
      isOpen: false,
      type: null,
      urls: [],
      currentIndex: 0,
      appointmentName: ''
    });
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (mediaViewer.type !== 'image') return;
    
    const newIndex = direction === 'prev' 
      ? (mediaViewer.currentIndex - 1 + mediaViewer.urls.length) % mediaViewer.urls.length
      : (mediaViewer.currentIndex + 1) % mediaViewer.urls.length;
    
    setMediaViewer(prev => ({ ...prev, currentIndex: newIndex }));
  };

  const handleExport = async () => {
    try {
      // Export current filtered results
      const params = new URLSearchParams({
        q: searchTerm,
        status: statusFilter === 'all' ? '' : statusFilter,
        date: selectedDate,
        page: '1',
        pageSize: '1000', // Get more data for export
        sort: 'created_at:DESC'
      });

      const response = await api(`/api/appointments?${params}`);
      
      if (response.ok) {
        const data = response.data.appointments || [];
        exportToCSV(data, `appointments-${new Date().toISOString().split('T')[0]}.csv`);
        toast({
          title: "Export successful",
          description: `Exported ${data.length} appointments`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Export failed",
          description: response.error?.message || "Failed to fetch appointments for export",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: "Failed to export appointments",
      });
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    if (newStatus === 'completed') {
      const appointment = appointments.find(apt => apt.id === id);
      setCompletionDialog({
        isOpen: true,
        appointmentId: id,
        appointmentName: appointment?.name || 'Unknown'
      });
    } else {
      // Handle other status updates (like marking as pending)
      try {
        const response = await api(`/api/appointments/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
          toast({
            title: "Status updated",
            description: "Appointment status updated successfully",
          });
          fetchAppointments();
        } else {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: response.error?.message || "Failed to update appointment",
          });
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: "Network error occurred",
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;

    try {
      const response = await api(`/api/appointments/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: "Appointment deleted",
          description: "Appointment deleted successfully",
        });
        fetchAppointments();
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: response.error?.message || "Failed to delete appointment",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "Network error occurred",
      });
    }
  };

  const maskNationalId = (nationalId: string): string => {
    if (nationalId.length <= 4) return nationalId;
    return '*'.repeat(nationalId.length - 4) + nationalId.slice(-4);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('appointments')}</h1>
        <p className="text-slate">Manage and track all patient appointments</p>
      </div>

      {/* Search and Filters */}
      <GlassPanel className="p-4" neonBorder>
        <div className="flex flex-col gap-4">
          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('prev')}
                className="p-2"
              >
                <ChevronLeft size={16} />
              </Button>
              <div className="text-center min-w-[200px]">
                <h3 className="text-lg font-semibold text-slate-dark">
                  {formatDateDisplay(selectedDate)}
                </h3>
                <p className="text-sm text-slate">
                  {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('next')}
                className="p-2"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="flex items-center gap-2"
            >
              <Calendar size={16} />
              Today
            </Button>
          </div>

          {/* Search and Status Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
              <Input
                type="text"
                placeholder={t('search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/50"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">{t('pending')}</SelectItem>
                <SelectItem value="completed">{t('completed')}</SelectItem>
              </SelectContent>
            </Select>
            <Button className="btn-futuristic" onClick={handleExport}>
              <Download size={18} className="mr-2" />
              {t('export')}
            </Button>
          </div>
        </div>
      </GlassPanel>

      {/* Appointments Table */}
      <GlassPanel className="overflow-hidden" neonBorder>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary/10 border-b border-primary/20">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('ticketNumber')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('name')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('phone')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">National ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('scheduledDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('status')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">Completion Hour</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">Symptoms</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">Attachments</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-dark uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/10">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate">
                    Loading appointments...
                  </td>
                </tr>
              ) : appointments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate">
                    No appointments found
                  </td>
                </tr>
              ) : (
                appointments.map((appointment) => (
                  <tr key={appointment.id} className="data-table-row-hover">
                    <td className="px-4 py-3 text-sm font-medium text-slate-dark">{appointment.ticket_number}</td>
                    <td className="px-4 py-3 text-sm text-slate-dark">{appointment.name}</td>
                    <td className="px-4 py-3 text-sm text-slate">{appointment.phone}</td>
                    <td className="px-4 py-3 text-sm text-slate">{appointment.national_id ? maskNationalId(appointment.national_id) : ''}</td>
                    <td className="px-4 py-3 text-sm text-slate">{new Date(appointment.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-slate">{new Date(appointment.scheduled_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={appointment.status === 'completed' ? 'badge-completed' : 'badge-pending'}>
                        {t(appointment.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate">
                      {appointment.completion_hour || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate max-w-xs truncate" title={appointment.symptoms}>
                      {appointment.symptoms}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {appointment.image_paths && appointment.image_paths.length > 0 && (
                          <button
                            onClick={() => openImageViewer(appointment.image_paths!, appointment.name, appointment.national_id)}
                            className="p-1 hover:bg-primary/10 rounded transition-colors"
                            title={`View ${appointment.image_paths.length} image${appointment.image_paths.length > 1 ? 's' : ''}`}
                          >
                            <Image size={16} className="text-primary" />
                          </button>
                        )}
                        {appointment.voice_note_path && (
                          <button
                            onClick={() => openVoicePlayer(appointment.voice_note_path!, appointment.name, appointment.national_id)}
                            className="p-1 hover:bg-primary/10 rounded transition-colors"
                            title="Play voice note"
                          >
                            <Volume2 size={16} className="text-primary" />
                          </button>
                        )}
                        {(!appointment.image_paths || appointment.image_paths.length === 0) && !appointment.voice_note_path && (
                          <span className="text-xs text-slate">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleStatusUpdate(appointment.id, appointment.status === 'pending' ? 'completed' : 'pending')}
                          className="p-1 hover:bg-primary/10 rounded transition-colors"
                          title={appointment.status === 'pending' ? 'Mark as completed' : 'Mark as pending'}
                        >
                          {appointment.status === 'pending' ? <CheckCircle size={16} className="text-primary" /> : <Clock size={16} className="text-primary" />}
                        </button>
                        <button 
                          onClick={() => handleDelete(appointment.id)}
                          className="p-1 hover:bg-destructive/10 rounded transition-colors"
                          title="Delete appointment"
                        >
                          <Trash2 size={16} className="text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <CompletionDialog
        isOpen={completionDialog.isOpen}
        onClose={(refresh) => {
          setCompletionDialog({ isOpen: false, appointmentId: '', appointmentName: '' });
          if (refresh) {
            fetchAppointments();
          }
        }}
        appointmentId={completionDialog.appointmentId}
        appointmentName={completionDialog.appointmentName}
      />

      {/* Media Viewer Modal */}
      <Dialog open={mediaViewer.isOpen} onOpenChange={closeMediaViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                {mediaViewer.type === 'image' ? 'Image Viewer' : 'Voice Player'} - {mediaViewer.appointmentName}
              </span>
              <Button variant="ghost" size="sm" onClick={closeMediaViewer}>
                <X size={16} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            {mediaViewer.type === 'image' && (
              <div className="relative h-[60vh] flex items-center justify-center bg-gray-50 rounded-lg">
                {mediaViewer.urls.length > 0 && (
                  <>
                    <img
                      src={mediaViewer.urls[mediaViewer.currentIndex]}
                      alt={`Image ${mediaViewer.currentIndex + 1}`}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                    
                    {/* Navigation arrows */}
                    {mediaViewer.urls.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute left-4 top-1/2 -translate-y-1/2"
                          onClick={() => navigateImage('prev')}
                        >
                          <ChevronLeft size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute right-4 top-1/2 -translate-y-1/2"
                          onClick={() => navigateImage('next')}
                        >
                          <ChevronRight size={16} />
                        </Button>
                      </>
                    )}
                    
                    {/* Image counter */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {mediaViewer.currentIndex + 1} / {mediaViewer.urls.length}
                    </div>
                  </>
                )}
              </div>
            )}
            
            {mediaViewer.type === 'voice' && (
              <div className="flex flex-col items-center justify-center h-[60vh] bg-gray-50 rounded-lg">
                <div className="text-center space-y-4">
                  <Volume2 size={48} className="text-primary mx-auto" />
                  <h3 className="text-lg font-semibold">Voice Note</h3>
                  <p className="text-slate">Click play to listen to the voice recording</p>
                  
                  <audio
                    controls
                    className="w-full max-w-md"
                    onError={(e) => {
                      console.error('Audio playback error:', e);
                    }}
                  >
                    <source src={mediaViewer.urls[0]} type="audio/webm" />
                    <source src={mediaViewer.urls[0]} type="audio/mp3" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Appointments;