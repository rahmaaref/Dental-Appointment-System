import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import GlassPanel from '@/components/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

interface DayCapacity {
  day: string;
  capacity: number;
}

const Capacity: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [capacities, setCapacities] = useState<DayCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCapacity = async () => {
    try {
      const response = await api('/api/capacity');
      if (response.ok) {
        setCapacities(response.data);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch capacity data",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapacity();
  }, []);

  const handleSave = async (day: string) => {
    try {
      const capacity = capacities.find(c => c.day === day)?.capacity || 0;
      const response = await api(`/api/capacity/${day}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ capacity }),
      });

      if (response.ok) {
        toast({
          title: "Capacity Updated",
          description: `${t(day)} capacity has been updated successfully`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: response.error?.message || "Failed to update capacity",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Network error occurred",
      });
    }
  };

  const updateCapacity = (day: string, value: number) => {
    setCapacities(prev => 
      prev.map(item => 
        item.day === day ? { ...item, capacity: value } : item
      )
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-dark mb-2">{t('capacity')}</h1>
        <p className="text-slate">Set daily appointment limits (0 = unlimited)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {capacities.map((item) => (
          <GlassPanel key={item.day} className="p-6" neonBorder>
            <h3 className="text-lg font-semibold text-slate-dark mb-4">{t(item.day)}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={item.capacity}
                  onChange={(e) => updateCapacity(item.day, parseInt(e.target.value) || 0)}
                  className="bg-white/50"
                />
                <span className="text-sm text-slate whitespace-nowrap">
                  {item.capacity === 0 ? t('unlimited') : t('appointmentsPerDay')}
                </span>
              </div>
              <Button 
                onClick={() => handleSave(item.day)}
                className="w-full btn-futuristic"
                size="sm"
              >
                <Save size={16} className="mr-2" />
                {t('save')}
              </Button>
            </div>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="p-6 bg-yellow-50/50" neonBorder>
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> If no capacity is set for a day, the patient portal will default to 10 appointments per day.
        </p>
      </GlassPanel>
    </div>
  );
};

export default Capacity;