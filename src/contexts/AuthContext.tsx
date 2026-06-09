import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const roleFromToken = (token: string): string | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
};

const mergeUserRole = (user: User | null, token: string | null): User | null => {
  if (!user) return null;
  if (user.role) return user;
  const role = token ? roleFromToken(token) : null;
  return role ? { ...user, role } : user;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUserRaw = localStorage.getItem('user');

      let storedUser: User | null = null;
      if (storedUserRaw) {
        try {
          storedUser = JSON.parse(storedUserRaw) as User;
        } catch {
          storedUser = null;
        }
      }

      if (storedUser) {
        setUser(mergeUserRole(storedUser, storedToken));
      }

      if (storedToken) {
        try {
          const me = await api.get<User>('/auth/me');
          setUser(me);
          localStorage.setItem('user', JSON.stringify(me));
        } catch {
          if (storedUser) {
            setUser(mergeUserRole(storedUser, storedToken));
          }
        }
      }

      setLoading(false);
    };

    void init();
  }, []);

  const login = (newToken: string, userData: User) => {
    const normalized = mergeUserRole(userData, newToken) ?? userData;
    setToken(newToken);
    setUser(normalized);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(normalized));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
