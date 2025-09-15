import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, 
  Calendar, 
  Settings, 
  FileText, 
  Heart,
  LogOut,
  Menu,
  X,
  Globe
} from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import ParticleBackground from '@/components/ParticleBackground';
import { Button } from '@/components/ui/button';

const StaffLayout: React.FC = () => {
  const { t, toggleLanguage, language, dir } = useLanguage();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/staff/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/staff/appointments', label: t('appointments'), icon: Calendar },
    { path: '/staff/capacity', label: t('capacity'), icon: Settings },
    { path: '/staff/reports', label: t('reports'), icon: FileText },
    { path: '/staff/health', label: t('health'), icon: Heart },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gradient-mesh relative">
      <ParticleBackground />
      
      {/* Header */}
      <GlassPanel className="fixed top-0 left-0 right-0 h-16 z-40 rounded-none border-b border-primary/20" solid>
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-primary/10 rounded-lg transition-colors"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="text-xl font-bold text-slate-dark">
              {t('welcome')} {user?.username}
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="flex items-center gap-2"
            >
              <Globe size={18} />
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2 text-destructive hover:text-destructive/80"
            >
              <LogOut size={18} />
              {t('logout')}
            </Button>
          </div>
        </div>
      </GlassPanel>

      {/* Desktop Navigation Tabs */}
      <div className="hidden lg:block fixed top-16 left-0 right-0 z-30 px-4 pt-4">
        <GlassPanel className="flex gap-2 p-2" neonBorder>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-neon'
                    : 'hover:bg-primary/10 text-slate'
                }`
              }
            >
              <item.icon size={18} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </GlassPanel>
      </div>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 ${dir === 'rtl' ? 'right-0' : 'left-0'} z-50 w-64 transform transition-transform duration-300 lg:hidden ${
          sidebarOpen ? 'translate-x-0' : dir === 'rtl' ? 'translate-x-full' : '-translate-x-full'
        }`}
      >
        <GlassPanel className="h-full rounded-none" solid>
          <div className="p-4 border-b border-primary/20">
            <h2 className="text-lg font-bold text-slate-dark">{t('dashboard')}</h2>
          </div>
          <nav className="p-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-neon'
                      : 'hover:bg-primary/10 text-slate'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </GlassPanel>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="pt-32 lg:pt-36 px-4 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default StaffLayout;