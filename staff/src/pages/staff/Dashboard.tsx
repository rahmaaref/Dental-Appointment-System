import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Calendar, Users, TrendingUp, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface DashboardStats {
  total_appointments: number;
  today_appointments: number;
  pending_appointments: number;
  completed_appointments: number;
  today_capacity_used: number;
  today_capacity_total: number;
  today_capacity_percentage: number;
}

interface RecentAppointment {
  id: number;
  ticket_number: number;
  name: string;
  phone: string;
  national_id: string;
  scheduled_date: string;
  status: string;
  symptoms: string;
  created_at: string;
}

interface DashboardData {
  summary: DashboardStats;
  recent_appointments: RecentAppointment[];
  today_appointments: RecentAppointment[];
  status_counts: Array<{ status: string; count: number }>;
  daily_counts: Array<{ scheduled_date: string; count: number }>;
  capacity_info: Array<{ day_name: string; capacity: number }>;
  last_updated: string;
}

// Helper function to format time ago
const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hour${Math.floor(diffInSeconds / 3600) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;
};

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/dashboard', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch dashboard data: ${response.status}`);
      }

      const data = await response.json();
      setDashboardData(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !dashboardData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('dashboard')}</h1>
          <p className="text-slate">Loading real-time appointment analytics...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <GlassPanel key={i} className="p-6 animate-pulse">
              <div className="h-20 bg-gray-200 rounded"></div>
            </GlassPanel>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('dashboard')}</h1>
          <p className="text-red-600">Error loading dashboard data: {error}</p>
        </div>
        <GlassPanel className="p-6">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">Failed to load dashboard data</p>
            <button 
              onClick={fetchDashboardData}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  if (!dashboardData) return null;

  const { summary, recent_appointments, status_counts, daily_counts } = dashboardData;

  // Prepare chart data from real database data
  const pieData = status_counts.map(item => ({
    name: item.status === 'pending' ? t('pending') : item.status,
    value: item.count,
    color: item.status === 'pending' ? '#fbbf24' : '#34d399'
  }));

  // Convert daily_counts to weekly chart data
  const weekData = daily_counts.slice(-7).map(item => {
    const date = new Date(item.scheduled_date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      day: dayNames[date.getDay()],
      appointments: item.count
    };
  });

  // Generate hourly data from today's appointments
  const hourlyData = Array.from({ length: 9 }, (_, i) => {
    const hour = 8 + i;
    const hourStr = `${hour}:00`;
    // Count appointments created in this hour (simplified)
    const count = recent_appointments.filter(apt => {
      const createdHour = new Date(apt.created_at).getHours();
      return createdHour === hour;
    }).length;
    return { hour: hourStr, count };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Title */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('dashboard')}</h1>
            <p className="text-slate">Real-time appointment analytics and insights</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-primary ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="text-xs text-slate">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate mb-1">Today</p>
              <p className="text-3xl font-bold text-slate-dark">{summary.today_appointments}</p>
              <p className="text-xs text-slate mt-2">Appointments</p>
            </div>
            <div className="p-3 bg-primary/20 rounded-lg">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate mb-1">Total</p>
              <p className="text-3xl font-bold text-slate-dark">{summary.total_appointments}</p>
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp size={14} /> All time
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate mb-1">{t('pending')}</p>
              <p className="text-3xl font-bold text-yellow-600">{summary.pending_appointments}</p>
              <p className="text-xs text-slate mt-2">Awaiting completion</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate mb-1">{t('completed')}</p>
              <p className="text-3xl font-bold text-green-600">{summary.completed_appointments}</p>
              <p className="text-xs text-slate mt-2">All time</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <GlassPanel className="p-6" neonBorder>
          <h3 className="text-lg font-semibold text-slate-dark mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-slate">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Weekly Trend */}
        <GlassPanel className="p-6" neonBorder>
          <h3 className="text-lg font-semibold text-slate-dark mb-4">Weekly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Bar dataKey="appointments" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Hourly Distribution */}
        <GlassPanel className="p-6" neonBorder>
          <h3 className="text-lg font-semibold text-slate-dark mb-4">Today's Timeline</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="hour" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </GlassPanel>
      </div>

      {/* Recent Activity */}
      <GlassPanel className="p-6" neonBorder>
        <h3 className="text-lg font-semibold text-slate-dark mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recent_appointments.length === 0 ? (
            <div className="text-center py-8 text-slate">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No recent appointments</p>
            </div>
          ) : (
            recent_appointments.slice(0, 5).map((appointment) => {
              const createdDate = new Date(appointment.created_at);
              const timeAgo = getTimeAgo(createdDate);
              
              return (
                <div key={appointment.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${appointment.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-dark">
                        {appointment.status === 'completed' ? 'Appointment completed' : 'New appointment scheduled'}
                      </p>
                      <p className="text-xs text-slate">{appointment.name}</p>
                      <p className="text-xs text-slate">Ticket: {appointment.ticket_number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate">{timeAgo}</span>
                    <p className="text-xs text-slate">{appointment.scheduled_date}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </GlassPanel>
    </div>
  );
};

export default Dashboard;