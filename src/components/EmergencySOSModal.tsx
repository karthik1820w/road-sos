import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle, Phone, Navigation, FileText, Activity, ShieldAlert, HeartPulse, X, ExternalLink } from 'lucide-react';
import type { Incident, AiMedicalAnalysis, RecommendedHospital } from '../services/incidentService';

interface EmergencySOSModalProps {
  isOpen: boolean;
  isConfirmed: boolean;
  onClose: () => void;
  incident?: Incident | null;
  aiAnalysis?: AiMedicalAnalysis | null;
  recommendedHospitals?: RecommendedHospital[];
  onSelectHospitalNavigation?: (hospital: RecommendedHospital) => void;
}

export const EmergencySOSModal: React.FC<EmergencySOSModalProps> = ({ 
  isOpen, 
  isConfirmed, 
  onClose,
  incident,
  aiAnalysis: propAiAnalysis,
  recommendedHospitals: propHospitals,
  onSelectHospitalNavigation,
}) => {
  useEffect(() => {
    if (isConfirmed && isOpen) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Help is coming. Your emergency contacts and hospital have been notified.");
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [isConfirmed, isOpen]);

  const activeAnalysis = incident?.aiMedicalAnalysis || propAiAnalysis;
  const activeHospitals = (incident?.recommendedHospitals && incident.recommendedHospitals.length > 0)
    ? incident.recommendedHospitals
    : propHospitals || [];

  const effectiveHospitalNumber = (incident?.contacts && incident.contacts[0]) || "";
  const reportUrl = incident ? `/api/incidents/${incident.id}/report.pdf?t=${(incident as any).reportToken}` : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            className="w-full max-w-2xl overflow-hidden rounded-3xl shadow-2xl bg-slate-900 border border-slate-800 text-white my-8 flex flex-col max-h-[90vh]"
          >
            {/* Header Banner */}
            <div className={`p-6 transition-colors flex items-center justify-between ${
              isConfirmed
                ? 'bg-gradient-to-r from-emerald-600 to-green-700'
                : 'bg-gradient-to-r from-red-600 to-rose-700'
            }`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md animate-pulse">
                  {isConfirmed ? (
                    <CheckCircle size={32} strokeWidth={2.5} className="text-white" />
                  ) : (
                    <AlertTriangle size={32} strokeWidth={2.5} className="text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    {isConfirmed ? "Help is Coming!" : "Emergency SOS Dispatched"}
                  </h2>
                  <p className="text-xs text-white/80 font-medium tracking-wide">
                    {isConfirmed
                      ? "Responder confirmed. Assistance is on the way."
                      : "Automated distress call, message & medical report sent."}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 bg-black/20 hover:bg-black/40 rounded-full text-white/80 hover:text-white transition-colors"
                title="Dismiss"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">

              {/* Hospital & Dispatch Target Alert */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <ShieldAlert size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                      Emergency Hospital Dispatch
                    </span>
                    <span className="text-sm font-bold text-white">
                      {effectiveHospitalNumber ? `Alerted Hospital: ${effectiveHospitalNumber}` : "Hospital & Emergency Contacts Alerted"}
                    </span>
                  </div>
                </div>
                {effectiveHospitalNumber && (
                  <a
                    href={`tel:${effectiveHospitalNumber}`}
                    className="flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors shrink-0 shadow-lg shadow-red-600/20"
                  >
                    <Phone size={14} />
                    Call Hospital Direct
                  </a>
                )}
              </div>

              {/* Gemini AI Disease & Condition Analysis */}
              {activeAnalysis && (
                <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <HeartPulse size={18} className="text-red-400" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-red-400">
                        AI Clinical Analysis (Gemini)
                      </h3>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border ${
                      activeAnalysis.severity === 'CRITICAL'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {activeAnalysis.severity} Severity
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-base font-black text-white">{activeAnalysis.condition}</p>
                      {activeAnalysis.triageSummary && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {activeAnalysis.triageSummary}
                        </p>
                      )}
                    </div>

                    {activeAnalysis.possibleDiseasesOrInjuries && activeAnalysis.possibleDiseasesOrInjuries.length > 0 && (
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                          Suspected Conditions & Injuries
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {activeAnalysis.possibleDiseasesOrInjuries.map((d, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-800/80 border border-white/5 rounded-md text-[11px] font-semibold text-slate-300">
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeAnalysis.firstAidInstructions && activeAnalysis.firstAidInstructions.length > 0 && (
                      <div className="bg-slate-900/90 border border-white/5 rounded-xl p-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block mb-2">
                          Immediate On-Scene First Aid
                        </span>
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {activeAnalysis.firstAidInstructions.map((step, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recommended Nearby Hospitals */}
              {activeHospitals.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity size={18} className="text-blue-400" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
                        Nearby Best Recommended Hospitals (Maps)
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      Sorted by capability & ETA
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeHospitals.slice(0, 3).map((hospital, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          idx === 0
                            ? 'bg-blue-950/30 border-blue-500/40 shadow-lg shadow-blue-500/5'
                            : 'bg-slate-950/50 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white">{hospital.name}</h4>
                              {idx === 0 && (
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md text-[9px] font-black uppercase tracking-wider">
                                  Top Recommendation
                                </span>
                              )}
                            </div>
                            {hospital.address && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{hospital.address}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                              <span className="text-blue-400 font-bold">{hospital.distanceKm} km away</span>
                              {hospital.rating && (
                                <span className="text-amber-400 font-medium">★ {hospital.rating.toFixed(1)}</span>
                              )}
                              {hospital.recommendationReason && (
                                <span className="text-slate-400 italic text-[11px] hidden sm:inline">
                                  {hospital.recommendationReason}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {hospital.phone && (
                              <a
                                href={`tel:${hospital.phone}`}
                                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors border border-white/10"
                                title={`Call ${hospital.name}`}
                              >
                                <Phone size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                if (onSelectHospitalNavigation) {
                                  onSelectHospitalNavigation(hospital);
                                } else {
                                  window.open(hospital.mapsUrl, '_blank');
                                }
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-blue-600/20"
                            >
                              <Navigation size={13} />
                              Navigate
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handover Report PDF Link */}
              {reportUrl && (
                <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-purple-400" />
                    <span>Signed Medical Handover Report ready</span>
                  </div>
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold"
                  >
                    Open PDF Report
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
              >
                Close Window
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
