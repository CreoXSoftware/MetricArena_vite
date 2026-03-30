import { useState, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { BrandFull } from '../components/Brand';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../contexts/SessionContext';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';

const FEATURES = [
  { title: 'Session Analytics', desc: 'Parse binary sensor data and compute 30+ athletic performance metrics instantly.' },
  { title: 'Live Heatmaps', desc: 'Visualize GPS tracks with speed and acceleration overlays on interactive maps.' },
  { title: 'Sprint Detection', desc: 'Automatic sprint, run, and impact detection with configurable thresholds.' },
  { title: 'Team Insights', desc: 'Create teams, organize sessions, and track performance across your squad.' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const { setProcessedData, setCurrentSessionId, setLoadedSplits } = useSession();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback((file) => {
    const isBinary = /\.bin$/i.test(file.name);
    setParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setTimeout(() => {
        try {
          let rows;
          if (isBinary) {
            const version = inferBinaryVersion(file.name);
            rows = parseBinary(e.target.result, version);
          } else {
            rows = parseCSV(e.target.result);
          }
          const data = processSession(rows);
          setCurrentSessionId(null);
          setLoadedSplits([]);
          setProcessedData(data);
          navigate('/quick-analysis');
        } catch (err) {
          console.error('Parse error:', err);
          setError(err.message);
          setParsing(false);
        }
      }, 50);
    };

    if (isBinary) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }, [setProcessedData, setCurrentSessionId, setLoadedSplits, navigate]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  if (loading) return null;
  if (user) return <Navigate to="/app/upload" replace />;

  return (
    <div className="landing-page">
      <BrandFull />
      <p className="landing-subtitle">
        Athlete performance analytics for teams and individuals.
        Upload sensor data, track metrics, and compare globally.
      </p>

      <div
        className={`landing-quick-upload${dragover ? ' dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        {parsing ? (
          <div className="loading" style={{ display: 'flex' }}>
            <div className="spinner"></div>
            <p>Analyzing file…</p>
          </div>
        ) : (
          <>
            <div className="landing-quick-upload-icon">&#9889;</div>
            <div className="landing-quick-upload-title">Quick Analysis</div>
            <div className="landing-quick-upload-desc">
              Drop a CSV or .bin file to instantly view your session — no account needed
            </div>
          </>
        )}
        <input
          type="file"
          ref={inputRef}
          accept=".csv,.bin"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files.length) handleFile(e.target.files[0]); }}
        />
      </div>
      {error && <div className="landing-quick-error">Error: {error}</div>}

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
