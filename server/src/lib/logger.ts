export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function write(level: string, message: string, meta?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}`;
  const payload = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  (level === 'ERROR' ? console.error : console.log)(line + payload);
}

export const consoleLogger: Logger = {
  info: (message, meta) => write('INFO', message, meta),
  warn: (message, meta) => write('WARN', message, meta),
  error: (message, meta) => write('ERROR', message, meta),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
