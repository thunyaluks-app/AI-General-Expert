import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Cpu, 
  ImageIcon, 
  Key, 
  Activity, 
  Sun, 
  Moon, 
  ChevronUp, 
  Check, 
  Settings, 
  Zap, 
  Layers,
  ChevronDown
} from 'lucide-react';
import { type AIModel } from '../../aiModelsService';
import { executionTracker, ExecutionLogEntry } from '../services/executionTracker';

export interface ShortModelDisplay {
  version: string;
  family: string;
  variant: string;
  line1: string;
  line2: string;
  line3?: string;
  fullBadge: string;
}

/**
 * 6. Dynamic Short Model Display Extractor
 * Uses regex (\d+\.\d+) and keywords (Flash, Pro, Lite, Ultra, Image)
 * Formats clean 2-3 line badges dynamically without hardcoded version numbers!
 */
export function getShortModelDisplay(rawName: string): ShortModelDisplay {
  if (!rawName) {
    return { version: '', family: 'Gemini', variant: '', line1: 'Gemini', line2: 'AI', fullBadge: 'Gemini' };
  }

  // Strip prefix like "(20)", "(500)", "(0)"
  const clean = rawName.replace(/^\(\d+\)\s*/, '').trim();

  // Extract decimal version (\d+\.\d+) or integer version (\d+)
  const versionMatch = clean.match(/(\d+(?:\.\d+)?)/);
  const version = versionMatch ? versionMatch[1] : '';

  // Extract keywords
  const isLite = /lite/i.test(clean);
  const isFlash = /flash/i.test(clean);
  const isPro = /pro/i.test(clean);
  const isUltra = /ultra/i.test(clean);
  const isImage = /image|imagen/i.test(clean);
  const isPreview = /preview|exp/i.test(clean);
  const isLatest = /latest/i.test(clean);

  // Build family/tier label
  let family = '';
  if (isFlash && isLite) family = 'Flash Lite';
  else if (isFlash) family = 'Flash';
  else if (isPro) family = 'Pro';
  else if (isUltra) family = 'Ultra';
  else if (isImage) family = 'Image';
  else family = 'Standard';

  let variant = '';
  if (isLatest) variant = 'Latest';
  else if (isPreview) variant = 'Preview';
  else if (clean.includes('Banana')) variant = 'Pro';

  // Dynamic 2 or 3 lines
  let line1 = '';
  let line2 = '';
  let line3: string | undefined = undefined;

  if (version && family) {
    line1 = `${version} ${family}`;
    line2 = variant || (isImage ? 'Illustration' : 'Engine');
  } else if (version) {
    line1 = `Gemini ${version}`;
    line2 = variant || 'AI';
  } else {
    line1 = clean.length > 14 ? clean.slice(0, 14) + '...' : clean;
    line2 = family || 'AI';
  }

  const fullBadge = [version, family, variant].filter(Boolean).join(' ');

  return {
    version,
    family,
    variant,
    line1,
    line2,
    line3,
    fullBadge: fullBadge || clean,
  };
}

