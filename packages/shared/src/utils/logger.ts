type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>) {
    if (shouldLog('debug')) {
      console.debug(`[${formatTimestamp()}] DEBUG ${message}`, data ?? '');
    }
  },

  info(message: string, data?: Record<string, unknown>) {
    if (shouldLog('info')) {
      console.info(`[${formatTimestamp()}] INFO  ${message}`, data ?? '');
    }
  },

  warn(message: string, data?: Record<string, unknown>) {
    if (shouldLog('warn')) {
      console.warn(`[${formatTimestamp()}] WARN  ${message}`, data ?? '');
    }
  },

  error(message: string, data?: Record<string, unknown>) {
    if (shouldLog('error')) {
      console.error(`[${formatTimestamp()}] ERROR ${message}`, data ?? '');
    }
  },
};
