
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
  Sun
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
}

interface AttachedImage {
  file: File;
  base64: string;
}

const App: React.FC = () => {
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

  const getAI = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY. Please set it in your environment variables.");
    }
    return new GoogleGenAI({ apiKey });
  };
  
  const systemInstruction = `คุณคือ "AI ผู้เชี่ยวชาญด้านผลิตภัณฑ์ รวมถึงเรื่องอื่นๆ ตามเนื้อหาที่ผู้ใช้ถามหรือสนทนาด้วย" ที่มีความรู้ลึกซึ้งในหลากหลายมิติ
- การผลิตและการออกแบบสินค้า
- การตลาดและจิตวิทยาผู้บริโภค
- การออกแบบบรรจุภัณฑ์ (Packaging)
- การวิเคราะห์คู่แข่งและแนวโน้มตลาด
- เรื่องอื่นๆ ตามเนื้อหาที่ผู้ใช้ถามหรือสนทนาด้วย

คุณต้องให้คำปรึกษาที่เป็นประโยชน์ วิเคราะห์อย่างละเอียด และสามารถสร้างภาพประกอบ (Illustration) เพื่อช่วยให้ผู้ใช้เห็นภาพได้ชัดเจนขึ้น
หากคุณต้องการแสดงภาพประกอบให้ผู้ใช้เห็น ให้ใช้เครื่องมือ "generate_image" เสมอ พร้อมทั้งแสดง prompt เป็นภาษาอังกฤษอย่างละเอียดสำหรับสร้างภาพนั้นด้วย และดูให้แน่ใจว่าภาพได้ถูกสร้างแล้วอย่างสมบูรณ์จริงๆ หรือมี error อะไร ห้ามตอบเป็น JSON หรือโค้ดหลอกๆ
ตอบเป็นภาษาไทยที่สุภาพ เป็นกันเอง แต่มีความเป็นมืออาชีพ`;

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

  const initializeChat = (history: Message[] = []) => {
    try {
      const ai = getAI();
      const geminiHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));
      
      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: geminiHistory,
        config: { 
          systemInstruction,
          tools: [{ functionDeclarations: [generateImageTool] }]
        }
      });
    } catch (error) {
      console.error("Failed to initialize chat:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: 'กรุณาตั้งค่า GEMINI_API_KEY ใน Environment Variables ก่อนใช้งานครับ' }]);
    }
  };

  useEffect(() => {
    initializeChat();
  }, []);

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
        model: 'gemini-2.5-flash-image',
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
        setChatHistory(prev => [...prev, { role: 'model', text: 'ขออภัยครับ ผมไม่สามารถสร้างภาพได้ในขณะนี้ ลองเปลี่ยนคำบรรยายดูนะครับ' }]);
      }
    } catch (error) {
      console.error("Image Gen Error:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: 'เกิดข้อผิดพลาดในการสร้างภาพครับ' }]);
    }
  };

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
      if (!chatRef.current) {
        initializeChat(chatHistory);
      }
      
      if (!chatRef.current) {
        throw new Error("Chat could not be initialized. Please check your API key.");
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
      
      // Check for function calls
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
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: 'เกิดข้อผิดพลาดในการสื่อสารกับ AI กรุณาลองใหม่อีกครั้งครับ' }]);
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
      {/* Header */}
      <header className={cn(
        "backdrop-blur-md border-b px-6 py-4 flex items-center justify-between transition-all",
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

        <div className="flex flex-col items-center">
          <h1 className={cn(
            "text-2xl font-bold leading-tight tracking-tight",
            isDarkMode ? "text-white" : "text-zinc-900"
          )}>AI General Expert</h1>
          <div className="flex items-center gap-2">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.2em]",
              isDarkMode ? "text-zinc-500" : "text-zinc-400"
            )}>Consultant & Illustrator</p>
            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">ts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
                    <img 
                      src={img} 
                      alt="Generated" 
                      className="w-full aspect-square object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                      <button 
                        onClick={() => handleSaveImage(img)}
                        className="p-3 bg-white text-zinc-900 rounded-2xl hover:bg-zinc-100 transition-all transform hover:scale-110"
                        title="Download"
                      >
                        <Download size={20} />
                      </button>
                      <button 
                        onClick={() => setGeneratedImages(prev => prev.filter((_, i) => i !== idx))}
                        className="p-3 bg-white text-red-600 rounded-2xl hover:bg-red-50 transition-all transform hover:scale-110"
                        title="Delete"
                      >
                        <Trash2 size={20} />
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

