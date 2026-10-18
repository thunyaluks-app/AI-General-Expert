import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import { 
  resolveModelName, 
  buildCascadeModelChain, 
  STABLE_WORKHORSE_TEXT_MODEL, 
  STABLE_WORKHORSE_IMAGE_MODEL 
} from './src/services/modelResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * 5. Multi-Source API Key Resolution
 * Checks custom client key from headers or falls back to backend environment variable.
 */
function resolveApiKey(req: Request): { apiKey: string; keySource: 'User Custom API Key' | 'Server Environment API Key' } {
  const headerKey = (req.headers['x-gemini-api-key'] as string | undefined)?.trim();
  if (headerKey && headerKey !== 'no API key' && headerKey !== 'undefined' && headerKey.length > 5) {
    return { apiKey: headerKey, keySource: 'User Custom API Key' };
  }

  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey) {
    return { apiKey: envKey, keySource: 'Server Environment API Key' };
  }

  return { apiKey: '', keySource: 'User Custom API Key' };
}

const DEFAULT_SYSTEM_INSTRUCTION = `คุณคือ "AI ผู้เชี่ยวชาญในทุกๆ ด้าน ตามเนื้อหาที่ผู้ใช้ถามหรือสนทนาด้วย" ที่มีความรู้ลึกซึ้งในหลากหลายมิติ เช่น
- ด้านศาสนา วัฒนธรรม ปรัชญา และความเชื่อต่างๆ
- ด้านศิลปะ การศึกษา และภาษา
- ด้านวิทยาศาสตร์ เทคโนโลยี วิศวกรรม คอมพิวเตอร์ AI, programming, coding
- การแพทย์ สาธารณสุข เภสัชศาสตร์
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

/**
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  const { apiKey, keySource } = resolveApiKey(req);
  res.json({
    status: 'ok',
    hasKey: Boolean(apiKey),
    keySource: apiKey ? keySource : 'None',
    nodeEnv: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

/**
 * POST /api/ai/test-key
 * Tests a Gemini API key with a minimal prompt
 */
app.post('/api/ai/test-key', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const testKey = req.body.apiKey || resolveApiKey(req).apiKey;

  if (!testKey) {
    return res.status(400).json({ success: false, error: 'No API key provided to test' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: testKey });
    const response = await ai.models.generateContent({
      model: STABLE_WORKHORSE_TEXT_MODEL,
      contents: 'Ping test. Reply with "OK".',
    });

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      model: STABLE_WORKHORSE_TEXT_MODEL,
      latencyMs,
      response: response.text?.slice(0, 50) || 'OK',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'Failed to authenticate with provided API key',
      latencyMs: Date.now() - startTime,
    });
  }
});

/**
 * POST /api/ai/chat
 * Multi-layer resilient text chat endpoint with Smart Cascade Fallback
 */
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { apiKey, keySource } = resolveApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key is missing. Please provide a Gemini API Key via settings or server configuration.',
    });
  }

  const { 
    prompt, 
    history = [], 
    requestedModel = STABLE_WORKHORSE_TEXT_MODEL, 
    systemInstruction = DEFAULT_SYSTEM_INSTRUCTION,
    enableTools = true,
    availableModels = []
  } = req.body;

  const targetModel = resolveModelName(requestedModel);
  const cascadeChain = buildCascadeModelChain(targetModel, availableModels, 'text');

  const attempts: { model: string; success: boolean; latencyMs: number; error?: string }[] = [];
  let successfulResponse: any = null;
  let successfulModel = '';

  const ai = new GoogleGenAI({ apiKey });

  // Format history for Gemini SDK
  const formattedContents: any[] = [];
  for (const item of history) {
    if (item.isSystem || item.isImageGen) continue;
    formattedContents.push({
      role: item.role === 'user' ? 'user' : 'model',
      parts: item.images && item.images.length > 0
        ? [
            ...item.images.map((img: string) => {
              const [mimePart, dataPart] = img.split(';base64,');
              return {
                inlineData: {
                  mimeType: mimePart.replace('data:', '') || 'image/png',
                  data: dataPart || '',
                }
              };
            }),
            { text: item.text }
          ]
        : [{ text: item.text }]
    });
  }

  // Add current prompt
  formattedContents.push({
    role: 'user',
    parts: req.body.images && req.body.images.length > 0
      ? [
          ...req.body.images.map((img: string) => {
            const [mimePart, dataPart] = img.split(';base64,');
            return {
              inlineData: {
                mimeType: mimePart.replace('data:', '') || 'image/png',
                data: dataPart || '',
              }
            };
          }),
          { text: prompt }
        ]
      : [{ text: prompt }]
  });

  // Smart Cascade loop: try each model until one succeeds
  for (const currentModel of cascadeChain) {
    const attemptStart = Date.now();
    try {
      const config: any = {
        systemInstruction,
      };

      if (enableTools) {
        config.tools = [{ functionDeclarations: [generateImageTool] }];
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: formattedContents,
        config,
      });

      attempts.push({
        model: currentModel,
        success: true,
        latencyMs: Date.now() - attemptStart,
      });

      successfulResponse = response;
      successfulModel = currentModel;
      break; // Success! Break cascade loop
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[Cascade Fallback] Model ${currentModel} failed: ${errMsg}. Trying next model...`);
      attempts.push({
        model: currentModel,
        success: false,
        latencyMs: Date.now() - attemptStart,
        error: errMsg,
      });
    }
  }

  const totalLatencyMs = Date.now() - startTime;

  if (!successfulResponse) {
    return res.status(502).json({
      success: false,
      error: 'All models in the cascade fallback chain failed.',
      requestedModel,
      targetModel,
      fallbackChain: cascadeChain,
      attempts,
      totalLatencyMs,
      keySource,
    });
  }

  // Parse text and function calls
  const responseText = successfulResponse.text || '';
  const functionCalls = successfulResponse.functionCalls || null;

  return res.json({
    success: true,
    text: responseText,
    functionCalls,
    requestedModel,
    targetModel,
    actualModel: successfulModel,
    fallbackChain: cascadeChain,
    attempts,
    totalLatencyMs,
    keySource,
    usedFallback: successfulModel !== targetModel,
  });
});

