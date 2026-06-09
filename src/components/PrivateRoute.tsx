import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PrivateRoute = () => {
  const { user } = useAuth();

  useEffect(() => {
    document.body.classList.add('vesk-app');
    return () => document.body.classList.remove('vesk-app');
  }, []);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet key={user.id} />;
};

export default PrivateRoute;
