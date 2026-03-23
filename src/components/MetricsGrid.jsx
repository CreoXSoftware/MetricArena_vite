import React from 'react';
import { formatDuration } from '../utils/format';

export default function MetricsGrid({ metrics, thresholds }) {
  if (!metrics) return null;
  const m = metrics;
  const T = thresholds;

  const cards = [
    { label: 'Max Speed', value: m.maxSpeedMs.toFixed(2), unit: 'm/s' },
    { label: 'Avg Speed (moving)', value: (m.avgSpeed / 3.6).toFixed(2), unit: 'm/s' },
    { label: 'Max Acceleration', value: m.maxAccel.toFixed(1), unit: 'm/s²' },
    { label: 'Max Deceleration', value: m.maxDecel.toFixed(1), unit: 'm/s²' },
    { label: 'Avg Acceleration', value: m.avgAccel.toFixed(2), unit: 'm/s²' },
    { label: 'Dist to Max Speed', value: m.distToMax.toFixed(1), unit: 'm' },
    { label: 'Time to Max Speed', value: m.timeToMax.toFixed(1), unit: 's' },
    { label: 'Total Distance', value: m.totalDist.toFixed(0), unit: 'm' },
    { label: 'High Speed Distance', value: m.highSpeedDist.toFixed(0), unit: 'm' },
    { label: 'Sprint Distance', value: m.sprintDist.toFixed(0), unit: 'm' },
    { label: 'Duration', value: formatDuration(m.duration), unit: '' },
    { label: 'Time Moving', value: formatDuration(m.timeMoving), unit: '' },
    { label: 'Time Stationary', value: formatDuration(m.timeStationary), unit: '' },
    { label: `Sprints (>${T.sprintSpeed} km/h)`, value: String(m.sprints), unit: '' },
    { label: `Runs (>${T.runSpeed} km/h)`, value: String(m.runs), unit: '' },
    { label: `Impacts (>${T.impactThresh} m/s²)`, value: String(m.impacts), unit: '' },
  ];

  const profileCards = [
    { label: 'Peak Force', value: m.peakForce.toFixed(0), unit: 'N', sec: true },
    { label: 'Avg Force (moving)', value: m.avgForce.toFixed(0), unit: 'N', sec: true },
    { label: 'Peak Power', value: m.peakPower.toFixed(0), unit: 'W', sec: true },
    { label: 'Avg Power (moving)', value: m.avgPower.toFixed(0), unit: 'W', sec: true },
    { label: 'Est. Calories', value: m.totalCal.toFixed(0), unit: 'kcal', sec: true },
    { label: 'Est. Work', value: (m.work / 1000).toFixed(1), unit: 'kJ', sec: true },
    { label: 'Metabolic Power', value: m.metabolicPower.toFixed(1), unit: 'W/kg', sec: true },
    { label: 'Player Load', value: m.playerLoad.toFixed(0), unit: 'au', sec: true },
    { label: 'Player Load / min', value: m.plPerMin.toFixed(1), unit: 'au/min', sec: true },
    { label: 'BMI', value: m.bmi.toFixed(1), unit: '', sec: true },
  ];

  const allCards = [...cards, ...profileCards];

  return (
    <div className="metrics-grid">
      {allCards.map((c, i) => (
        <div key={i} className={`metric-card${c.sec ? ' secondary' : ''}`}>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}<span className="unit">{c.unit}</span></div>
        </div>
      ))}
    </div>
  );
}