interface FloatingMenuProps {
  selectedTextModel: string;
  selectedImageModel: string;
  onSelectTextModel: (modelId: string) => void;
  onSelectImageModel: (modelId: string) => void;
  textModels: AIModel[];
  imageModels: AIModel[];
  onOpenLogModal: () => void;
  onOpenApiKeyModal: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isProcessing?: boolean;
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({
  selectedTextModel,
  selectedImageModel,
  onSelectTextModel,
  onSelectImageModel,
  textModels,
  imageModels,
  onOpenLogModal,
  onOpenApiKeyModal,
  isDarkMode,
  onToggleDarkMode,
  isProcessing = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'image' | null>(null);
  const [latestLog, setLatestLog] = useState<ExecutionLogEntry | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = executionTracker.subscribe((logs, latest) => {
      setLatestLog(latest);
    });
    return unsub;
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveTab(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentTextName = textModels.find(m => m.modelId === selectedTextModel)?.name || selectedTextModel;
  const currentImageName = imageModels.find(m => m.modelId === selectedImageModel)?.name || selectedImageModel;

  const shortText = getShortModelDisplay(currentTextName);
  const shortImage = getShortModelDisplay(currentImageName);

  // Status dot color based on last execution
  const getStatusColor = () => {
    if (isProcessing) return 'bg-sky-400 animate-ping';
    if (!latestLog) return 'bg-emerald-400';
    if (latestLog.status === 'success') return 'bg-emerald-400';
    if (latestLog.status === 'fallback_success') return 'bg-amber-400';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (isProcessing) return 'Processing...';
    if (!latestLog) return 'Ready';
    if (latestLog.status === 'fallback_success') return `Cascade (${latestLog.actualModel})`;
    if (latestLog.status === 'success') return `${latestLog.actualModel} (${latestLog.totalLatencyMs}ms)`;
    return 'Error';
  };

  return (
    <div ref={menuRef} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 pointer-events-auto">
      {/* Popover selector for Text or Image Models */}
      {activeTab && (
        <div className={`w-72 max-h-96 rounded-2xl p-3 shadow-2xl border backdrop-blur-xl transition-all overflow-hidden flex flex-col mb-1 animate-in fade-in zoom-in-95 ${
          isDarkMode 
            ? 'bg-zinc-900/95 border-zinc-700 text-zinc-100 shadow-black/60' 
            : 'bg-white/95 border-zinc-200 text-zinc-800 shadow-zinc-400/40'
        }`}>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-500/20 px-1">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              {activeTab === 'text' ? <Cpu size={14} className="text-indigo-400" /> : <ImageIcon size={14} className="text-emerald-400" />}
              {activeTab === 'text' ? 'Select Text Model' : 'Select Image Model'}
            </span>
            <span className="text-[10px] opacity-60">
              {activeTab === 'text' ? textModels.length : imageModels.length} models
            </span>
          </div>

          <div className="overflow-y-auto space-y-1.5 mt-2 pr-1 max-h-72 scrollbar-thin">
            {(activeTab === 'text' ? textModels : imageModels).map((model) => {
              const isSelected = activeTab === 'text' 
                ? model.modelId === selectedTextModel 
                : model.modelId === selectedImageModel;
              const short = getShortModelDisplay(model.name);

              return (
                <button
                  key={model.id || model.modelId}
                  onClick={() => {
                    if (activeTab === 'text') {
                      onSelectTextModel(model.modelId);
                    } else {
                      onSelectImageModel(model.modelId);
                    }
                    setActiveTab(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                    isSelected
                      ? activeTab === 'text'
                        ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                        : 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-500/20'
                      : isDarkMode
                        ? 'hover:bg-zinc-800/80 text-zinc-300'
                        : 'hover:bg-zinc-100 text-zinc-700'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-[11px] leading-tight">{model.name}</span>
                    <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-white/80' : isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {short.line1} • {short.line2}
                    </span>
                  </div>
                  {isSelected && <Check size={14} className="shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Floating Dock Bar */}
      <div className={`flex items-center gap-1.5 p-1.5 rounded-full border shadow-2xl backdrop-blur-md transition-all ${
        isDarkMode 
          ? 'bg-zinc-900/90 border-zinc-700/80 shadow-black/50 text-zinc-200' 
          : 'bg-white/90 border-zinc-200/90 shadow-indigo-500/10 text-zinc-800'
      }`}>
        {/* Dynamic Short Model Badge: Text */}
        <button
          onClick={() => setActiveTab(activeTab === 'text' ? null : 'text')}
          className={`flex flex-col items-start px-3 py-1.5 rounded-full transition-all text-left ${
            activeTab === 'text'
              ? 'bg-indigo-600 text-white shadow-md'
              : isDarkMode 
                ? 'hover:bg-zinc-800/80 text-zinc-300' 
                : 'hover:bg-zinc-100 text-zinc-700'
          }`}
          title={`Text Model: ${currentTextName} (Click to switch)`}
        >
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold tracking-wider uppercase text-indigo-400">Text</span>
            <ChevronDown size={10} className="opacity-60" />
          </div>
          <span className="text-[10px] font-bold leading-tight line-clamp-1">{shortText.line1}</span>
          <span className="text-[8px] opacity-70 leading-none">{shortText.line2}</span>
        </button>

        <div className={`h-6 w-px ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`} />

        {/* Dynamic Short Model Badge: Image */}
        <button
          onClick={() => setActiveTab(activeTab === 'image' ? null : 'image')}
          className={`flex flex-col items-start px-3 py-1.5 rounded-full transition-all text-left ${
            activeTab === 'image'
              ? 'bg-emerald-600 text-white shadow-md'
              : isDarkMode 
                ? 'hover:bg-zinc-800/80 text-zinc-300' 
                : 'hover:bg-zinc-100 text-zinc-700'
          }`}
          title={`Image Model: ${currentImageName} (Click to switch)`}
        >
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold tracking-wider uppercase text-emerald-400">Image</span>
            <ChevronDown size={10} className="opacity-60" />
          </div>
          <span className="text-[10px] font-bold leading-tight line-clamp-1">{shortImage.line1}</span>
          <span className="text-[8px] opacity-70 leading-none">{shortImage.line2}</span>
        </button>

        <div className={`h-6 w-px ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`} />

        {/* AI Execution Log Tracker Button with Pulsing Status Light */}
        <button
          onClick={onOpenLogModal}
          className={`relative p-2 rounded-full transition-all ${
            isDarkMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-100 text-zinc-600'
          }`}
          title={`AI Execution Tracker (${getStatusText()}) - Click to view logs`}
        >
          <Activity size={16} />
          {/* Pulsing status dot */}
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor()}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${getStatusColor()}`} />
          </span>
        </button>

        {/* API Key Modal Button */}
        <button
          onClick={onOpenApiKeyModal}
          className={`p-2 rounded-full transition-all ${
            isDarkMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-100 text-zinc-600'
          }`}
          title="Gemini API Key Settings"
        >
          <Key size={16} />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={onToggleDarkMode}
          className={`p-2 rounded-full transition-all ${
            isDarkMode ? 'hover:bg-zinc-800 text-amber-300' : 'hover:bg-zinc-100 text-zinc-600'
          }`}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};
