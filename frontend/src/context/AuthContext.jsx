import React, { createContext, useState, useContext, useEffect } from 'react';
import axiosInstance from '../utils/AxiosInstance';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(() => {
    const stored = localStorage.getItem('tokens');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async () => {
    try {
      const response = await axiosInstance.get('/api/auth/profile/');
      
      const userData = {
        ...response.data,
        is_staff: response.data.is_staff === true || response.data.is_staff === 'true'
      };
      
      setUser(userData);
      
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      setUser(null);
      setTokens(null);
      localStorage.removeItem('tokens');
      delete axiosInstance.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokens) {
      localStorage.setItem('tokens', JSON.stringify(tokens));
      axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${tokens.access}`;
      fetchUserProfile();
    } else {
      localStorage.removeItem('tokens');
      delete axiosInstance.defaults.headers.common['Authorization'];
      setLoading(false);
    }
  }, [tokens?.access]); 

  const login = (userData, userTokens) => {
    const normalizedUser = {
      ...userData,
      is_staff: userData.is_staff === true || userData.is_staff === 'true'
    };
    setUser(normalizedUser);
    setTokens(userTokens);
  };

  const logout = async () => {
    try {
      if (tokens?.refresh) {
        await axiosInstance.post('/api/auth/logout/', {
          refresh: tokens.refresh
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setTokens(null);
      localStorage.removeItem('tokens');
      delete axiosInstance.defaults.headers.common['Authorization'];
    }
  };

  const value = {
    user,
    tokens,
    login,
    logout,
    loading,
    isAuthenticated: !!tokens && !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};