/**
 * Critique Theater observability — structured JSON logger.
 *
 * Emits one JSON object per line to stdout/stderr. Each record carries a
 * monotonically-increasing event id, the subsystem ('critique'), correlation
 * fields (runId, projectId, adapter), and the level. Tests can capture output
 * by passing a custom sink to `createCritiqueLogger`.
 *
 * The exported `critiqueLogger` is the production singleton; library code
 * should call `critiqueLogger.info(...)` etc. and never go through console.*.
 *
 * @see specs/current/critique-theater.md § Observability (Phase 12)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  runId?: string;
  projectId?: string;
  adapter?: string;
  round?: number;
  role?: string;
  [k: string]: unknown;
}

export interface LogRecord extends LogContext {
  ts: string;
  level: LogLevel;
  subsystem: 'critique';
  event: string;
  message: string;
  seq: number;
}

export interface LogSink {
  write(record: LogRecord, line: string): void;
}

export interface CritiqueLogger {
  withContext(extra: LogContext): CritiqueLogger;
  debug(event: string, message: string, ctx?: LogContext): void;
  info(event: string, message: string, ctx?: LogContext): void;
  warn(event: string, message: string, ctx?: LogContext): void;
  error(event: string, message: string, ctx?: LogContext): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
  /** Override the clock for deterministic tests. */
  now?: () => number;
}

const DEFAULT_LEVEL: LogLevel = (() => {
  const env = process.env['OD_CRITIQUE_LOG_LEVEL']?.toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env;
  }
  return 'info';
})();

class StderrSink implements LogSink {
  write(_record: LogRecord, line: string): void {
    // Use stderr so structured logs do not collide with daemon stdout JSON.
    process.stderr.write(line + '\n');
  }
}

class CritiqueLoggerImpl implements CritiqueLogger {
  private readonly base: LogContext;
  private readonly level: LogLevel;
  private readonly sink: LogSink;
  private readonly now: () => number;
  private static seq = 0;

  constructor(base: LogContext, opts: Required<LoggerOptions>) {
    this.base = base;
    this.level = opts.level;
    this.sink = opts.sink;
    this.now = opts.now;
  }

  withContext(extra: LogContext): CritiqueLogger {
    return new CritiqueLoggerImpl(
      { ...this.base, ...extra },
      { level: this.level, sink: this.sink, now: this.now },
    );
  }

  private emit(level: LogLevel, event: string, message: string, ctx?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    CritiqueLoggerImpl.seq += 1;
    const record: LogRecord = {
      ts: new Date(this.now()).toISOString(),
      level,
      subsystem: 'critique',
      event,
      message,
      seq: CritiqueLoggerImpl.seq,
      ...this.base,
      ...ctx,
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      // A non-serializable value snuck into ctx. Drop the offending fields
      // and re-encode so the log line is still emitted.
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        try {
          JSON.stringify(v);
          safe[k] = v;
        } catch {
          safe[k] = `[unserializable:${typeof v}]`;
        }
      }
      line = JSON.stringify(safe);
    }
    this.sink.write(record, line);
  }

  debug(event: string, message: string, ctx?: LogContext): void {
    this.emit('debug', event, message, ctx);
  }
  info(event: string, message: string, ctx?: LogContext): void {
    this.emit('info', event, message, ctx);
  }
  warn(event: string, message: string, ctx?: LogContext): void {
    this.emit('warn', event, message, ctx);
  }
  error(event: string, message: string, ctx?: LogContext): void {
    this.emit('error', event, message, ctx);
  }
}

export function createCritiqueLogger(opts: LoggerOptions = {}): CritiqueLogger {
  return new CritiqueLoggerImpl(
    {},
    {
      level: opts.level ?? DEFAULT_LEVEL,
      sink: opts.sink ?? new StderrSink(),
      now: opts.now ?? Date.now,
    },
  );
}

/** In-memory sink for tests: captures every emitted record. */
export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  readonly lines: string[] = [];
  write(record: LogRecord, line: string): void {
    this.records.push(record);
    this.lines.push(line);
  }
  reset(): void {
    this.records.length = 0;
    this.lines.length = 0;
  }
}

export const critiqueLogger: CritiqueLogger = createCritiqueLogger();
