import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface User {
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Session timeout (30 minutes of inactivity)
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Check if we have stored auth info
      const storedAuth = localStorage.getItem('staff_auth');
      if (storedAuth) {
        const { username, role, timestamp } = JSON.parse(storedAuth);
        
        // Check if session is still valid (24 hours)
        const sessionAge = Date.now() - timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (sessionAge < maxAge) {
          // Verify with backend
          const response = await api('/api/auth/verify');
          if (response.ok) {
            setUser({ username, role });
            setIsAuthenticated(true);
            return;
          }
        }
      }
      
      // If we get here, session is invalid
      localStorage.removeItem('staff_auth');
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('staff_auth');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await api('/api/login/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const userData = { username, role: 'staff' };
        setUser(userData);
        setIsAuthenticated(true);
        
        // Store auth info in localStorage
        localStorage.setItem('staff_auth', JSON.stringify({
          ...userData,
          timestamp: Date.now()
        }));
        
        toast({
          title: "Login successful",
          description: "Welcome to the Staff Portal",
        });
        
        return true;
      } else {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: response.error?.message || "Invalid username or password",
        });
        return false;
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: "Network error occurred",
      });
      return false;
    }
  }, [toast]);

  const logout = useCallback(async () => {
    try {
      await api('/api/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call success
      localStorage.removeItem('staff_auth');
      setUser(null);
      setIsAuthenticated(false);
      
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    }
  }, [toast]);

  // Activity tracking
  useEffect(() => {
    const updateActivity = () => setLastActivity(Date.now());
    
    // Track user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, []);

  // Session timeout check
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSessionTimeout = () => {
      const now = Date.now();
      if (now - lastActivity > SESSION_TIMEOUT) {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "You have been logged out due to inactivity",
        });
        logout();
      }
    };

    const interval = setInterval(checkSessionTimeout, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isAuthenticated, lastActivity, SESSION_TIMEOUT, logout, toast]);

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
