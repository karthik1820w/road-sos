import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Incident } from '../services/incidentService';

export function TrackIncident() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');
  const [incident, setIncident] = useState<Incident | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Initial fetch to get the current state
    fetch(`/api/incidents/${id}?t=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load incident');
        return res.json();
      })
      .then(data => setIncident(data.incident))
      .catch(err => setError(err.message));

    // Subscribe to live socket updates
    let socket: Socket | null = null;
    try {
      socket = io({ path: '/socket.io/' });
      socket.emit('incident:join', id);
      socket.on('incident:update', (updated: Incident) => {
        if (updated.id === id) setIncident(updated);
      });
    } catch (e) {
      console.warn("Socket connection failed", e);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [id, token]);

  if (error) return <div className="p-8 text-white bg-red-900 h-screen">{error}</div>;
  if (!incident) return <div className="p-8 text-white bg-black h-screen">Loading incident data...</div>;

  const loc = incident.location;
  const history = incident.locationHistory || [];

  return (
    <div className="bg-slate-950 text-white min-h-screen p-4 sm:p-8 flex flex-col">
      <div className="max-w-2xl mx-auto w-full flex-grow flex flex-col">
        <header className="mb-6">
          <h1 className="text-2xl font-black uppercase tracking-tight text-red-500">
            RoadSOS Live Tracking
          </h1>
          <p className="text-sm text-slate-400">
            {incident.patient?.name || incident.patient?.phone || 'A user'} is sharing their live location.
          </p>
          <div className="mt-2 flex gap-2">
            <span className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 uppercase tracking-widest border border-slate-700">
              {incident.state}
            </span>
            <span className="px-2 py-1 text-xs rounded bg-red-900/30 text-red-400 uppercase tracking-widest border border-red-900">
              {incident.kind.replace('_', ' ')}
            </span>
          </div>
        </header>

        {loc ? (
          <div className="flex-grow bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex flex-col">
            <div className="p-4 bg-slate-800/50 text-sm font-mono border-b border-slate-800">
              Latest Location: {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
              {loc.accuracyM && ` (±${Math.round(loc.accuracyM)}m)`}
            </div>
            
            <div className="p-4 flex-grow relative bg-slate-950">
              <p className="text-slate-400 text-sm mb-4">
                Location updates are pushed continuously while the incident is open.
              </p>
              
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold"
              >
                Open in Google Maps
              </a>
              
              {history.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Location History</h3>
                  <div className="space-y-1">
                    {[...history].reverse().slice(0, 10).map((h, i) => (
                      <div key={i} className="text-xs font-mono text-slate-400 flex justify-between border-b border-slate-800 pb-1">
                        <span>{new Date(h.at).toLocaleTimeString()}</span>
                        <span>{h.lat.toFixed(4)}, {h.lng.toFixed(4)}</span>
                        {h.speedMps !== undefined && <span>{Math.round(h.speedMps * 3.6)} km/h</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">No location data available.</div>
        )}
      </div>
    </div>
  );
}
