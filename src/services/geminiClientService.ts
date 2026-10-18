/**
 * Dual-Layer Client-Side & Proxy Service for Gemini AI
 * Seamlessly switches between Direct Client SDK and Server-Side Proxy
 * with Smart Cascade Fallback & Execution Tracking.
 */

import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import { shouldUseDirectClientCalls, getExecutionEnvironmentName } from '../utils/environmentUtils';
import { 
  resolveModelName, 
  buildCascadeModelChain, 
  STABLE_WORKHORSE_TEXT_MODEL, 
  STABLE_WORKHORSE_IMAGE_MODEL 
} from './modelResolver';
import { executionTracker, ExecutionLogEntry } from './executionTracker';
import { type AIModel, getCachedAIModels } from '../../aiModelsService';

export interface ChatMessageParam {
  role: 'user' | 'model';
  text: string;
  images?: string[];
  isSystem?: boolean;
  isImageGen?: boolean;
}

export interface ChatExecutionResult {
  text: string;
  functionCalls?: any[] | null;
  actualModel: string;
  requestedModel: string;
  fallbackChain: string[];
  latencyMs: number;
  keySource: 'User Custom API Key' | 'Server Environment API Key';
  usedFallback: boolean;
}

export interface ImageExecutionResult {
  imageUrl: string;
  actualModel: string;
  requestedModel: string;
  fallbackChain: string[];
  latencyMs: number;
  keySource: 'User Custom API Key' | 'Server Environment API Key';
  usedFallback: boolean;
}

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
 * Test an API key to verify validity and measure latency
 */
export async function testGeminiApiKey(apiKey: string): Promise<{
  success: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  const trimmed = apiKey.trim();
  
  if (!trimmed || trimmed === 'no API key') {
    return {
      success: false,
      model: STABLE_WORKHORSE_TEXT_MODEL,
      latencyMs: 0,
      error: 'API Key is empty.',
    };
  }

  // If server proxy is preferred
  if (!shouldUseDirectClientCalls()) {
    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': trimmed,
        },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json();
      return {
        success: data.success,
        model: data.model || STABLE_WORKHORSE_TEXT_MODEL,
        latencyMs: data.latencyMs || (Date.now() - startTime),
        error: data.error,
      };
    } catch (e: any) {
      console.warn("Server test endpoint error, trying direct fallback:", e);
    }
  }

  // Direct client test
  try {
    const ai = new GoogleGenAI({ apiKey: trimmed });
    const response = await ai.models.generateContent({
      model: STABLE_WORKHORSE_TEXT_MODEL,
      contents: 'Ping test. Reply "OK".',
    });
    return {
      success: true,
      model: STABLE_WORKHORSE_TEXT_MODEL,
      latencyMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      model: STABLE_WORKHORSE_TEXT_MODEL,
      latencyMs: Date.now() - startTime,
      error: error?.message || 'Authentication failed',
    };
  }
}

/**
 * Execute Chat with Smart Cascade Fallback & Execution Tracking
 */
