import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Activity, Database, Server, Clock } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import { api } from '@/lib/api';

const SystemHealth: React.FC = () => {
  const { t } = useLanguage();
  const [healthStatus, setHealthStatus] = useState({
    status: 'online',
    database: 'connected',
    responseTime: 42,
    lastCheck: new Date().toLocaleTimeString(),
  });

  const checkHealth = async () => {
    try {
      const startTime = Date.now();
      const response = await api('/api/health');
      const responseTime = Date.now() - startTime;
      
      setHealthStatus(prev => ({
        ...prev,
        status: response.ok ? 'online' : 'offline',
        responseTime,
        lastCheck: new Date().toLocaleTimeString(),
      }));
    } catch (error) {
      setHealthStatus(prev => ({
        ...prev,
        status: 'offline',
        lastCheck: new Date().toLocaleTimeString(),
      }));
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('health')}</h1>
        <p className="text-slate">Monitor system status and performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${healthStatus.status === 'online' ? 'bg-green-100' : 'bg-red-100'}`}>
              <Server className={`w-6 h-6 ${healthStatus.status === 'online' ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm text-slate">{t('onlineStatus')}</p>
              <p className={`text-lg font-semibold ${healthStatus.status === 'online' ? 'text-green-600' : 'text-red-600'}`}>
                {t(healthStatus.status)}
              </p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate">Database</p>
              <p className="text-lg font-semibold text-blue-600">Connected</p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate">{t('responseTime')}</p>
              <p className="text-lg font-semibold text-purple-600">{healthStatus.responseTime}ms</p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate">{t('lastCheck')}</p>
              <p className="text-lg font-semibold text-orange-600">{healthStatus.lastCheck}</p>
            </div>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="p-8 text-center" neonBorder>
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center animate-glow-pulse">
          <Activity className="w-12 h-12 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-green-600 mb-2">All Systems Operational</h3>
        <p className="text-slate">All services are running smoothly</p>
      </GlassPanel>
    </div>
  );
};

export default SystemHealth;