/**
 * POST /api/ai/generate-image
 * Multi-layer image generation with Smart Cascade Fallback
 */
app.post('/api/ai/generate-image', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { apiKey, keySource } = resolveApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key is missing for image generation.',
    });
  }

  const { 
    prompt, 
    aspectRatio = "1:1", 
    attachedImagesData = [], 
    requestedModel = STABLE_WORKHORSE_IMAGE_MODEL,
    availableModels = []
  } = req.body;

  const targetModel = resolveModelName(requestedModel, STABLE_WORKHORSE_IMAGE_MODEL);
  const cascadeChain = buildCascadeModelChain(targetModel, availableModels, 'image');

  const attempts: { model: string; success: boolean; latencyMs: number; error?: string }[] = [];
  let generatedImageUrl: string | null = null;
  let successfulModel = '';

  const ai = new GoogleGenAI({ apiKey });

  // Cascade loop for image generation
  for (const currentModel of cascadeChain) {
    const attemptStart = Date.now();
    try {
      const contentsParts: any[] = [...attachedImagesData, { text: prompt }];

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: { parts: contentsParts },
        config: {
          responseModalities: [Modality.IMAGE],
          imageConfig: {
            aspectRatio: (aspectRatio as any) || "1:1",
          }
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let foundImg = false;

      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          generatedImageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
          foundImg = true;
          break;
        }
      }

      if (foundImg) {
        attempts.push({
          model: currentModel,
          success: true,
          latencyMs: Date.now() - attemptStart,
        });
        successfulModel = currentModel;
        break; // Image generated successfully!
      } else {
        throw new Error('No image inlineData in model response');
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[Image Cascade] Model ${currentModel} failed: ${errMsg}`);
      attempts.push({
        model: currentModel,
        success: false,
        latencyMs: Date.now() - attemptStart,
        error: errMsg,
      });
    }
  }

  const totalLatencyMs = Date.now() - startTime;

  if (!generatedImageUrl) {
    return res.status(502).json({
      success: false,
      error: 'Failed to generate image across all fallback models.',
      requestedModel,
      targetModel,
      fallbackChain: cascadeChain,
      attempts,
      totalLatencyMs,
      keySource,
    });
  }

  return res.json({
    success: true,
    imageUrl: generatedImageUrl,
    requestedModel,
    targetModel,
    actualModel: successfulModel,
    fallbackChain: cascadeChain,
    attempts,
    totalLatencyMs,
    keySource,
    usedFallback: successfulModel !== targetModel,
  });
});

/**
 * Configure Vite middleware in development or static serving in production
 */
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dual-Layer Resilient Gemini Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
