import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
}

const translations = {
  en: {
    'dashboard': 'Dashboard',
    'appointments': 'Appointments',
    'capacity': 'Capacity Manager',
    'reports': 'Reports & Export',
    'health': 'System Health',
    'logout': 'Logout',
    'login': 'Staff Login',
    'username': 'Username',
    'password': 'Password',
    'signIn': 'Sign In',
    'welcome': 'Welcome to Dental Staff Portal',
    'search': 'Search...',
    'filter': 'Filter',
    'export': 'Export',
    'status': 'Status',
    'pending': 'Pending',
    'completed': 'Completed',
    'actions': 'Actions',
    'edit': 'Edit',
    'delete': 'Delete',
    'save': 'Save',
    'cancel': 'Cancel',
    'name': 'Name',
    'phone': 'Phone',
    'nationalId': 'National ID',
    'createdAt': 'Created At',
    'scheduledDate': 'Scheduled Date',
    'symptoms': 'Symptoms',
    'attachments': 'Attachments',
    'ticketNumber': 'Ticket Number',
    'markComplete': 'Mark Complete',
    'markPending': 'Mark Pending',
    'reschedule': 'Reschedule',
    'totalAppointments': 'Total Appointments',
    'thisWeek': 'This Week',
    'thisMonth': 'This Month',
    'onlineStatus': 'System Status',
    'online': 'Online',
    'offline': 'Offline',
    'responseTime': 'Response Time',
    'lastCheck': 'Last Check',
    'monday': 'Monday',
    'tuesday': 'Tuesday',
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday',
    'sunday': 'Sunday',
    'unlimited': 'Unlimited',
    'capacityLabel': 'Capacity',
    'appointmentsPerDay': 'appointments/day',
  },
  ar: {
    'dashboard': 'لوحة التحكم',
    'appointments': 'المواعيد',
    'capacity': 'إدارة السعة',
    'reports': 'التقارير والتصدير',
    'health': 'صحة النظام',
    'logout': 'تسجيل الخروج',
    'login': 'تسجيل دخول الموظفين',
    'username': 'اسم المستخدم',
    'password': 'كلمة المرور',
    'signIn': 'تسجيل الدخول',
    'welcome': 'مرحباً بك في بوابة موظفي طب الأسنان',
    'search': 'بحث...',
    'filter': 'تصفية',
    'export': 'تصدير',
    'status': 'الحالة',
    'pending': 'قيد الانتظار',
    'completed': 'مكتمل',
    'actions': 'الإجراءات',
    'edit': 'تعديل',
    'delete': 'حذف',
    'save': 'حفظ',
    'cancel': 'إلغاء',
    'name': 'الاسم',
    'phone': 'الهاتف',
    'nationalId': 'رقم الهوية',
    'createdAt': 'تاريخ الإنشاء',
    'scheduledDate': 'الموعد المحدد',
    'symptoms': 'الأعراض',
    'attachments': 'المرفقات',
    'ticketNumber': 'رقم التذكرة',
    'markComplete': 'وضع علامة مكتمل',
    'markPending': 'وضع علامة قيد الانتظار',
    'reschedule': 'إعادة جدولة',
    'totalAppointments': 'إجمالي المواعيد',
    'thisWeek': 'هذا الأسبوع',
    'thisMonth': 'هذا الشهر',
    'onlineStatus': 'حالة النظام',
    'online': 'متصل',
    'offline': 'غير متصل',
    'responseTime': 'وقت الاستجابة',
    'lastCheck': 'آخر فحص',
    'monday': 'الإثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'unlimited': 'غير محدود',
    'capacityLabel': 'السعة',
    'appointmentsPerDay': 'موعد/يوم',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'en';
  });

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'ar' : 'en'));
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations['en']] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, dir, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};