export async function executeChatWithTracking(options: {
  prompt: string;
  history: ChatMessageParam[];
  images?: string[];
  requestedModel: string;
  activeApiKey: string;
  systemInstruction?: string;
  availableModels?: AIModel[];
}): Promise<ChatExecutionResult> {
  const startTime = Date.now();
  const {
    prompt,
    history,
    images = [],
    requestedModel,
    activeApiKey,
    systemInstruction,
    availableModels = getCachedAIModels(),
  } = options;

  const targetModel = resolveModelName(requestedModel);
  const cascadeChain = buildCascadeModelChain(targetModel, availableModels, 'text');
  const attempts: { model: string; success: boolean; latencyMs: number; error?: string }[] = [];
  const keySource: 'User Custom API Key' | 'Server Environment API Key' = activeApiKey 
    ? 'User Custom API Key' 
    : 'Server Environment API Key';

  const promptSnippet = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;

  // Decision: Direct Client vs Server Proxy
  const useDirect = shouldUseDirectClientCalls();

  if (!useDirect) {
    // Call Server-Side Proxy
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': activeApiKey || '',
        },
        body: JSON.stringify({
          prompt,
          history,
          images,
          requestedModel,
          systemInstruction,
          availableModels,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server proxy chat error');
      }

      const totalLatency = Date.now() - startTime;
      const actualModel = data.actualModel || targetModel;
      const usedFallback = actualModel !== targetModel;

      executionTracker.addLog({
        actionType: 'chat',
        promptSnippet,
        requestedModel,
        resolvedModel: targetModel,
        actualModel,
        fallbackChain: data.fallbackChain || cascadeChain,
        attempts: data.attempts || [{ model: actualModel, success: true, latencyMs: totalLatency }],
        keySource: data.keySource || keySource,
        environment: getExecutionEnvironmentName(),
        totalLatencyMs: totalLatency,
        status: usedFallback ? 'fallback_success' : 'success',
      });

      return {
        text: data.text,
        functionCalls: data.functionCalls,
        actualModel,
        requestedModel,
        fallbackChain: data.fallbackChain || cascadeChain,
        latencyMs: totalLatency,
        keySource: data.keySource || keySource,
        usedFallback,
      };
    } catch (proxyError: any) {
      console.warn("Server proxy failed, attempting direct client fallback if user key is present:", proxyError);
      if (!activeApiKey) {
        const totalLatency = Date.now() - startTime;
        executionTracker.addLog({
          actionType: 'chat',
          promptSnippet,
          requestedModel,
          resolvedModel: targetModel,
          actualModel: 'none',
          fallbackChain: cascadeChain,
          attempts: [{ model: targetModel, success: false, latencyMs: totalLatency, error: proxyError.message }],
          keySource,
          environment: getExecutionEnvironmentName(),
          totalLatencyMs: totalLatency,
          status: 'error',
          errorMessage: proxyError.message,
        });
        throw proxyError;
      }
    }
  }

  // Direct Client-Side SDK Fallback with Cascade Loop
  if (!activeApiKey) {
    throw new Error("Missing Gemini API Key. Please provide an API Key.");
  }

  const ai = new GoogleGenAI({ apiKey: activeApiKey });

  // Build formatted contents for Gemini
  const formattedContents: any[] = [];
  for (const item of history) {
    if (item.isSystem || item.isImageGen) continue;
    formattedContents.push({
      role: item.role === 'user' ? 'user' : 'model',
      parts: item.images && item.images.length > 0
        ? [
            ...item.images.map(img => {
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

  formattedContents.push({
    role: 'user',
    parts: images.length > 0
      ? [
          ...images.map(img => {
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

  let successfulResponse: any = null;
  let successfulModel = '';

  for (const currentModel of cascadeChain) {
    const attemptStart = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: formattedContents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [generateImageTool] }],
        }
      });

      attempts.push({
        model: currentModel,
        success: true,
        latencyMs: Date.now() - attemptStart,
      });

      successfulResponse = response;
      successfulModel = currentModel;
      break;
    } catch (err: any) {
      attempts.push({
        model: currentModel,
        success: false,
        latencyMs: Date.now() - attemptStart,
        error: err?.message || String(err),
      });
    }
  }

  const totalLatency = Date.now() - startTime;

  if (!successfulResponse) {
    executionTracker.addLog({
      actionType: 'chat',
      promptSnippet,
      requestedModel,
      resolvedModel: targetModel,
      actualModel: 'none',
      fallbackChain: cascadeChain,
      attempts,
      keySource,
      environment: getExecutionEnvironmentName(),
      totalLatencyMs: totalLatency,
      status: 'error',
      errorMessage: 'All cascade models failed',
    });
    throw new Error('All models in the cascade fallback chain failed.');
  }

  const usedFallback = successfulModel !== targetModel;

  executionTracker.addLog({
    actionType: 'chat',
    promptSnippet,
    requestedModel,
    resolvedModel: targetModel,
    actualModel: successfulModel,
    fallbackChain: cascadeChain,
    attempts,
    keySource,
    environment: getExecutionEnvironmentName(),
    totalLatencyMs: totalLatency,
    status: usedFallback ? 'fallback_success' : 'success',
  });

  return {
    text: successfulResponse.text || '',
    functionCalls: successfulResponse.functionCalls || null,
    actualModel: successfulModel,
    requestedModel,
    fallbackChain: cascadeChain,
    latencyMs: totalLatency,
    keySource,
    usedFallback,
  };
}

/**
 * Execute Image Generation with Smart Cascade Fallback & Execution Tracking
 */
export async function executeImageWithTracking(options: {
  prompt: string;
  aspectRatio?: string;
  attachedImagesData?: any[];
  requestedModel: string;
  activeApiKey: string;
  availableModels?: AIModel[];
}): Promise<ImageExecutionResult> {
  const startTime = Date.now();
  const {
    prompt,
    aspectRatio = "1:1",
    attachedImagesData = [],
    requestedModel,
    activeApiKey,
    availableModels = getCachedAIModels(),
  } = options;

  const targetModel = resolveModelName(requestedModel, STABLE_WORKHORSE_IMAGE_MODEL);
  const cascadeChain = buildCascadeModelChain(targetModel, availableModels, 'image');
  const attempts: { model: string; success: boolean; latencyMs: number; error?: string }[] = [];
  const keySource: 'User Custom API Key' | 'Server Environment API Key' = activeApiKey 
    ? 'User Custom API Key' 
    : 'Server Environment API Key';

  const promptSnippet = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
  const useDirect = shouldUseDirectClientCalls();

  if (!useDirect) {
    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': activeApiKey || '',
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          attachedImagesData,
          requestedModel,
          availableModels,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server proxy image generation error');
      }

      const totalLatency = Date.now() - startTime;
      const actualModel = data.actualModel || targetModel;
      const usedFallback = actualModel !== targetModel;

      executionTracker.addLog({
        actionType: 'image_gen',
        promptSnippet,
        requestedModel,
        resolvedModel: targetModel,
        actualModel,
        fallbackChain: data.fallbackChain || cascadeChain,
        attempts: data.attempts || [{ model: actualModel, success: true, latencyMs: totalLatency }],
        keySource: data.keySource || keySource,
        environment: getExecutionEnvironmentName(),
        totalLatencyMs: totalLatency,
        status: usedFallback ? 'fallback_success' : 'success',
      });

      return {
        imageUrl: data.imageUrl,
        actualModel,
        requestedModel,
        fallbackChain: data.fallbackChain || cascadeChain,
        latencyMs: totalLatency,
        keySource: data.keySource || keySource,
        usedFallback,
      };
    } catch (proxyError: any) {
      console.warn("Proxy image gen failed, attempting client fallback:", proxyError);
      if (!activeApiKey) {
        const totalLatency = Date.now() - startTime;
        executionTracker.addLog({
          actionType: 'image_gen',
          promptSnippet,
          requestedModel,
          resolvedModel: targetModel,
          actualModel: 'none',
          fallbackChain: cascadeChain,
          attempts: [{ model: targetModel, success: false, latencyMs: totalLatency, error: proxyError.message }],
          keySource,
          environment: getExecutionEnvironmentName(),
          totalLatencyMs: totalLatency,
          status: 'error',
          errorMessage: proxyError.message,
        });
        throw proxyError;
      }
    }
  }

  // Direct client image generation with cascade
  if (!activeApiKey) {
    throw new Error("Missing Gemini API Key for image generation.");
  }

  const ai = new GoogleGenAI({ apiKey: activeApiKey });
  let generatedImageUrl: string | null = null;
  let successfulModel = '';

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
        break;
      } else {
        throw new Error('No image data found in response');
      }
    } catch (err: any) {
      attempts.push({
        model: currentModel,
        success: false,
        latencyMs: Date.now() - attemptStart,
        error: err?.message || String(err),
      });
    }
  }

  const totalLatency = Date.now() - startTime;

  if (!generatedImageUrl) {
    executionTracker.addLog({
      actionType: 'image_gen',
      promptSnippet,
      requestedModel,
      resolvedModel: targetModel,
      actualModel: 'none',
      fallbackChain: cascadeChain,
      attempts,
      keySource,
      environment: getExecutionEnvironmentName(),
      totalLatencyMs: totalLatency,
      status: 'error',
      errorMessage: 'Failed across all fallback image models',
    });
    throw new Error('Failed to generate image across all models in cascade chain.');
  }

  const usedFallback = successfulModel !== targetModel;

  executionTracker.addLog({
    actionType: 'image_gen',
    promptSnippet,
    requestedModel,
    resolvedModel: targetModel,
    actualModel: successfulModel,
    fallbackChain: cascadeChain,
    attempts,
    keySource,
    environment: getExecutionEnvironmentName(),
    totalLatencyMs: totalLatency,
    status: usedFallback ? 'fallback_success' : 'success',
  });

  return {
    imageUrl: generatedImageUrl,
    actualModel: successfulModel,
    requestedModel,
    fallbackChain: cascadeChain,
    latencyMs: totalLatency,
    keySource,
    usedFallback,
  };
}
