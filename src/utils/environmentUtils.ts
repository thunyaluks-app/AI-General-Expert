/**
 * Environment Detection Utilities
 * Detects whether the current environment should use Direct Client-Side Gemini SDK calls
 * or route through the Server-Side Proxy (/api/ai/...)
 */

export function isAIStudioPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname || '';
  const href = window.location.href || '';
  
  // Check typical AI Studio preview domain markers
  if (
    hostname.includes('aistudio.google.com') ||
    hostname.includes('run.app') ||
    hostname.includes('ais-dev-') ||
    hostname.includes('ais-pre-') ||
    href.includes('googleusercontent.com')
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true if direct client SDK calls should be made (@google/genai in browser).
 * Returns false if requests should route through the server-side proxy (/api/ai/...)
 * 
 * In AI Studio Preview, iframe sandboxing and proxy routing are required to prevent network
 * and cross-origin security blocks. On external production (e.g. Vercel, Netlify, custom domains),
 * direct client SDK calls provide the lowest possible latency.
 */
export function shouldUseDirectClientCalls(): boolean {
  if (typeof window === 'undefined') return false;

  // In AI Studio Preview, ALWAYS use Server Proxy
  if (isAIStudioPreviewEnvironment()) {
    return false;
  }
  
  // On external domains (e.g. Vercel, production domain), use Direct Client SDK
  return true;
}

export function getExecutionEnvironmentName(): string {
  if (typeof window === 'undefined') return 'Server';
  const hostname = window.location.hostname || 'localhost';
  
  if (isAIStudioPreviewEnvironment()) {
    return `AI Studio Preview (${hostname})`;
  }
  if (hostname.includes('vercel.app')) {
    return 'Vercel Production';
  }
  return `Client (${hostname})`;
}
