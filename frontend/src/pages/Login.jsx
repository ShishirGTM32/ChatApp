import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../utils/AxiosInstance';
import { toast } from 'react-toastify';

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/chat', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await axiosInstance.post('/api/auth/login/', formData);
      login(response.data.user, response.data.tokens);
      toast.success('Logged in successfully!');
      
    } catch (error) {
      const errorMsg = error.response?.data?.non_field_errors?.[0] || 
                      error.response?.data?.email?.[0] ||
                      error.response?.data?.password?.[0] ||
                      'Login failed';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mt-5" style={{ maxWidth: '500px', margin: '50px auto' }}>
      <div className="card shadow" style={{ border: '1px solid #ddd', borderRadius: '8px' }}>
        <div className="card-body" style={{ padding: '30px' }}>
          <h2 className="card-title text-center mb-4">Login</h2>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                style={{ padding: '10px', fontSize: '16px' }}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                style={{ padding: '10px', fontSize: '16px' }}
              />
            </div>

            <div className="mb-3">
              <Link to="/reset-password" className="text-decoration-none">
                Forgot Password?
              </Link>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-100"
              disabled={submitting}
              style={{ padding: '10px', fontSize: '16px' }}
            >
              {submitting ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="text-center mt-3">
            <Link to="/register">Don't have an account? Register</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;