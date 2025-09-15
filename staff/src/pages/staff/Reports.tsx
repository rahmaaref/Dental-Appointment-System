import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Download, FileText, TrendingUp } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import { Button } from '@/components/ui/button';

const Reports: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('reports')}</h1>
        <p className="text-slate">Generate and export appointment reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassPanel className="p-6" neonBorder>
          <FileText className="w-12 h-12 text-primary mb-4" />
          <h3 className="text-lg font-semibold text-slate-dark mb-2">Appointments Report</h3>
          <p className="text-sm text-slate mb-4">Export all appointments with filters</p>
          <div className="flex gap-2">
            <Button className="btn-futuristic" size="sm">
              <Download size={16} className="mr-2" />
              CSV
            </Button>
            <Button className="btn-glass" size="sm">
              <Download size={16} className="mr-2" />
              Excel
            </Button>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" neonBorder>
          <TrendingUp className="w-12 h-12 text-green-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-dark mb-2">Analytics Report</h3>
          <p className="text-sm text-slate mb-4">Performance metrics and trends</p>
          <Button className="btn-futuristic" size="sm">
            <Download size={16} className="mr-2" />
            Generate Report
          </Button>
        </GlassPanel>
      </div>
    </div>
  );
};

export default Reports;