import React, { useState } from 'react';
import { 
  Key, 
  X, 
  Check, 
  Copy, 
  Trash2, 
  Eye, 
  EyeOff, 
  Zap, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Server,
  UserCheck
} from 'lucide-react';
import { testGeminiApiKey } from '../services/geminiClientService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeApiKey: string;
  onSaveApiKey: (newKey: string) => void;
  onClearApiKey: () => void;
  isDarkMode: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  activeApiKey,
  onSaveApiKey,
  onClearApiKey,
  isDarkMode,
}) => {
  const [inputValue, setInputValue] = useState<string>(activeApiKey || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    model?: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    const keyToTest = inputValue.trim();
    if (!keyToTest) {
      setTestResult({
        success: false,
        error: 'Please enter an API Key to test.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testGeminiApiKey(keyToTest);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        error: e?.message || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    onSaveApiKey(trimmed);
    onClose();
  };

  const handleCopy = () => {
    if (inputValue) {
      navigator.clipboard.writeText(inputValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setInputValue('');
    setTestResult(null);
    onClearApiKey();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`w-full max-w-lg rounded-3xl shadow-2xl border p-6 flex flex-col space-y-5 transition-all ${
        isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-500/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Key size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Gemini API Key Configuration</h3>
              <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Secure client-side storage & Multi-Source Key Resolution
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Current status badge */}
        <div className={`p-3 rounded-2xl border flex items-center gap-3 text-xs ${
          activeApiKey
            ? isDarkMode ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-600'
        }`}>
          {activeApiKey ? (
            <>
              <UserCheck size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold">Using User Custom API Key</p>
                <p className="text-[11px] opacity-80 font-mono">Stored securely in your browser LocalStorage</p>
              </div>
            </>
          ) : (
            <>
              <Server size={18} className="text-indigo-400 shrink-0" />
              <div>
                <p className="font-bold">Using Server-Side Proxy Environment Key</p>
                <p className="text-[11px] opacity-80">Requests will route via backend environment credentials if available</p>
              </div>
            </>
          )}
        </div>

        {/* Input Field */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
            Google Gemini API Key:
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="AIzaSy..."
              className={`w-full font-mono text-xs px-4 py-3 pr-20 rounded-2xl border focus:outline-none focus:ring-2 transition-all ${
                isDarkMode 
                  ? 'bg-zinc-900 border-zinc-800 text-emerald-400 focus:ring-indigo-500/40' 
                  : 'bg-zinc-50 border-zinc-300 text-emerald-600 focus:ring-indigo-500/30'
              }`}
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'
                }`}
                title={showKey ? 'Hide Key' : 'Show Key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {inputValue && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'
                  }`}
                  title="Copy Key"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
            testResult.success
              ? isDarkMode ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isDarkMode ? 'bg-red-950/30 border-red-800/40 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {testResult.success ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5 flex-1">
              <p className="font-bold">
                {testResult.success ? 'API Key Valid & Operational' : 'Test Failed'}
              </p>
              {testResult.success ? (
                <p className="text-[11px] opacity-80">
                  Latency: <span className="font-mono font-bold">{testResult.latencyMs} ms</span> via {testResult.model}
                </p>
              ) : (
                <p className="text-[11px] opacity-90 break-words font-mono">
                  {testResult.error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-500/10">
          <button
            onClick={handleTestKey}
            disabled={isTesting || !inputValue.trim()}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 ${
              isDarkMode 
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' 
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="text-amber-400" />}
            {isTesting ? 'Testing...' : 'Test Key'}
          </button>

          <div className="flex items-center gap-2">
            {activeApiKey && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
              >
                <Trash2 size={14} /> Clear
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-500/20 active:scale-95"
            >
              <Check size={14} /> Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
