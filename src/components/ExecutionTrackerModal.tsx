import React, { useState, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Key, 
  Layers, 
  Globe, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { executionTracker, ExecutionLogEntry } from '../services/executionTracker';

interface ExecutionTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export const ExecutionTrackerModal: React.FC<ExecutionTrackerModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
}) => {
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<ExecutionLogEntry | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = executionTracker.subscribe((updatedLogs) => {
      setLogs([...updatedLogs]);
      if (updatedLogs.length > 0 && !selectedLog) {
        setSelectedLog(updatedLogs[0]);
      }
    });
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const totalRuns = logs.length;
  const fallbackRuns = logs.filter(l => l.status === 'fallback_success').length;
  const errorRuns = logs.filter(l => l.status === 'error').length;
  const avgLatency = totalRuns > 0 
    ? Math.round(logs.reduce((acc, l) => acc + l.totalLatencyMs, 0) / totalRuns)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl border flex flex-col overflow-hidden transition-all ${
        isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
      }`}>
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDarkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Layers size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                AI Execution Tracker & Model Transparency
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Live Log
                </span>
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Audit AI requests, cascade fallbacks, latency metrics, and API key origins.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                executionTracker.clearLogs();
                setSelectedLog(null);
              }}
              className={`p-2 rounded-xl transition-all text-xs font-semibold flex items-center gap-1.5 ${
                isDarkMode 
                  ? 'hover:bg-red-500/10 text-red-400' 
                  : 'hover:bg-red-50 text-red-600'
              }`}
              title="Clear all logs"
            >
              <Trash2 size={16} /> Clear Logs
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b text-xs ${
          isDarkMode ? 'border-zinc-800/80 bg-zinc-900/20' : 'border-zinc-100 bg-zinc-50/50'
        }`}>
          <div className={`p-3 rounded-2xl border ${isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Runs</span>
            <p className="text-lg font-extrabold text-indigo-500 mt-0.5">{totalRuns}</p>
          </div>
          <div className={`p-3 rounded-2xl border ${isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cascade Fallbacks</span>
            <p className="text-lg font-extrabold text-amber-500 mt-0.5">{fallbackRuns}</p>
          </div>
          <div className={`p-3 rounded-2xl border ${isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Errors</span>
            <p className="text-lg font-extrabold text-red-500 mt-0.5">{errorRuns}</p>
          </div>
          <div className={`p-3 rounded-2xl border ${isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Average Latency</span>
            <p className="text-lg font-extrabold text-emerald-500 mt-0.5">{avgLatency} ms</p>
          </div>
        </div>

        {/* Content body: 2 columns */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Log list */}
          <div className={`w-full md:w-5/12 border-r overflow-y-auto p-3 space-y-2 max-h-[50vh] md:max-h-none ${
            isDarkMode ? 'border-zinc-800' : 'border-zinc-200'
          }`}>
            {logs.length === 0 ? (
              <div className="py-16 text-center text-xs opacity-50 space-y-2">
                <Clock size={32} className="mx-auto mb-2 opacity-40" />
                <p>No AI executions recorded yet.</p>
                <p className="text-[10px]">Send a message or generate an image to record live runs.</p>
              </div>
            ) : (
              logs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? isDarkMode
                          ? 'bg-zinc-800/90 border-indigo-500 shadow-md shadow-indigo-500/10'
                          : 'bg-indigo-50/80 border-indigo-300 shadow-sm'
                        : isDarkMode
                          ? 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900'
                          : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-zinc-400">{log.timestamp}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        log.status === 'success' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : log.status === 'fallback_success'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {log.status === 'fallback_success' ? 'Cascade' : log.status}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold line-clamp-1">
                      <span className="text-zinc-400">{log.actionType.toUpperCase()}:</span>
                      <span>{log.actualModel}</span>
                    </div>

                    <p className={`text-[11px] mt-1 line-clamp-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      "{log.promptSnippet}"
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock size={10} /> {log.totalLatencyMs}ms
                      </span>
                      <span className="font-semibold text-indigo-400">
                        {log.keySource === 'User Custom API Key' ? 'User Key' : 'Server Key'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Selected Log Details */}
          <div className="w-full md:w-7/12 overflow-y-auto p-5 space-y-4">
            {selectedLog ? (
              <div className="space-y-4 text-xs">
                {/* Header status card */}
                <div className={`p-4 rounded-2xl border ${
                  selectedLog.status === 'success' 
                    ? isDarkMode ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : selectedLog.status === 'fallback_success'
                      ? isDarkMode ? 'bg-amber-950/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                      : isDarkMode ? 'bg-red-950/20 border-red-800/40 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {selectedLog.status === 'success' && <CheckCircle2 size={18} className="text-emerald-500" />}
                    {selectedLog.status === 'fallback_success' && <AlertTriangle size={18} className="text-amber-500" />}
                    {selectedLog.status === 'error' && <XCircle size={18} className="text-red-500" />}
                    <span>
                      {selectedLog.status === 'success' && 'Completed Successfully with Target Model'}
                      {selectedLog.status === 'fallback_success' && 'Completed via Smart Cascade Fallback'}
                      {selectedLog.status === 'error' && 'Execution Failed'}
                    </span>
                  </div>
                  {selectedLog.status === 'fallback_success' && (
                    <p className="mt-1 text-[11px] opacity-90">
                      Target model encountered an issue or latency limit, so the system automatically switched to a verified stable model in the cascade chain.
                    </p>
                  )}
                  {selectedLog.errorMessage && (
                    <p className="mt-2 text-[11px] font-mono text-red-400 bg-black/30 p-2 rounded-lg">
                      {selectedLog.errorMessage}
                    </p>
                  )}
                </div>

                {/* Model Resolution Section */}
                <div className={`p-4 rounded-2xl border space-y-2.5 ${
                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}>
                  <h4 className="font-bold uppercase tracking-wider text-[10px] text-zinc-400 flex items-center gap-1.5">
                    <Cpu size={14} className="text-indigo-400" /> Model Resolution Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-zinc-400">User Requested:</span>
                      <p className="font-mono font-semibold text-indigo-400">{selectedLog.requestedModel}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Sanitized Target #1:</span>
                      <p className="font-mono font-semibold">{selectedLog.resolvedModel}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Actual Responding Model:</span>
                      <p className="font-mono font-bold text-emerald-400">{selectedLog.actualModel}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Total Latency:</span>
                      <p className="font-mono font-semibold">{selectedLog.totalLatencyMs} ms</p>
                    </div>
                  </div>
                </div>

                {/* Cascade Ladder Steps */}
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}>
                  <h4 className="font-bold uppercase tracking-wider text-[10px] text-zinc-400 flex items-center gap-1.5">
                    <Layers size={14} className="text-amber-400" /> Cascade Fallback Execution Chain
                  </h4>

                  <div className="space-y-1.5">
                    {selectedLog.attempts.map((attempt, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center justify-between p-2 rounded-xl text-xs font-mono border ${
                          attempt.success
                            ? isDarkMode ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-zinc-100 border-zinc-200 text-zinc-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] opacity-60">#{idx + 1}</span>
                          <span className="font-bold">{attempt.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{attempt.latencyMs}ms</span>
                          {attempt.success ? (
                            <span className="text-emerald-400 font-bold">✓ Success</span>
                          ) : (
                            <span className="text-red-400 font-bold" title={attempt.error}>✕ Failed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedLog.fallbackChain && selectedLog.fallbackChain.length > 0 && (
                    <div className="pt-2 border-t border-zinc-500/10 text-[10px]">
                      <span className="text-zinc-400">Full pre-computed ladder: </span>
                      <span className="font-mono opacity-80">{selectedLog.fallbackChain.join(' ➔ ')}</span>
                    </div>
                  )}
                </div>

                {/* Environment & Security Info */}
                <div className={`p-4 rounded-2xl border space-y-2 ${
                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}>
                  <h4 className="font-bold uppercase tracking-wider text-[10px] text-zinc-400 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-sky-400" /> Environment & Credentials
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-400">Key Source:</span>
                      <p className="font-semibold text-indigo-400">{selectedLog.keySource}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400">Environment:</span>
                      <p className="font-semibold">{selectedLog.environment}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center text-xs opacity-50">
                Select a log entry on the left to inspect detailed telemetry.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
