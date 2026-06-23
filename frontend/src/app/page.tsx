'use client';

import React, { useState, useRef, useCallback } from 'react';
import MapView from '../components/MapView';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://gridlockround2-i3um.onrender.com/api';

/* ─── Tiny inline SVG icons (no lucide dep needed for custom icons) ─── */
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconMapPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconBrain = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5V8a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 8V5.5A2.5 2.5 0 0 1 7 3"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5V8a2.5 2.5 0 0 0 2.5 2.5H17A2.5 2.5 0 0 0 19.5 8V5.5A2.5 2.5 0 0 0 17 3"/>
    <path d="M9.5 22A2.5 2.5 0 0 0 12 19.5V16a2.5 2.5 0 0 0-2.5-2.5H7A2.5 2.5 0 0 0 4.5 16v2.5A2.5 2.5 0 0 0 7 21"/>
    <path d="M14.5 22A2.5 2.5 0 0 1 12 19.5V16a2.5 2.5 0 0 1 2.5-2.5H17a2.5 2.5 0 0 1 2.5 2.5v2.5A2.5 2.5 0 0 1 17 21"/>
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconStation = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="15" y1="22" x2="15" y2="16" />
    <line x1="9" y1="16" x2="15" y2="16" />
    <path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm8-4h2v2h-2V6zm0 4h2v2h-2v-2z" />
  </svg>
);

const IconRoute = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="19" r="3" />
    <circle cx="18" cy="5" r="3" />
    <path d="M18 8a9 9 0 0 1-9 9" />
  </svg>
);

const IconChecklist = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="9" y1="12" x2="10" y2="13" />
    <line x1="12" y1="10" x2="15" y2="13" />
  </svg>
);

const IconReport = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

/* ─── Severity helpers ─────────────────────────────────── */
const getPriorityClass = (priority: string) => {
  const p = priority?.toLowerCase();
  if (p === 'high' || p === 'critical') return 'critical';
  if (p === 'medium') return 'medium';
  return 'low';
};

const getSeverityClass = (severity: string) => {
  const s = severity?.toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
};

const severityBadgeStyle = (severity: string) => {
  const s = severity?.toLowerCase();
  if (s === 'critical') return { background: 'var(--severity-critical-bg)', color: 'var(--severity-critical)', border: '1px solid rgba(255,69,58,0.2)' };
  if (s === 'high') return { background: 'var(--severity-high-bg)', color: 'var(--severity-high)', border: '1px solid rgba(255,159,10,0.2)' };
  if (s === 'medium') return { background: 'var(--severity-medium-bg)', color: 'var(--severity-medium)', border: '1px solid rgba(255,214,10,0.2)' };
  return { background: 'var(--severity-low-bg)', color: 'var(--severity-low)', border: '1px solid rgba(48,209,88,0.2)' };
};

/* ─── Sub-components ───────────────────────────────────── */

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="gl-section-label">
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </p>
  );
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <label className="gl-toggle" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="gl-toggle-track" />
      <span className="gl-toggle-thumb" />
    </label>
  );
}

/* ─── Sidebar Resize Hook ──────────────────────────────── */
function useSidebarResize(initialWidth = 380) {
  const sidebarRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(initialWidth);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !sidebarRef.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(600, Math.max(280, startWidth.current + delta));
    sidebarRef.current.style.width = `${newWidth}px`;
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    rootRef.current?.classList.remove('resizing');
    handleRef.current?.classList.remove('dragging');
    document.body.style.cursor = '';
  }, [onMouseMove]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarRef.current?.offsetWidth ?? initialWidth;
    rootRef.current?.classList.add('resizing');
    handleRef.current?.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp, initialWidth]);

  return { sidebarRef, rootRef, handleRef, onMouseDown };
}


