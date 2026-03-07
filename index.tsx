import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { GoogleGenAI, Modality, Chat, GenerateContentResponse, Type, FunctionDeclaration } from "@google/genai";
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
  MessageSquare,
  History,
  Moon,
  Sun,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';

/** Utility for tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'model';
  text: string;
  images?: string[];
  isImageGen?: boolean;
  isSystem?: boolean; // เพิ่มตัวแปรนี้เพื่อแยกแยะว่าเป็นข้อความแจ้งเตือนจากระบบหรือไม่
}

interface AttachedImage {
  file: File;
  base64: string;
}

const App: React.FC = () => {
  // --- API Key States (แก้ไขให้อ่านค่า Synchronous ทันทีตอนโหลดแอป) ---
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    const stored = localStorage.getItem('gemini_api_key');
    return stored ? stored : 'no API key';
  });
  const [activeApiKey, setActiveApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });

  const [selectedTextModel, setSelectedTextModel] = useState<string>('gemini-3-flash-preview');
  const [selectedImageModel, setSelectedImageModel] = useState<string>('gemini-2.5-flash-image');
  const [attachedImages, setAttachedImages] = useState<(AttachedImage | null)[]>(Array(6).fill(null));
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatRef = useRef<Chat | null>(null);

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim();
    if (key && key !== 'no API key') {
      localStorage.setItem('gemini_api_key', key);
      setActiveApiKey(key);
      setChatHistory(prev => [...prev, { role: 'model', text: 'บันทึก API Key เข้าระบบสำเร็จ พร้อมใช้งานครับ!', isSystem: true }]);
    }
  };

  const handleCopyApiKey = () => {
    if (apiKeyInput && apiKeyInput !== 'no API key') {
      navigator.clipboard.writeText(apiKeyInput);
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKeyInput('');
    setActiveApiKey('');
    chatRef.current = null;
    setChatHistory(prev => [...prev, { role: 'model', text: 'ลบ API Key ออกจากระบบเรียบร้อยแล้วครับ', isSystem: true }]);
  };

  // --- AI Initialization ---
  const getAI = () => {
    if (!activeApiKey) {
      throw new Error("Missing API Key");
    }
    return new GoogleGenAI({ apiKey: activeApiKey });
  };
  
  const systemInstruction = `คุณคือ "AI ผู้เชี่ยวชาญในทุกๆ ด้าน ตามเนื้อหาที่ผู้ใช้ถามหรือสนทนาด้วย" ที่มีความรู้ลึกซึ้งในหลากหลายมิติ เช่น
- ด้านศาสนา เช่น พุทธ คริสต์​ อิสลาม​ ฮินดู รวมถึงลัทธิความเชื่อต่างๆ
- ด้านศิลปะ วัฒนธรรม การศึกษา
- ด้านวิทยาศาสตร์​ เทคโนโลยี​ วิศวกรรม คอมพิวเตอร์​ AI, programming, coding
- การแพทย์ สาธารณสุข เภสัชศาสตร์​ พยาบาล​
- การผลิตและการออกแบบสินค้า
- การตลาดและจิตวิทยาผู้บริโภค
- การออกแบบบรรจุภัณฑ์ (Packaging)
- การวิเคราะห์คู่แข่งและแนวโน้มตลาด
- เรื่องอื่นๆ ตามเนื้อหาที่ผู้ใช้ถามหรือสนทนาด้วย

คุณต้องให้คำปรึกษาที่เป็นประโยชน์ วิเคราะห์อย่างละเอียด และเมื่อผู้ใช้ต้องการภาพประกอบ คุณสามารถสร้างภาพประกอบ (Illustration) เพื่อช่วยให้ผู้ใช้เห็นภาพได้ชัดเจนขึ้น
หากคุณต้องการแสดงภาพประกอบให้ผู้ใช้เห็น ให้ใช้เครื่องมือ "generate_image" เสมอ พร้อมทั้งแสดง prompt เป็นภาษาอังกฤษอย่างละเอียดสำหรับสร้างภาพนั้นด้วย และดูให้แน่ใจว่าภาพได้ถูกสร้างแล้วอย่างสมบูรณ์จริงๆ หรือมี error อะไร ห้ามตอบเป็น JSON หรือโค้ดหลอกๆ
ตอบเป็นภาษาไทยที่สุภาพ เป็นกันเอง แต่มีความเป็นมืออาชีพ ถ้าผู้ใช้ยังไม่แสดงเจตนาว่าต้องการภาพประกอบ ก็ตอบคำถามก่อนโดยยังไม่ต้องสร้างภาพ`;

  const generateImageTool: FunctionDeclaration = {
    name: "generate_image",
    parameters: {
      type: Type.OBJECT,
      description: "สร้างภาพประกอบสินค้าหรือบรรจุภัณฑ์ตามคำบรรยาย",
      properties: {
        prompt: {
          type: Type.STRING,
          description: "คำบรรยายภาพที่ต้องการสร้างอย่างละเอียด (ภาษาอังกฤษจะให้ผลลัพธ์ที่ดีกว่า)",
        },
        aspect_ratio: {
          type: Type.STRING,
          description: "อัตราส่วนภาพ เช่น '1:1', '16:9', '9:16'",
        }
      },
      required: ["prompt"],
    },
  };

  // กรองและจับคู่ประวัติแชทให้ถูกต้องก่อนส่งให้ AI (ป้องกัน Error 400)
  const buildValidHistory = (history: Message[]) => {
    const filtered = history.filter(msg => !msg.isSystem && !msg.isImageGen);
    const pairedHistory = [];
    
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i].role === 'user' && filtered[i+1].role === 'model') {
        pairedHistory.push(
          { role: 'user', parts: [{ text: filtered[i].text }] },
          { role: 'model', parts: [{ text: filtered[i+1].text }] }
        );
        i++; // ข้าม index ถัดไปเพราะถูกจับคู่ไปแล้ว
      }
    }
    return pairedHistory;
  };

  const initializeChat = (history: Message[] = []) => {
    if (!activeApiKey) return; // ไม่ต้องแจ้งเตือนรัวๆ ตอนโหลดหน้า ให้เงียบไว้

    try {
      const ai = getAI();
      const geminiHistory = buildValidHistory(history) as any;
      
      chatRef.current = ai.chats.create({
        model: selectedTextModel,
        history: geminiHistory,
        config: { 
          systemInstruction,
          tools: [{ functionDeclarations: [generateImageTool] }]
        }
      });
    } catch (error) {
      console.error("Failed to initialize chat:", error);
    }
  };

  useEffect(() => {
    initializeChat(chatHistory);
  }, [selectedTextModel, activeApiKey]);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isLoading]);

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

  const performImageGeneration = async (prompt: string, aspectRatio: string = "1:1", attachedImagesData: any[] = []) => {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: selectedImageModel,
        contents: { parts: [...attachedImagesData, { text: prompt }] },
        config: {
          responseModalities: [Modality.IMAGE],
          imageConfig: {
            aspectRatio: (aspectRatio as any) || "1:1"
          }
        },
      });

      let imageFound = false;
      const parts = response.candidates?.[0]?.content.parts ?? [];
      
      for (const part of parts) {
        if (part.inlineData) {
          const base64ImageBytes: string = part.inlineData.data;
          const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
          setGeneratedImages(prev => [imageUrl, ...prev]);
          setChatHistory(prev => [...prev, { 
            role: 'model', 
            text: `สร้างภาพเสร็จแล้วครับสำหรับ: "${prompt}"`,
            isImageGen: true
          }]);
          imageFound = true;
          break;
        }
      }
      
      if (!imageFound) {
        setChatHistory(prev => [...prev, { role: 'model', text: 'ขออภัยครับ ผมไม่สามารถสร้างภาพได้ในขณะนี้ ลองเปลี่ยนคำบรรยายดูนะครับ', isSystem: true }]);
      }
    } catch (error) {
      console.error("Image Gen Error:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: 'เกิดข้อผิดพลาดในการสร้างภาพครับ โปรดตรวจสอบ API Key อีกครั้ง', isSystem: true }]);
    }
  };

  const handleSendMessage = async () => {
    if (!activeApiKey) {
      setChatHistory(prev => [...prev, { role: 'model', text: 'กรุณากรอก API Key ในช่องด้านบนสุดแล้วกดปุ่ม Send ก่อนส่งข้อความครับ', isSystem: true }]);
      return;
    }

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
      if (!chatRef.current) {
        initializeChat(chatHistory);
      }
      
      if (!chatRef.current) {
        throw new Error("Chat could not be initialized.");
      }

      const imageParts = await Promise.all(
        currentImages
          .filter((img): img is AttachedImage => img !== null)
          .map(async (img) => ({
             inlineData: {
              mimeType: img.file.type,
              data: img.base64,
            },
          }))
      );
      
      const prompt = imageParts.length > 0 
        ? `[มีรูปภาพแนบมาด้วย ${imageParts.length} รูป] ${currentUserInput}`
        : currentUserInput;

      const response = await chatRef.current!.sendMessage({ message: [...imageParts, { text: prompt }] });
      
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === 'generate_image') {
            const { prompt: genPrompt, aspect_ratio } = call.args as any;
            await performImageGeneration(genPrompt, aspect_ratio, imageParts);
          }
        }
      } else {
        const responseText = response.text || "ขออภัยครับ ผมไม่เข้าใจคำถามนี้";
        setChatHistory(prev => [...prev, { role: 'model', text: responseText }]);
      }
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      // เพิ่ม isSystem: true เพื่อไม่ให้ข้อความ Error ถูกส่งกลับไปเป็น History ในรอบถัดไป
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: `เกิดข้อผิดพลาดในการสื่อสารกับ AI (${error?.message || 'Unknown Error'}) กรุณาตรวจสอบความถูกต้องของ API Key และลองใหม่อีกครั้งครับ`, 
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
          initializeChat(loadedHistory);
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
      "max-w-6xl mx-auto min-h-screen md:h-screen flex flex-col font-sans transition-colors duration-500",
      isDarkMode ? "dark bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      
      {/* API Key Banner Config */}
      <div className={cn(
        "w-full px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-b transition-colors",
        isDarkMode ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <label className={cn(
          "whitespace-nowrap font-bold text-sm",
          isDarkMode ? "text-zinc-300" : "text-zinc-700"
        )}>
          Google AI Studio API Key:
        </label>
        <input
          type="text"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="Enter your API Key here..."
          className={cn(
            "flex-1 w-full max-w-2xl font-mono text-sm px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all",
            isDarkMode 
              ? "bg-zinc-950 border-zinc-700 text-emerald-400 focus:ring-indigo-500/50" 
              : "bg-zinc-50 border-zinc-300 text-emerald-600 focus:ring-indigo-500/50"
          )}
        />
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={handleSaveApiKey}
            className="flex-1 md:flex-none flex justify-center items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 active:scale-95"
          >
            <Send size={16} /> Send
          </button>
          <button 
            onClick={handleCopyApiKey}
            className={cn(
              "flex-1 md:flex-none flex justify-center items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-95",
              isDarkMode ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
            )}
            title="Copy API Key"
          >
            <Copy size={16} /> Copy
          </button>
          <button 
            onClick={handleClearApiKey}
            className="flex-1 md:flex-none flex justify-center items-center gap-1.5 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 font-semibold text-sm rounded-xl transition-all active:scale-95"
            title="Clear System and Input"
          >
            <Trash2 size={16} /> Clear
          </button>
        </div>
      </div>

      {/* Header */}
      <header className={cn(
        "backdrop-blur-md border-b px-6 py-4 items-center justify-center text-center transition-all",
        isDarkMode 
          ? "bg-zinc-950/80 border-zinc-800 shadow-lg shadow-black/20" 
          : "bg-white/80 border-zinc-200 shadow-sm"
      )}>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => openFileInputRef.current?.click()}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isDarkMode ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"
            )}
            title="Open History"
          >
            <FolderOpen size={20} />
          </button>
          <button 
            onClick={handleSaveChat}
            disabled={chatHistory.length === 0 || isSaving}
            className={cn(
              "p-2 rounded-lg transition-colors disabled:opacity-30",
              isDarkMode ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"
            )}
            title="Save History"
          >
            <Save size={20} />
          </button>
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={openFileInputRef} 
            onChange={handleFileOpen} 
          />
        </div>

        <div className="items-center">
          <h1 className={cn(
            "text-5xl font-bold leading-tight tracking-tight",
            isDarkMode ? "text-white" : "text-zinc-900"
          )}>AI General Expert</h1>
          <br/>
          <div className="text-center items-center gap-2">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.2em]",
              isDarkMode ? "text-zinc-500" : "text-zinc-400"
            )}>Consultant & Illustrator</p>
            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">ts</p>
          </div>
        </div>
