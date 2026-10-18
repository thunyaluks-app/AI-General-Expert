import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { 
  Send, 
  Image as ImageIcon, 
  X, 
  Download, 
  Trash2, 
  Plus, 
  Loader2, 
  Save, 
  FolderOpen,
  Sparkles,
  Moon,
  Sun,
  Copy,
  Activity,
  Key,
  Layers,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { 
  subscribeCentralAIModels,
  getDefaultModelForLevel1, 
  deduplicateModels,
  FALLBACK_TEXT_MODELS, 
  FALLBACK_IMAGE_MODELS, 
  type AIModel 
} from './aiModelsService';
import { 
  executeChatWithTracking, 
  executeImageWithTracking 
} from './src/services/geminiClientService';
import { resolveModelName } from './src/services/modelResolver';
import { FloatingMenu } from './src/components/FloatingMenu';
import { ExecutionTrackerModal } from './src/components/ExecutionTrackerModal';
import { ApiKeyModal } from './src/components/ApiKeyModal';
import { executionTracker, ExecutionLogEntry } from './src/services/executionTracker';

/** Utility for tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'model';
  text: string;
  images?: string[];
  isImageGen?: boolean;
  isSystem?: boolean;
  actualModel?: string;
  usedFallback?: boolean;
}

interface AttachedImage {
  file: File;
  base64: string;
}

const App: React.FC = () => {
  // --- API Key States ---
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    const stored = localStorage.getItem('gemini_api_key');
    return stored ? stored : '';
  });
  const [activeApiKey, setActiveApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });

  // Centralized AI Models State
  const [textModels, setTextModels] = useState<AIModel[]>(FALLBACK_TEXT_MODELS);
  const [imageModels, setImageModels] = useState<AIModel[]>(FALLBACK_IMAGE_MODELS);
  const [selectedTextModel, setSelectedTextModel] = useState<string>(() => 
    getDefaultModelForLevel1(FALLBACK_TEXT_MODELS, 'gemini-3.6-flash')
  );
  const [selectedImageModel, setSelectedImageModel] = useState<string>(() => 
    getDefaultModelForLevel1(FALLBACK_IMAGE_MODELS, 'gemini-3-pro-image')
  );

  // Attached images (up to 6)
  const [attachedImages, setAttachedImages] = useState<(AttachedImage | null)[]>(Array(6).fill(null));
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Modals
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [latestLog, setLatestLog] = useState<ExecutionLogEntry | null>(null);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe to real-time Centralized AI Models Registry in Firestore
  useEffect(() => {
    const unsubscribe = subscribeCentralAIModels((models) => {
      if (models && models.length > 0) {
        const textCategoryList = deduplicateModels(models.filter(m => 
          ['text_reasoning', 'text', 'text_gen', 'chat'].includes(m.category)
        ));
        const imageCategoryList = deduplicateModels(models.filter(m => 
          ['image_gen', 'image', 'image_generation'].includes(m.category)
        ));

        if (textCategoryList.length > 0) {
          setTextModels(textCategoryList);
        }
        if (imageCategoryList.length > 0) {
          setImageModels(imageCategoryList);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to Execution Tracker for live status pulse
  useEffect(() => {
    const unsub = executionTracker.subscribe((logs, latest) => {
      setLatestLog(latest);
    });
    return unsub;
  }, []);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isLoading]);

  const handleSaveApiKey = (keyToSave?: string) => {
    const key = (keyToSave !== undefined ? keyToSave : apiKeyInput).trim();
    if (key && key !== 'no API key') {
      localStorage.setItem('gemini_api_key', key);
      setActiveApiKey(key);
      setApiKeyInput(key);
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: 'บันทึก API Key เข้าระบบสำเร็จ พร้อมใช้งานด้วยระบบ Dual-Layer Resilient Engine ครับ!', 
        isSystem: true 
      }]);
    }
  };

  const handleCopyApiKey = () => {
    if (activeApiKey || apiKeyInput) {
      navigator.clipboard.writeText(activeApiKey || apiKeyInput);
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKeyInput('');
    setActiveApiKey('');
    setChatHistory(prev => [...prev, { 
      role: 'model', 
      text: 'ลบ Custom API Key ออกจากระบบแล้ว (ระบบจะสลับใช้ Server Environment Key หากมี)', 
      isSystem: true 
    }]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      const newImages = [...attachedImages];
      newImages[index] = { file, base64 };
      setAttachedImages(newImages);
    }
  };

  const clearImage = (index: number) => {
    const newImages = [...attachedImages];
    newImages[index] = null;
    setAttachedImages(newImages);
    if (fileInputRefs.current[index]) {
      fileInputRefs.current[index]!.value = '';
    }
  };

  // 3. Image Generation with Smart Cascade Fallback
  const performImageGeneration = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    attachedImagesData: any[] = []
  ) => {
    try {
      const result = await executeImageWithTracking({
        prompt,
        aspectRatio,
        attachedImagesData,
        requestedModel: selectedImageModel,
        activeApiKey,
        availableModels: imageModels,
      });

      if (result.imageUrl) {
        setGeneratedImages(prev => [result.imageUrl, ...prev]);
        setChatHistory(prev => [...prev, { 
          role: 'model', 
          text: `สร้างภาพเสร็จแล้วครับสำหรับ: "${prompt}" ${
            result.usedFallback ? `\n\n*(สลับใช้โมเดลสำรอง ${result.actualModel} อัตโนมัติ)*` : ''
          }`,
          isImageGen: true,
          actualModel: result.actualModel,
          usedFallback: result.usedFallback,
        }]);
      } else {
        setChatHistory(prev => [...prev, { 
          role: 'model', 
          text: 'ขออภัยครับ ไม่สามารถสร้างภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้งครับ', 
          isSystem: true 
        }]);
      }
    } catch (error: any) {
      console.error("Image Gen Error:", error);
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: `เกิดข้อผิดพลาดในการสร้างภาพ: ${error?.message || 'Unknown error'}`, 
        isSystem: true 
      }]);
    }
  };

  // 3. Text Message Handler with Smart Cascade Fallback
  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    const hasImages = attachedImages.some(img => img !== null);
    
    if (!trimmedInput && !hasImages) return;
    
    const currentUserInput = trimmedInput;
    const currentImages = [...attachedImages];
    
    const userImages = currentImages
      .filter((img): img is AttachedImage => img !== null)
      .map(img => `data:${img.file.type};base64,${img.base64}`);

    setChatHistory(prev => [...prev, { 
      role: 'user', 
      text: currentUserInput, 
      images: userImages.length > 0 ? userImages : undefined 
    }]);
    
    setUserInput('');
    setAttachedImages(Array(6).fill(null));
    setIsLoading(true);

    try {
      const imageParts = currentImages
        .filter((img): img is AttachedImage => img !== null)
        .map(img => ({
          inlineData: {
            mimeType: img.file.type,
            data: img.base64,
          },
        }));

      const result = await executeChatWithTracking({
        prompt: currentUserInput,
        history: chatHistory,
        images: userImages,
        requestedModel: selectedTextModel,
        activeApiKey,
        availableModels: textModels,
      });

      // Handle function calling if generate_image was invoked
      if (result.functionCalls && result.functionCalls.length > 0) {
        for (const call of result.functionCalls) {
          if (call.name === 'generate_image') {
            const { prompt: genPrompt, aspect_ratio } = call.args as any;
            await performImageGeneration(genPrompt, aspect_ratio, imageParts);
          }
        }
      } else {
        const responseText = result.text || "ขออภัยครับ ผมไม่เข้าใจคำถามนี้";
        let displayNotice = '';
        if (result.usedFallback) {
          displayNotice = `\n\n*(หมายเหตุ: ระบบสลับใช้โมเดลสำรอง ${result.actualModel} อัตโนมัติเพื่อความต่อเนื่อง)*`;
        }

        setChatHistory(prev => [...prev, { 
          role: 'model', 
          text: responseText + displayNotice,
          actualModel: result.actualModel,
          usedFallback: result.usedFallback,
        }]);
      }
    } catch (error: any) {
      console.error("Error in AI execution:", error);
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: `เกิดข้อผิดพลาดในการสื่อสารกับ AI (${error?.message || 'Connection error'}) กรุณาตรวจสอบ API Key ในเมนูตั้งค่าและลองใหม่อีกครั้งครับ`, 
        isSystem: true 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChat = async () => {
    if (chatHistory.length === 0) return;
    setIsSaving(true);
    try {
      const date = new Date();
      const filename = `chat_expert_${date.getTime()}.json`;
      const data = JSON.stringify(chatHistory, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch(error) {
      console.error("Failed to save chat:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const loadedHistory = JSON.parse(content);
        if (Array.isArray(loadedHistory)) {
          setChatHistory(loadedHistory);
        }
      } catch (error) {
        console.error("Error opening chat file:", error);
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveImage = (imageUrl: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `ai-expert-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={cn(
      "w-full min-h-screen flex flex-col font-sans transition-colors duration-500 overflow-x-hidden relative",
      isDarkMode ? "dark bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      
      {/* Top Banner: Quick Key & Execution Tracker Status */}
      <div className={cn(
        "w-full px-6 py-2 flex flex-col lg:flex-row items-center justify-between gap-3 border-b transition-colors",
        isDarkMode ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <div className="flex items-center gap-3 flex-1 w-full max-w-3xl">
          <label className={cn(
            "whitespace-nowrap font-bold text-[11px] uppercase tracking-wider opacity-70 flex items-center gap-1",
            isDarkMode ? "text-zinc-300" : "text-zinc-700"
          )}>
            <Key size={12} /> API Key:
          </label>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={activeApiKey ? "••••••••••••••••••••••••" : "Paste Gemini API Key or use Server Proxy..."}
            className={cn(
              "flex-1 font-mono text-xs px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 transition-all",
              isDarkMode 
                ? "bg-zinc-950 border-zinc-700 text-emerald-400 focus:ring-indigo-500/50" 
                : "bg-zinc-50 border-zinc-300 text-emerald-600 focus:ring-indigo-500/50"
            )}
          />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button 
            onClick={() => handleSaveApiKey()}
            className="flex-1 lg:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-indigo-500/20 active:scale-95"
          >
            <Send size={14} /> Send
          </button>
          <button 
            onClick={handleCopyApiKey}
            className={cn(
              "flex-1 lg:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all active:scale-95",
              isDarkMode ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
            )}
            title="Copy API Key"
          >
            <Copy size={14} /> Copy
          </button>
          <button 
            onClick={handleClearApiKey}
            className="flex-1 lg:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 font-bold text-xs rounded-lg transition-all active:scale-95"
            title="Clear API Key"
          >
            <Trash2 size={14} /> Clear
          </button>

          {/* AI Log Tracker Button */}
          <button
            onClick={() => setIsLogModalOpen(true)}
            className={cn(
              "flex-1 lg:flex-none flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all active:scale-95 border",
              latestLog?.status === 'fallback_success'
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : isDarkMode 
                  ? "bg-zinc-800/80 hover:bg-zinc-800 text-indigo-400 border-zinc-700" 
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200"
            )}
            title="Open AI Execution Log"
          >
            <Activity size={14} />
            <span>AI Log</span>
            {latestLog && (
              <span className={`w-2 h-2 rounded-full ${
                latestLog.status === 'success' 
                  ? 'bg-emerald-400' 
                  : latestLog.status === 'fallback_success' 
                    ? 'bg-amber-400 animate-pulse' 
                    : 'bg-red-400'
              }`} />
            )}
          </button>
        </div>
      </div>

      {/* Header */}
      <header className={cn(
        "backdrop-blur-md border-b px-6 py-2 flex flex-col gap-2 transition-all",
        isDarkMode 
          ? "bg-zinc-950/80 border-zinc-800 shadow-lg shadow-black/20" 
          : "bg-white/80 border-zinc-200 shadow-sm"
      )}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1 order-2 lg:order-1">
            <button 
              onClick={() => openFileInputRef.current?.click()}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                isDarkMode ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"
              )}
              title="Open History"
            >
              <FolderOpen size={18} />
            </button>
            <button 
              onClick={handleSaveChat}
              disabled={chatHistory.length === 0 || isSaving}
              className={cn(
                "p-1.5 rounded-lg transition-colors disabled:opacity-30",
                isDarkMode ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"
              )}
              title="Save History"
            >
              <Save size={18} />
            </button>
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={openFileInputRef} 
              onChange={handleFileOpen} 
            />
          </div>

          <div className="flex flex-col items-center text-center order-1 lg:order-2">
            <h1 className={cn(
              "text-4xl lg:text-5xl font-bold leading-tight tracking-tight",
              isDarkMode ? "text-white" : "text-zinc-900"
            )}>AI General Expert</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className={cn(
                "text-[8px] font-bold uppercase tracking-[0.2em]",
                isDarkMode ? "text-zinc-500" : "text-zinc-400"
              )}>Dual-Layer Resilient Engine • Smart Cascade</p>
              <span className="w-0.5 h-0.5 rounded-full bg-indigo-500"></span>
              <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">ts</p>
            </div>
          </div>

          <div className="flex items-center gap-3 order-3">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "p-2 rounded-lg transition-all duration-300",
                isDarkMode 
                  ? "bg-zinc-800 text-yellow-400 hover:bg-zinc-700 shadow-inner shadow-black/50" 
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 shadow-sm"
              )}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* Live Synchronized Top Header Dropdowns */}
        <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 py-1 border-t border-zinc-400/10">
          {textModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[8px] font-bold uppercase tracking-wider",
                isDarkMode ? "text-zinc-500" : "text-zinc-400"
              )}>Text:</span>
              <select 
                value={selectedTextModel}
                onChange={(e) => setSelectedTextModel(e.target.value)}
                className={cn(
                  "text-[10px] font-bold bg-transparent border-none focus:ring-0 cursor-pointer p-0 outline-none",
                  isDarkMode ? "text-indigo-400" : "text-indigo-600"
                )}
              >
                {deduplicateModels(textModels).map((m) => (
                  <option key={m.id || m.modelId} value={m.modelId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {imageModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[8px] font-bold uppercase tracking-wider",
                isDarkMode ? "text-zinc-500" : "text-zinc-400"
              )}>Image:</span>
              <select 
                value={selectedImageModel}
                onChange={(e) => setSelectedImageModel(e.target.value)}
                className={cn(
                  "text-[10px] font-bold bg-transparent border-none focus:ring-0 cursor-pointer p-0 outline-none",
                  isDarkMode ? "text-emerald-400" : "text-emerald-600"
                )}
              >
                {deduplicateModels(imageModels).map((m) => (
                  <option key={m.id || m.modelId} value={m.modelId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row pb-20">
        {/* Chat Area */}
        <div className={cn(
          "flex-1 lg:flex-[2] flex flex-col min-w-0 border-r transition-colors",
          isDarkMode ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-white"
        )}>
          <div 
            ref={chatHistoryRef}
            className="flex-1 p-4 lg:p-6 space-y-6 scroll-smooth overflow-y-auto"
          >
            {chatHistory.length === 0 && (
              <div className="min-h-[300px] flex flex-col items-center justify-center text-center p-8 space-y-6">
                <div className={cn(
                  "w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl transition-all duration-500",
                  isDarkMode 
                    ? "bg-zinc-900 text-indigo-400 shadow-indigo-500/10 border border-zinc-800" 
                    : "bg-zinc-100 text-zinc-400"
                )}>
                  <Sparkles size={40} />
                </div>
                <div className="max-w-sm space-y-2">
                  <h3 className={cn(
                    "text-xl font-bold",
                    isDarkMode ? "text-white" : "text-zinc-900"
                  )}>สวัสดีครับ! ผมคือผู้เชี่ยวชาญในทุกด้าน</h3>
                  <p className={cn(
                    "text-sm leading-relaxed",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500"
                  )}>
                    ปรึกษาได้ทุกเรื่อง รวมถึงเรื่องการตลาด การออกแบบ หรือสร้างภาพประกอบสินค้า ตัวอย่างเช่น:
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-4">
                  {['ช่วยออกแบบบรรจุภัณฑ์เครื่องสำอาง', 'วิเคราะห์จุดเด่นของกาแฟอาราบิก้า', 'สร้างภาพขวดน้ำสไตล์มินิมอล', 'แนะนำกลยุทธ์การตลาดออนไลน์'].map((suggestion) => (
                    <button 
                      key={suggestion}
                      onClick={() => setUserInput(suggestion)}
                      className={cn(
                        "text-left p-4 text-xs font-semibold rounded-2xl transition-all border",
                        isDarkMode 
                          ? "bg-zinc-900/50 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700" 
                          : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                      )}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {chatHistory.map((msg, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className={cn(
                    "px-5 py-4 rounded-3xl text-sm shadow-md transition-all",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/20" 
                      : msg.isSystem
                        ? isDarkMode ? "bg-red-900/20 text-red-400 border border-red-900/50 rounded-tl-none" : "bg-red-50 text-red-600 border border-red-200 rounded-tl-none"
                        : isDarkMode 
                          ? "bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-tl-none" 
                          : "bg-zinc-100 text-zinc-800 rounded-tl-none"
                  )}>
                    <div className={cn(
                      "markdown-body",
                      isDarkMode ? "prose prose-invert max-w-none" : ""
                    )}>
                      <Markdown>{msg.text}</Markdown>
                    </div>
                    
                    {msg.images && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {msg.images.map((img, i) => (
                          <img 
                            key={i} 
                            src={img} 
                            alt="Attached" 
                            className="rounded-xl w-full aspect-square object-cover border border-white/10 shadow-lg" 
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fallback indicator footnote */}
                  {msg.usedFallback && msg.actualModel && (
                    <span className="text-[10px] mt-1 text-amber-500 font-medium flex items-center gap-1">
                      <AlertTriangle size={10} /> Fallback to {msg.actualModel}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-indigo-500 text-xs font-bold tracking-wide"
              >
                <Loader2 size={16} className="animate-spin" />
                <span>AI กำลังประมวลผลผ่าน Dual-Layer Cascade Engine...</span>
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className={cn(
            "p-3 lg:p-4 border-t transition-colors",
            isDarkMode ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-white"
          )}>
            {/* Image Attachments Preview (6 slots) */}
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
              {attachedImages.map((img, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "relative flex-shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed transition-all overflow-hidden group",
                    img 
                      ? isDarkMode ? "border-indigo-500 bg-indigo-500/10" : "border-indigo-200 bg-indigo-50" 
                      : isDarkMode ? "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50" : "border-zinc-200 hover:border-zinc-300 bg-zinc-50"
                  )}
                >
                  {img ? (
                    <>
                      <img 
                        src={`data:${img.file.type};base64,${img.base64}`} 
                        className="w-full h-full object-cover" 
                        alt="Preview"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        onClick={() => clearImage(idx)}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => fileInputRefs.current[idx]?.click()}
                      className={cn(
                        "w-full h-full flex items-center justify-center transition-colors",
                        isDarkMode ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-500"
                      )}
                    >
                      <Plus size={24} />
                    </button>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={el => { fileInputRefs.current[idx] = el; }}
                    onChange={(e) => handleImageSelect(e, idx)}
                  />
                </div>
              ))}
            </div>

            <div className="relative flex items-end gap-3">
              <div className="relative flex-1">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="พิมพ์ข้อความที่นี่... (ลองพิมพ์ 'สร้างภาพ...')"
                  className={cn(
                    "w-full border rounded-3xl px-6 py-4 pr-14 text-sm focus:outline-none focus:ring-4 transition-all resize-none min-h-[60px] max-h-40 shadow-inner",
                    isDarkMode 
                      ? "bg-zinc-900 border-zinc-800 text-white focus:ring-indigo-500/10 focus:border-indigo-500" 
                      : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-indigo-500/5 focus:border-indigo-500"
                  )}
                  rows={1}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || (!userInput.trim() && !attachedImages.some(img => img !== null))}
                  className={cn(
                    "absolute right-2.5 bottom-2.5 p-3 rounded-2xl transition-all shadow-lg",
                    isDarkMode 
                      ? "bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-zinc-800 disabled:text-zinc-600" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30"
                  )}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Generated Gallery */}
        <aside className={cn(
          "w-full lg:w-80 flex flex-col transition-colors border-l lg:border-l-0",
          isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50/50 border-zinc-200"
        )}>
          <div className={cn(
            "p-3 border-b flex items-center justify-between",
            isDarkMode ? "bg-zinc-900/30 border-zinc-800" : "bg-white/50 border-zinc-200"
          )}>
            <div className="flex items-center gap-2 font-bold text-sm">
              <ImageIcon size={20} className="text-indigo-500" />
              <span className={isDarkMode ? "text-zinc-200" : "text-zinc-900"}>Generated Gallery</span>
            </div>
            <span className={cn(
              "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
              isDarkMode ? "bg-zinc-800 text-zinc-400" : "bg-zinc-200 text-zinc-600"
            )}>
              {generatedImages.length} Images
            </span>
          </div>
          
          <div className="p-5 space-y-5 flex-1 overflow-y-auto">
            {generatedImages.length === 0 ? (
              <div className={cn(
                "h-64 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-3xl transition-colors",
                isDarkMode ? "border-zinc-800 bg-zinc-900/20" : "border-zinc-200 bg-white/50"
              )}>
                <ImageIcon size={40} className={isDarkMode ? "text-zinc-800" : "text-zinc-300"} />
                <p className={cn(
                  "text-xs font-bold mt-4 uppercase tracking-widest",
                  isDarkMode ? "text-zinc-700" : "text-zinc-400"
                )}>Gallery Empty</p>
              </div>
            ) : (
              <AnimatePresence>
                {generatedImages.map((img, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "group relative rounded-3xl overflow-hidden shadow-xl border transition-all",
                      isDarkMode ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
                    )}
                  >
                    <div className="relative">
                      <img 
                        src={img} 
                        alt="Generated" 
                        className="w-full aspect-square object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        onClick={() => setGeneratedImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 p-2 bg-black/40 hover:bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className={cn(
                      "p-3 border-t",
                      isDarkMode ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/30"
                    )}>
                      <button 
                        onClick={() => handleSaveImage(img)}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm",
                          isDarkMode 
                            ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10" 
                            : "bg-white hover:bg-zinc-50 text-indigo-600 border border-zinc-200"
                        )}
                      >
                        <Download size={14} /> Download Image
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </aside>
      </main>

      {/* 6. Dynamic Floating Menu with Live Sync and Regex Short Display */}
      <FloatingMenu
        selectedTextModel={selectedTextModel}
        selectedImageModel={selectedImageModel}
        onSelectTextModel={setSelectedTextModel}
        onSelectImageModel={setSelectedImageModel}
        textModels={textModels}
        imageModels={imageModels}
        onOpenLogModal={() => setIsLogModalOpen(true)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isProcessing={isLoading}
      />

      {/* 7. AI Execution Tracker & Model Transparency Modal */}
      <ExecutionTrackerModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      {/* 7. Gemini API Key Configuration & Test Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        activeApiKey={activeApiKey}
        onSaveApiKey={(newKey) => handleSaveApiKey(newKey)}
        onClearApiKey={handleClearApiKey}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);