export default function Dashboard() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [actionPlan, setActionPlan] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<any[]>([]);
  const [simulationMode, setSimulationMode] = useState<'single' | 'multiple'>('single');
  const [incidentShape, setIncidentShape] = useState<'point' | 'route'>('point');
  const { sidebarRef, rootRef, handleRef, onMouseDown } = useSidebarResize(380);

  const handleShapeChange = (shape: 'point' | 'route') => {
    setIncidentShape(shape);
    setIncidents([]);
    setStations([]);
    setSelectedLocations([]);
    setSimulationResult(null);
    setActionPlan([]);
  };

  const [formData, setFormData] = useState({
    event_type: 'vehicle_breakdown',
    latitude: 12.9716,
    longitude: 77.5946,
    hour: 12,
    day_of_week: 1,
  });

  const handleModeChange = (mode: 'single' | 'multiple') => {
    setSimulationMode(mode);
    setIncidents([]);
    setStations([]);
    setSelectedLocations([]);
    setSimulationResult(null);
    setActionPlan([]);
  };

  React.useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      hour: new Date().getHours(),
      day_of_week: new Date().getDay(),
    }));
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (incidentShape === 'route') {
        if (selectedLocations.length < 2) {
          alert('Please click at least 2 points on the map to define a route path.');
          setLoading(false);
          return;
        }

        const startLng = selectedLocations[0][0];
        const startLat = selectedLocations[0][1];

        // 1. Call prediction API with route_coordinates
        const response = await axios.post(`${API_URL}/predict/`, {
          ...formData,
          latitude: startLat,
          longitude: startLng,
          route_coordinates: selectedLocations,
        });
        const prediction = response.data;

        const incidentId = Math.random().toString(36).substr(2, 9);

        // 2. Call resource allocation API with route_coordinates and event_type
        let stationsList: any[] = [];
        try {
          const allocateResponse = await axios.post(`${API_URL}/allocate/`, {
            incident_id: incidentId,
            severity: prediction.severity,
            latitude: startLat,
            longitude: startLng,
            event_type: formData.event_type,
            route_coordinates: selectedLocations,
          });
          stationsList = allocateResponse.data.stations || [];
        } catch (allocErr) {
          console.error('Allocation API call failed:', allocErr);
        }

        const adjustedStations = stationsList.map((st: any) => ({
          ...st,
          id: `${incidentId}-${st.id}`,
          name: st.name,
          incidentLocation: st.target_location || [startLng, startLat],
        }));

        setSimulationResult({
          ...prediction,
        });
        setActionPlan(prediction.action_plan || []);
        setStations(adjustedStations);
        setIncidents([
          {
            id: incidentId,
            location: [startLng, startLat],
            severity: prediction.severity,
            priority: prediction.priority,
            event_type: formData.event_type,
            blast_radius_km: prediction.blast_radius_km,
            route_coordinates: selectedLocations,
          },
        ]);
        setSelectedLocations([]);
        setLoading(false);
        return;
      }

      const targets =
        selectedLocations.length > 0
          ? selectedLocations
          : [[formData.longitude, formData.latitude]];

      const results = await Promise.all(
        targets.map(async (target, idx) => {
          const lng = target[0];
          const lat = target[1];

          const response = await axios.post(`${API_URL}/predict/`, {
            ...formData,
            latitude: lat,
            longitude: lng,
          });
          const prediction = response.data;

          const incidentId = Math.random().toString(36).substr(2, 9);

          let stationsList: any[] = [];
          try {
            const allocateResponse = await axios.post(`${API_URL}/allocate/`, {
              incident_id: incidentId,
              severity: prediction.severity,
              latitude: lat,
              longitude: lng,
              event_type: formData.event_type,
            });
            stationsList = allocateResponse.data.stations || [];
          } catch (allocErr) {
            console.error('Allocation API call failed:', allocErr);
          }

          const incidentIndex =
            simulationMode === 'single' ? 1 : incidents.length + idx + 1;
          const labelPrefix =
            simulationMode === 'single' ? '' : `Inc #${incidentIndex}: `;

          const adjustedStations = stationsList.map((st: any) => ({
            ...st,
            id: `${incidentId}-${st.id}`,
            name: `${labelPrefix}${st.name}`,
            incidentLocation: [lng, lat],
          }));

          return {
            prediction,
            incident: {
              id: incidentId,
              location: [lng, lat],
              severity: prediction.severity,
              priority: prediction.priority,
              event_type: formData.event_type,
              blast_radius_km: prediction.blast_radius_km,
            },
            stations: adjustedStations,
          };
        })
      );

      const newIncidentsList = results.map((r) => r.incident);
      const newStationsList = results.flatMap((r) => r.stations);

      if (results.length > 0) {
        setSimulationResult({
          ...results[results.length - 1].prediction,
        });
        setActionPlan(results[results.length - 1].prediction.action_plan || []);
      }

      if (simulationMode === 'single') {
        setStations(newStationsList);
        setIncidents(newIncidentsList);
      } else {
        setStations((prev) => [...prev, ...newStationsList]);
        setIncidents((prev) => [...prev, ...newIncidentsList]);
      }

      setSelectedLocations([]);
    } catch (error) {
      console.error('Error simulating incident:', error);
      alert('Error calling prediction API. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIncidents([]);
    setStations([]);
    setSelectedLocations([]);
    setSimulationResult(null);
    setActionPlan([]);
  };

  return (
    <div className="gl-root" ref={rootRef}>
      {/* ── Sidebar ── */}
      <aside className="gl-sidebar" ref={sidebarRef} style={{ width: 380 }}>
        {/* Header */}
        <div className="gl-header">
          <div className="gl-logo">
            <div className="gl-logo-icon">
              <IconShield />
            </div>
            <span className="gl-app-name">GridLock</span>
          </div>
          <p className="gl-app-subtitle">Traffic Intelligence Platform</p>
        </div>

        <div className="gl-divider" />

        {/* Drag-to-resize handle */}
        <div
          ref={handleRef}
          className="gl-resize-handle"
          onMouseDown={onMouseDown}
          title="Drag to resize"
        />

        {/* Scrollable Content */}
        <div className="gl-sidebar-scroll">

          {/* ── Simulate Incident Card ── */}
          <div className="gl-card gl-animate-in">
            <div className="gl-card-header">
              <span className="gl-card-title">Simulate Incident</span>
            </div>

            {/* Mode Toggle */}
            {incidentShape === 'point' && (
              <div className="gl-field" style={{ marginBottom: 16 }}>
                <label className="gl-label">Simulation Mode</label>
                <div className="gl-segmented">
                  <button
                    type="button"
                    id="mode-single"
                    className={`gl-seg-btn${simulationMode === 'single' ? ' active' : ''}`}
                    onClick={() => handleModeChange('single')}
                  >
                    Single Incident
                  </button>
                  <button
                    type="button"
                    id="mode-multiple"
                    className={`gl-seg-btn${simulationMode === 'multiple' ? ' active' : ''}`}
                    onClick={() => handleModeChange('multiple')}
                  >
                    Multiple
                  </button>
                </div>
              </div>
            )}

            {/* Incident Shape Toggle */}
            <div className="gl-field" style={{ marginBottom: 16 }}>
              <label className="gl-label">Incident Shape</label>
              <div className="gl-segmented">
                <button
                  type="button"
                  id="shape-point"
                  className={`gl-seg-btn${incidentShape === 'point' ? ' active' : ''}`}
                  onClick={() => handleShapeChange('point')}
                >
                  Point Location
                </button>
                <button
                  type="button"
                  id="shape-route"
                  className={`gl-seg-btn${incidentShape === 'route' ? ' active' : ''}`}
                  onClick={() => handleShapeChange('route')}
                >
                  Route Path
                </button>
              </div>
            </div>

            <form onSubmit={handleSimulate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Event Type */}
              <div className="gl-field">
                <label className="gl-label" htmlFor="event-type-select">Event Type</label>
                <select
                  id="event-type-select"
                  className="gl-select"
                  value={formData.event_type}
                  onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                >
                  <option value="vehicle_breakdown">Vehicle Breakdown</option>
                  <option value="accident">Accident</option>
                  <option value="tree_fall">Tree Fall</option>
                  <option value="water_logging">Water Logging</option>
                  <option value="political_rally">Political Rally</option>
                  <option value="festival">Festival</option>
                  <option value="sports_event">Sports Event</option>
                  <option value="construction">Construction Activity</option>
                  <option value="sudden_gathering">Sudden Gathering</option>
                  <option value="others">Others</option>
                </select>
              </div>

              {/* Location */}
              {(simulationMode === 'multiple' || incidentShape === 'route') && selectedLocations.length > 0 ? (
                <div className="gl-selection-badge">
                  <span className="gl-selection-badge-text">
                    <IconMapPin />
                    {incidentShape === 'route'
                      ? `${selectedLocations.length} route waypoints selected`
                      : `${selectedLocations.length} locations selected`}
                  </span>
                  <button
                    type="button"
                    className="gl-selection-badge-clear"
                    onClick={() => setSelectedLocations([])}
                    id="clear-selection-btn"
                  >
                    Clear
                  </button>
                </div>
              ) : incidentShape === 'point' ? (
                <div className="gl-coord-row">
                  <div className="gl-field">
                    <label className="gl-label" htmlFor="lat-input">Latitude</label>
                    <input
                      id="lat-input"
                      type="number"
                      step="any"
                      readOnly
                      className="gl-input"
                      value={formData.latitude}
                    />
                  </div>
                  <div className="gl-field">
                    <label className="gl-label" htmlFor="lng-input">Longitude</label>
                    <input
                      id="lng-input"
                      type="number"
                      step="any"
                      readOnly
                      className="gl-input"
                      value={formData.longitude}
                    />
                  </div>
                </div>
              ) : null}

              <p className="gl-hint">
                <IconMapPin />
                {incidentShape === 'route'
                  ? 'Click multiple points on the map to define the route path'
                  : 'Tap the map to place the incident location'}
              </p>



              {/* Actions */}
              <div className="gl-btn-row">
                <button
                  type="submit"
                  disabled={loading}
                  className="gl-btn-primary"
                  id="simulate-btn"
                >
                  {loading ? (
                    <>
                      <span className="gl-spinner" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <IconBrain />
                      Predict & Allocate
                    </>
                  )}
                </button>

                {(incidents.length > 0 || selectedLocations.length > 0) && (
                  <button
                    type="button"
                    className="gl-btn-ghost"
                    onClick={handleReset}
                    id="reset-btn"
                  >
                    <IconX />
                    Reset
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ── Prediction Results ── */}
          {simulationResult && (
            <div className="gl-results-card">
              {/* Results Header */}
              <div className="gl-results-header">
                <div className="gl-card-title-row">
                  <span className="gl-card-title">Prediction Results</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className={`gl-priority-badge ${getPriorityClass(simulationResult.priority)}`}
                  >
                    {simulationResult.priority}
                  </span>
                  {simulationMode === 'multiple' && (
                    <span className="gl-pill accent">Last Run</span>
                  )}
                </div>
              </div>

              <div className="gl-results-body">
                {/* Key Stats */}
                <div className="gl-stat-grid">
                  <div className="gl-stat-card gl-animate-in">
                    <p className="gl-stat-label">Severity</p>
                    <p className={`gl-stat-value ${getSeverityClass(simulationResult.severity)}`}>
                      {simulationResult.severity}
                    </p>
                  </div>

                  <div className="gl-stat-card gl-animate-in gl-animate-in-delay-1">
                    <p className="gl-stat-label">Duration</p>
                    <p className="gl-stat-value default" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      {simulationResult.expected_duration}
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>min</span>
                    </p>
                  </div>

                  <div className="gl-stat-card full gl-animate-in gl-animate-in-delay-2">
                    <p className="gl-stat-label">Traffic Impact Score</p>
                    <div className="gl-progress-wrap">
                      <div className="gl-progress-track">
                        <div
                          className="gl-progress-fill"
                          style={{ width: `${simulationResult.impact_score}%` }}
                        />
                      </div>
                      <span className="gl-progress-value">
                        {simulationResult.impact_score?.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>/100</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resource Allocation */}
                <div className="gl-animate-in gl-animate-in-delay-3">
                  <SectionLabel>Resource Allocation</SectionLabel>
                  <div className="gl-resource-row">
                    <div className="gl-resource-card">
                      <span className="gl-resource-number" style={{ color: 'var(--accent)' }}>
                        {simulationResult.recommendations?.officers}
                      </span>
                      <span className="gl-resource-label">Police Units</span>
                    </div>
                    <div className="gl-resource-card">
                      <span className="gl-resource-number" style={{ color: 'var(--severity-high)' }}>
                        {simulationResult.recommendations?.barricades}
                      </span>
                      <span className="gl-resource-label">Barricades</span>
                    </div>
                  </div>
                </div>

                {/* Dispatched Stations */}
                {stations && stations.length > 0 && (
                  <div className="gl-animate-in gl-animate-in-delay-4">
                    <SectionLabel icon={<IconStation />}>Dispatched Stations</SectionLabel>
                    <div className="gl-station-list">
                      {stations.map((st, i) => (
                        <div
                          key={st.id}
                          className="gl-station-item"
                          style={{ animationDelay: `${i * 40}ms` }}
                        >
                          <div className="gl-station-left">
                            <span
                              className="gl-station-dot"
                              style={{ backgroundColor: st.color || 'var(--accent)' }}
                            />
                            <div>
                              <p className="gl-station-name">{st.name}</p>
                              <p className="gl-station-type">{st.type} Station</p>
                            </div>
                          </div>
                          <span className="gl-station-units">{st.dispatched} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alternate Detour Routes */}
                {simulationResult.detour_routes && simulationResult.detour_routes.length > 0 && (
                  <div className="gl-animate-in gl-animate-in-delay-4" style={{ marginTop: 20 }}>
                    <SectionLabel icon={<IconRoute />}>Alternate Detour Routes</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Explicitly typed rt and i to resolve Vercel TypeScript build error */}
                      {simulationResult.detour_routes.map((rt: any, i: number) => (
                        <div
                          key={rt.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 14px',
                            animationDelay: `${i * 40}ms`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: rt.color || '#10b981',
                                display: 'inline-block'
                              }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                              {rt.description}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>OSRM Snapped</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* XAI */}
                {simulationResult.xai_explanation && (
                  <>
                    <div className="gl-section-sep" />
                    <div>
                      <SectionLabel icon={<IconBrain />}>Explainable AI</SectionLabel>
                      <div className="gl-xai-list">
                        {Object.entries(simulationResult.xai_explanation).map(
                          ([key, val]: [string, any], i) => (
                            <div
                              key={key}
                              className="gl-xai-item"
                              style={{ animationDelay: `${i * 40}ms` }}
                            >
                              <div className="gl-xai-row">
                                <span className="gl-xai-key">{key}</span>
                                <span className="gl-xai-val">{val}%</span>
                              </div>
                              <div className="gl-xai-track">
                                <div
                                  className="gl-xai-fill"
                                  style={{ width: `${val}%`, animationDelay: `${0.1 + i * 0.05}s` }}
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Action Plan */}
                {actionPlan && actionPlan.length > 0 && (
                  <>
                    <div className="gl-section-sep" />
                    <div>
                      <SectionLabel icon={<IconChecklist />}>Action Plan</SectionLabel>
                      <div className="gl-action-list">
                        {actionPlan.map((item, idx) => (
                          <div key={idx} className="gl-action-item">
                            <input
                              type="checkbox"
                              id={`task-${idx}`}
                              className="gl-action-checkbox"
                              checked={item.status === 'completed'}
                              onChange={() => {
                                const newPlan = [...actionPlan];
                                newPlan[idx] = {
                                  ...newPlan[idx],
                                  status: newPlan[idx].status === 'completed' ? 'pending' : 'completed',
                                };
                                setActionPlan(newPlan);
                              }}
                            />
                            <label
                              htmlFor={`task-${idx}`}
                              className={`gl-action-label${item.status === 'completed' ? ' done' : ''}`}
                            >
                              <span className="gl-action-time">[{item.time}]</span>{' '}
                              {item.task}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Learning Report */}
                {simulationResult.learning_report && (
                  <>
                    <div className="gl-section-sep" />
                    <div>
                      <SectionLabel icon={<IconReport />}>Learning Report</SectionLabel>
                      <div
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-lg)',
                          padding: 14,
                        }}
                      >
                        <div className="gl-learning-grid">
                          <div className="gl-learning-item full">
                            <span className="gl-learning-key">Risk Factor</span>
                            <span className="gl-learning-val danger">
                              {simulationResult.learning_report.risk_factor}
                            </span>
                          </div>
                          <div className="gl-learning-item full">
                            <span className="gl-learning-key">Preventive Action</span>
                            <span className="gl-learning-val">
                              {simulationResult.learning_report.preventive_action}
                            </span>
                          </div>
                          <div className="gl-learning-item">
                            <span className="gl-learning-key">Recovery Estimate</span>
                            <span className="gl-learning-val">
                              {simulationResult.learning_report.recovery_estimate}
                            </span>
                          </div>
                          <div className="gl-learning-item">
                            <span className="gl-learning-key">Efficiency Index</span>
                            <span className="gl-learning-val success">
                              {simulationResult.learning_report.efficiency_index}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Bottom padding */}
          <div style={{ height: 8 }} />
        </div>
      </aside>

      {/* ── Map Area ── */}
      <main className="gl-map-area">
        <MapView
          incidents={incidents}
          selectedIncident={null}
          onSelectIncident={(i: any) => console.log('Selected', i)}
          stations={stations as any}
          selectedLocations={selectedLocations as any}
          incidentShape={incidentShape}
          onMapClick={(lat: number, lng: number) => {
            setFormData((prev) => ({
              ...prev,
              latitude: parseFloat(lat.toFixed(6)),
              longitude: parseFloat(lng.toFixed(6)),
            }));

            if (incidentShape === 'route') {
              setSelectedLocations((prev) => [...prev, [lng, lat]]);
            } else if (simulationMode === 'single') {
              setSelectedLocations([[lng, lat]]);
              setSimulationResult(null);
              setStations([]);
              setIncidents([]);
            } else {
              setSelectedLocations((prev) => [...prev, [lng, lat]]);
            }
          }}
        />
      </main>
    </div>
  );
}
