type LogLevel = "info" | "warn" | "error";

const sensitiveKeyPattern = /(api[_-]?key|secret|token|password|authorization|cookie|smtp[_-]?pass|service[_-]?role)/i;

export const appLogger = {
  info(event: string, fields: Record<string, unknown> = {}) {
    writeLog("info", event, fields);
  },
  warn(event: string, fields: Record<string, unknown> = {}) {
    writeLog("warn", event, fields);
  },
  error(event: string, fields: Record<string, unknown> = {}) {
    writeLog("error", event, fields);
  }
};

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return redactSecretLikeString(value);
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactForLog(item)
    ])
  );
}

function writeLog(level: LogLevel, event: string, fields: Record<string, unknown>) {
  const redactedFields = redactForLog(fields) as Record<string, unknown>;
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...redactedFields
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function redactSecretLikeString(value: string) {
  if (value.length < 20) return value;
  if (/^(sk-|sb_secret_|ydc-sk-|tvly-|[A-Za-z0-9_-]{32,})/.test(value)) return "[REDACTED]";
  return value;
}