<br/>
        <div className="flex md:flex-row justify-between text-center items-center gap-3">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider mb-1",
              isDarkMode ? "text-zinc-500" : "text-zinc-400"
            )}>Text Reasoning Model</span>
            <select 
              value={selectedTextModel}
              onChange={(e) => setSelectedTextModel(e.target.value)}
              className={cn(
                "text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer p-0 text-right outline-none",
                isDarkMode ? "text-indigo-400" : "text-indigo-600"
              )}
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
              <option value="gemini-3-pro-preview">Gemini 3.0 Pro Preview</option>
              <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview</option>
              <option value="gemini-flash-latest">Gemini Flash Latest</option>
              <option value="gemini-flash-lite-latest">Gemini Flash Lite Latest</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-pro-latest">Gemini Pro (Latest Stable)</option>
            </select>
          </div>

          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider mb-1",
              isDarkMode ? "text-zinc-500" : "text-zinc-400"
            )}>Image Generation Model</span>
            <select 
              value={selectedImageModel}
              onChange={(e) => setSelectedImageModel(e.target.value)}
              className={cn(
                "text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer p-0 text-right outline-none",
                isDarkMode ? "text-emerald-400" : "text-emerald-600"
              )}
            >
              <option value="gemini-2.5-flash-image">gemini-2.5-flash-image (Default)</option>
              <option value="gemini-3-pro-image-preview">gemini-3-pro-image-preview</option>
              <option value="imagen-4.0-generate-001">imagen-4.0-generate-001</option>
              <option value="gemini-flash-image-latest">Gemini Flash Image Latest</option>
              <option value="gemini-pro-image-latest">Gemini Pro Image Latest</option>
              <option value="gemini-flash-latest">gemini-flash-latest</option>
              <option value="gemini-flash-lite-latest">gemini-flash-lite-latest</option>
              <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
              <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
              <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image</option>
            </select>
          </div>

          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "p-2 rounded-xl transition-all duration-300",
              isDarkMode 
                ? "bg-zinc-800 text-yellow-400 hover:bg-zinc-700 shadow-inner shadow-black/50" 
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 shadow-sm"
            )}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row min-h-0 md:overflow-hidden">
        {/* Chat Area */}
        <div className={cn(
          "flex-[2] flex flex-col min-w-0 border-r transition-colors h-[600px] md:h-full",
          isDarkMode ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-white"
        )}>
          <div 
            ref={chatHistoryRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
          >
            {chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
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
                <span>AI กำลังประมวลผล...</span>
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className={cn(
            "p-6 border-t transition-colors",
            isDarkMode ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-white"
          )}>
            {/* Image Attachments Preview */}
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

        {/* Sidebar - Generated Images */}
        <aside className={cn(
          "w-full md:w-80 flex flex-col transition-colors border-l md:border-l-0",
          isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50/50 border-zinc-200"
        )}>
          <div className={cn(
            "p-5 border-b flex items-center justify-between",
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
          
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);