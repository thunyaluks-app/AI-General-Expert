/**
 * Execution Tracker & AI Log System
 * Records model resolution, cascade fallback steps, latency, and API key sources
 * for maximum transparency and monitoring.
 */

export interface ModelAttempt {
  model: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  actionType: 'chat' | 'image_gen' | 'test_key';
  promptSnippet: string;
  requestedModel: string;
  resolvedModel: string;
  actualModel: string;
  fallbackChain: string[];
  attempts: ModelAttempt[];
  keySource: 'User Custom API Key' | 'Server Environment API Key';
  environment: string;
  totalLatencyMs: number;
  status: 'success' | 'fallback_success' | 'error';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

type Subscriber = (logs: ExecutionLogEntry[], latest: ExecutionLogEntry | null) => void;

class ExecutionTrackerStore {
  private logs: ExecutionLogEntry[] = [];
  private subscribers: Set<Subscriber> = new Set();
  private maxLogs = 100;

  constructor() {
    // Try restoring recent logs from sessionStorage if available
    try {
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('gemini_execution_logs');
        if (stored) {
          this.logs = JSON.parse(stored);
        }
      }
    } catch {
      // ignore
    }
  }

  public addLog(entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>): ExecutionLogEntry {
    const fullEntry: ExecutionLogEntry = {
      ...entry,
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }) + ` (${new Date().toLocaleDateString('th-TH')})`,
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('gemini_execution_logs', JSON.stringify(this.logs.slice(0, 30)));
      }
    } catch {
      // ignore
    }

    this.notifySubscribers(fullEntry);
    return fullEntry;
  }

  public getLogs(): ExecutionLogEntry[] {
    return [...this.logs];
  }

  public getLatest(): ExecutionLogEntry | null {
    return this.logs[0] || null;
  }

  public clearLogs(): void {
    this.logs = [];
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('gemini_execution_logs');
      }
    } catch {
      // ignore
    }
    this.notifySubscribers(null);
  }

  public subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    cb(this.logs, this.getLatest());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers(latest: ExecutionLogEntry | null): void {
    this.subscribers.forEach(cb => {
      try {
        cb(this.logs, latest);
      } catch (err) {
        console.error("Error in execution tracker subscriber:", err);
      }
    });
  }
}

export const executionTracker = new ExecutionTrackerStore();
