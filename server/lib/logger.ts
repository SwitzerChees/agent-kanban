import type { RuntimeEventRecord } from './types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const MAX_EVENTS = 200;

export class RuntimeLogger {
  private events: RuntimeEventRecord[] = [];

  debug(message: string, context: LogContext = {}) {
    this.write('debug', message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.write('info', message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.write('warn', message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.write('error', message, context);
  }

  recent(limit = 50): RuntimeEventRecord[] {
    return this.events.slice(-limit);
  }

  private write(level: LogLevel, message: string, context: LogContext) {
    const at = new Date().toISOString();
    const redacted = redact(context);
    const line = stableLine({ at, level, message, ...redacted });

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }

    this.events.push({ at, event: level, message });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }
  }
}

function stableLine(context: LogContext): string {
  return Object.entries(context)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function redact(context: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (/token|api[_-]?key|secret|authorization/i.test(key)) {
      out[key] = value ? '[redacted]' : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const runtimeLogger = new RuntimeLogger();
