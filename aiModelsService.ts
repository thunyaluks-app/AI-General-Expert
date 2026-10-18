import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, onSnapshot, query, Unsubscribe } from "firebase/firestore";

export interface AIModel {
  id: string;
  modelId: string;
  name: string;
  category: string;
  order: number;
  isActive: boolean;
  isDefaultLevel1?: boolean;
  isDefaultLevel2?: boolean;
}

const firebaseConfig = {
  projectId: "gen-lang-client-0014422363",
  appId: "1:978227936883:web:946402bf6886970bc77406",
  apiKey: "AIzaSyAJLNrYkuTt16qs034UlkEBJrMvlrNCnA4",
  authDomain: "gen-lang-client-0014422363.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-29f335c3-c8ac-451f-97d7-9c310736d1d9",
  storageBucket: "gen-lang-client-0014422363.firebasestorage.app",
  messagingSenderId: "978227936883",
  measurementId: ""
};

// Initialize Firebase App & Firestore Read-Only Client
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-29f335c3-c8ac-451f-97d7-9c310736d1d9");

// Default Fallback Models if Firestore connection fails or is loading
export const FALLBACK_TEXT_MODELS: AIModel[] = [
  { id: 'gemini-3.6-flash', modelId: 'gemini-3.6-flash', name: '(20)Gemini 3.6 Flash', category: 'text_reasoning', order: 1, isActive: true, isDefaultLevel1: true },
  { id: 'gemini-3.8-flash', modelId: 'gemini-3.8-flash', name: '(20)Gemini 3.8 Flash (High Speed)', category: 'text_reasoning', order: 2, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-3.5-flash', modelId: 'gemini-3.5-flash', name: '(20)Gemini 3.5 Flash', category: 'text_reasoning', order: 3, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-3-flash-preview', modelId: 'gemini-3-flash-preview', name: '(20)Gemini 3 Flash Preview', category: 'text_reasoning', order: 4, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-3.5-flash-lite', modelId: 'gemini-3.5-flash-lite', name: '(500)Gemini 3.5 Flash Lite', category: 'text_reasoning', order: 5, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-3.1-flash-lite', modelId: 'gemini-3.1-flash-lite', name: '(500)Gemini 3.1 Flash Lite', category: 'text_reasoning', order: 6, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-3.1-pro-preview', modelId: 'gemini-3.1-pro-preview', name: '(0)Gemini 3.1 Pro Preview', category: 'text_reasoning', order: 7, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-flash-latest', modelId: 'gemini-flash-latest', name: 'Gemini Flash Latest', category: 'text_reasoning', order: 8, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-flash-lite-latest', modelId: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', category: 'text_reasoning', order: 9, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-2.5-flash', modelId: 'gemini-2.5-flash', name: '(20)Gemini 2.5 Flash', category: 'text_reasoning', order: 10, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-2.5-pro', modelId: 'gemini-2.5-pro', name: '(0)Gemini 2.5 Pro', category: 'text_reasoning', order: 11, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-pro-latest', modelId: 'gemini-pro-latest', name: 'Gemini Pro (Latest Stable)', category: 'text_reasoning', order: 12, isActive: true, isDefaultLevel1: false },
];

export const FALLBACK_IMAGE_MODELS: AIModel[] = [
  { id: 'gemini-3-pro-image', modelId: 'gemini-3-pro-image', name: 'Nano Banana Pro (Gemini 3 Pro Image)', category: 'image_gen', order: 1, isActive: true, isDefaultLevel1: true },
  { id: 'gemini-3.1-flash-image', modelId: 'gemini-3.1-flash-image', name: 'Nano Banana 2 (Gemini 3.1 Flash Image)', category: 'image_gen', order: 2, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-2.5-flash-image', modelId: 'gemini-2.5-flash-image', name: 'gemini-2.5-flash-image (Default)', category: 'image_gen', order: 6, isActive: true, isDefaultLevel1: false },
  { id: 'gemini-flash-image-latest', modelId: 'gemini-flash-image-latest', name: 'Gemini Flash Image Latest', category: 'image_gen', order: 7, isActive: true, isDefaultLevel1: false },
  { id: 'imagen-4.0-generate-001', modelId: 'imagen-4.0-generate-001', name: 'imagen-4.0-generate-001', category: 'image_gen', order: 8, isActive: true, isDefaultLevel1: false },
];

/** Cache of the latest models fetched from Firestore */
let cachedModels: AIModel[] = [...FALLBACK_TEXT_MODELS, ...FALLBACK_IMAGE_MODELS];

/**
 * Deduplication helper: guarantees unique models by modelId/id to prevent React key collision warnings
 */
export function deduplicateModels(models: AIModel[]): AIModel[] {
  const seen = new Set<string>();
  const result: AIModel[] = [];

  for (const model of models) {
    const key = (model.modelId || model.id || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(model);
  }

  return result;
}

/**
 * Parses raw Firestore document data safely into an AIModel
 */
function parseModelDoc(docId: string, data: any): AIModel {
  return {
    id: docId,
    modelId: (data.modelId || docId).trim(),
    name: (data.name || data.modelId || docId).trim(),
    category: (data.category || 'text_reasoning').trim(),
    order: typeof data.order === 'number' ? data.order : 99,
    isActive: data.isActive !== false,
    isDefaultLevel1: Boolean(data.isDefaultLevel1),
    isDefaultLevel2: Boolean(data.isDefaultLevel2),
  };
}

/**
 * Fetch active AI models from Firestore collection 'ai_models' sorted by order ascending
 */
export async function fetchCentralAIModels(): Promise<AIModel[]> {
  try {
    const querySnapshot = await getDocs(collection(db, "ai_models"));
    const models: AIModel[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.isActive !== false) {
        models.push(parseModelDoc(doc.id, data));
      }
    });

    const deduplicated = deduplicateModels(models);
    deduplicated.sort((a, b) => a.order - b.order);

    if (deduplicated.length > 0) {
      cachedModels = deduplicated;
    }
    return deduplicated;
  } catch (error) {
    console.error("Error fetching central AI models from Firestore:", error);
    return cachedModels;
  }
}

/**
 * 2. Centralized AI Models Registry: Real-Time onSnapshot Subscription
 * Subscribes to the central 'ai_models' collection.
 * Any new models added to Firestore in the future will automatically stream
 * and update the UI in real time without code modifications or redeployment!
 */
export function subscribeCentralAIModels(
  onUpdate: (models: AIModel[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  try {
    const colRef = collection(db, "ai_models");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const rawList: AIModel[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isActive !== false) {
            rawList.push(parseModelDoc(doc.id, data));
          }
        });

        // Deduplicate and sort by order ascending
        const cleanList = deduplicateModels(rawList);
        cleanList.sort((a, b) => a.order - b.order);

        if (cleanList.length > 0) {
          cachedModels = cleanList;
          onUpdate(cleanList);
        } else {
          // If Firestore is empty, provide default fallbacks
          onUpdate([...FALLBACK_TEXT_MODELS, ...FALLBACK_IMAGE_MODELS]);
        }
      },
      (error) => {
        console.warn("Firestore onSnapshot error on ai_models, using cached models:", error);
        if (onError) onError(error);
        onUpdate(cachedModels);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error("Failed to establish real-time Firestore subscription:", err);
    onUpdate(cachedModels);
    return () => {};
  }
}

/** Utility to find default model for Level 1 from a list of models */
export function getDefaultModelForLevel1(models: AIModel[], fallbackDefault: string): string {
  const level1Doc = models.find(m => m.isDefaultLevel1 === true);
  if (level1Doc) {
    return level1Doc.modelId;
  }
  if (models.length > 0) {
    return models[0].modelId;
  }
  return fallbackDefault;
}

/** Get currently cached models synchronously */
export function getCachedAIModels(): AIModel[] {
  return cachedModels;
}
