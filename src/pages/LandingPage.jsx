import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BrandFull } from '../components/Brand';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  { title: 'Session Analytics', desc: 'Parse binary sensor data and compute 30+ athletic performance metrics instantly.' },
  { title: 'Live Heatmaps', desc: 'Visualize GPS tracks with speed and acceleration overlays on interactive maps.' },
  { title: 'Sprint Detection', desc: 'Automatic sprint, run, and impact detection with configurable thresholds.' },
  { title: 'Team Insights', desc: 'Create teams, organize sessions, and track performance across your squad.' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/app/upload" replace />;

  return (
    <div className="landing-page">
      <BrandFull />
      <p className="landing-subtitle">
        Athlete performance analytics for teams and individuals.
        Upload sensor data, track metrics, and compare globally.
      </p>

      <div className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature-card">
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="landing-cta">
        <Link to="/register" className="btn btn-accent btn-lg">Get Started</Link>
        <Link to="/login" className="btn btn-outline btn-lg">Sign In</Link>
      </div>
    </div>
  );
}
