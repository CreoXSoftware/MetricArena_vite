import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { BrandFull } from '../components/Brand';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const { user, loading, signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/app/leaderboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    const { error: err } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      navigate('/app/leaderboard');
    }
  };

  return (
    <div className="auth-page">
      <BrandFull />
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2 className="auth-title">Create Account</h2>
        {error && <div className="auth-error">{error}</div>}
        <label className="auth-label">
          Display Name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            placeholder="e.g. John Smith"
          />
        </label>
        <label className="auth-label">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={6}
          />
        </label>
        <label className="auth-label">
          Confirm Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn btn-accent btn-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create Account'}
        </button>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
