import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { User, Lock, Globe } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import ParticleBackground from '@/components/ParticleBackground';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const Login: React.FC = () => {
  const { t, toggleLanguage, language } = useLanguage();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/staff/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const success = await login(credentials.username, credentials.password);
    
    if (success) {
      const from = location.state?.from?.pathname || '/staff/dashboard';
      navigate(from, { replace: true });
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center relative">
      <ParticleBackground />
      
      {/* Language Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        className="absolute top-4 right-4 flex items-center gap-2"
      >
        <Globe size={18} />
        {language === 'en' ? 'العربية' : 'English'}
      </Button>

      <div className="w-full max-w-md px-4 relative z-10">
        <GlassPanel className="p-8 animate-fade-in" neonBorder>
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center shadow-neon">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-dark mb-2">
              {t('login')}
            </h1>
            <p className="text-slate text-sm">
              Faculty of Dentistry
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate">
                {t('username')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
                <Input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="pl-10 bg-white/50 border-primary/30 focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder={t('username')}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
                <Input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="pl-10 bg-white/50 border-primary/30 focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder={t('password')}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full btn-futuristic"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading...
                </div>
              ) : (
                t('signIn')
              )}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-3 bg-primary/10 rounded-lg">
            <p className="text-xs text-center text-slate">
              Demo: username: <strong>admin</strong>, password: <strong>admin</strong>
            </p>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};

export default Login;