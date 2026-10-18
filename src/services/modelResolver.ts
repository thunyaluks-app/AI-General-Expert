/**
 * Future-Proof Model Registry & Resolution Logic
 * Implements Pass-through rules for upcoming Gemini models and deprecation rules
 * for officially retired models to avoid 404 errors.
 */

import { type AIModel } from '../../aiModelsService';

// Standard pattern for standard & future Gemini models
const GEMINI_PATTERN = /^gemini-[a-z0-9.-]+$/i;
const IMAGEN_PATTERN = /^imagen-[a-z0-9.-]+$/i;

/**
 * Known deprecated models that have been shut down and will throw 404
 * Map them safely to current stable workhorse models.
 */
const DEPRECATED_MODELS_MAP: Record<string, string> = {
  // Legacy Gemini 1.0 & 1.5
  'gemini-1.0-pro': 'gemini-3.6-flash',
  'gemini-1.5-flash': 'gemini-3.6-flash',
  'gemini-1.5-flash-8b': 'gemini-3.5-flash-lite',
  'gemini-1.5-pro': 'gemini-3.1-pro-preview',
  
  // Retired Gemini 2.0 experimental and early versions
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-exp': 'gemini-3.6-flash',
  'gemini-2.0-flash-thinking-exp': 'gemini-3.6-flash',
  'gemini-2.0-flash-thinking-exp-01-21': 'gemini-3.6-flash',
  'gemini-2.0-pro-exp': 'gemini-3.1-pro-preview',
  'gemini-2.0-pro-exp-02-05': 'gemini-3.1-pro-preview',
  'gemini-exp-1206': 'gemini-3.6-flash',
};

/**
 * Default Workhorse, High-speed, and Quota-efficient models
 */
export const STABLE_WORKHORSE_TEXT_MODEL = 'gemini-3.6-flash';
export const HIGH_SPEED_TEXT_MODEL = 'gemini-3.8-flash';
export const QUOTA_EFFICIENT_TEXT_MODEL = 'gemini-3.5-flash-lite';

export const STABLE_WORKHORSE_IMAGE_MODEL = 'gemini-3-pro-image';
export const FAST_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const FALLBACK_IMAGE_MODEL = 'gemini-2.5-flash-image';

/**
 * 1. Future-Proof Model Passthrough & Sanitization
 * - Keeps future models (e.g. gemini-3.9-*, gemini-4.0-*, gemini-4.5-*) 100% intact as Target #1
 * - Replaces only confirmed retired models to prevent 404
 */
export function resolveModelName(requestedModel: string, fallbackDefault = STABLE_WORKHORSE_TEXT_MODEL): string {
  if (!requestedModel || typeof requestedModel !== 'string') {
    return fallbackDefault;
  }

  const cleaned = requestedModel.trim();
  const lower = cleaned.toLowerCase();

  // Check deprecation mapping first
  if (DEPRECATED_MODELS_MAP[lower]) {
    return DEPRECATED_MODELS_MAP[lower];
  }

  // Future-proof Pass-through: Any standard Gemini or Imagen naming pattern is preserved 100%
  if (GEMINI_PATTERN.test(cleaned) || IMAGEN_PATTERN.test(cleaned)) {
    return cleaned;
  }

  // If input starts with "models/", strip prefix and re-check
  if (cleaned.startsWith('models/')) {
    const stripped = cleaned.replace(/^models\//, '');
    return resolveModelName(stripped, fallbackDefault);
  }

  return cleaned || fallbackDefault;
}

/**
 * Helper to extract major.minor version number from model ID (e.g. "gemini-3.8-flash" -> 3.8)
 */
export function extractModelVersion(modelId: string): number {
  const match = modelId.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 0;
}

/**
 * Helper to determine family: 'flash-lite', 'flash', 'pro', 'image', 'imagen', or 'other'
 */
export function detectModelFamily(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('lite')) return 'flash-lite';
  if (lower.includes('image') || lower.includes('imagen')) return 'image';
  if (lower.includes('pro')) return 'pro';
  if (lower.includes('flash')) return 'flash';
  return 'general';
}

/**
 * 3. Smart Cascade Fallback Builder
 * Builds ordered list of candidate models to try in case of failure:
 *  1) Target requested model (including new future model)
 *  2) Same family models in descending version order (leveraging Centralized Registry)
 *  3) Workhorse stable model
 *  4) High-speed model
 *  5) Quota-efficient / Lite model
 * Deduplicated via arr.indexOf(m) === idx
 */
export function buildCascadeModelChain(
  requestedModel: string, 
  availableCentralModels: AIModel[] = [], 
  category: 'text' | 'image' = 'text'
): string[] {
  const target = resolveModelName(
    requestedModel, 
    category === 'image' ? STABLE_WORKHORSE_IMAGE_MODEL : STABLE_WORKHORSE_TEXT_MODEL
  );

  const modelsToTry: string[] = [target];

  if (category === 'image') {
    // Collect image models from central registry
    const registryImageModels = availableCentralModels
      .filter(m => ['image_gen', 'image', 'image_generation'].includes(m.category) && m.isActive)
      .map(m => m.modelId);

    // Same family image models (sorted by version descending)
    const sameFamily = registryImageModels
      .slice()
      .sort((a, b) => extractModelVersion(b) - extractModelVersion(a));

    modelsToTry.push(...sameFamily);
    modelsToTry.push(STABLE_WORKHORSE_IMAGE_MODEL);
    modelsToTry.push(FAST_IMAGE_MODEL);
    modelsToTry.push(FALLBACK_IMAGE_MODEL);
    modelsToTry.push('gemini-flash-image-latest');
    modelsToTry.push('imagen-4.0-generate-001');
  } else {
    // Text reasoning category
    const targetFamily = detectModelFamily(target);
    
    // Available central text models
    const registryTextModels = availableCentralModels
      .filter(m => ['text_reasoning', 'text', 'text_gen', 'chat'].includes(m.category) && m.isActive)
      .map(m => m.modelId);

    // 2) Models in the same family in descending version order
    const sameFamilyRegistry = registryTextModels
      .filter(m => detectModelFamily(m) === targetFamily)
      .sort((a, b) => extractModelVersion(b) - extractModelVersion(a));

    modelsToTry.push(...sameFamilyRegistry);

    // Default known family ladders if not present in registry
    if (targetFamily === 'flash-lite') {
      modelsToTry.push('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest');
    } else if (targetFamily === 'pro') {
      modelsToTry.push('gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-pro-latest');
    } else {
      // standard flash family ladder
      modelsToTry.push(
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-flash-latest'
      );
    }

    // 3) Workhorse stable model
    modelsToTry.push(STABLE_WORKHORSE_TEXT_MODEL);

    // 4) High-speed model
    modelsToTry.push(HIGH_SPEED_TEXT_MODEL);

    // 5) Quota-efficient / Lite model
    modelsToTry.push(QUOTA_EFFICIENT_TEXT_MODEL, 'gemini-3.1-flash-lite');
  }

  // Deduplicate preserving first appearance order
  return modelsToTry
    .map(m => resolveModelName(m, category === 'image' ? STABLE_WORKHORSE_IMAGE_MODEL : STABLE_WORKHORSE_TEXT_MODEL))
    .filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);
}
