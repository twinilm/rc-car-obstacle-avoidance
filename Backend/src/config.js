const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]

function parseInteger(value, name, defaultValue, minimum, maximum) {
  if (value === undefined || value === '') return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`)
  }
  return parsed
}

function parseOrigins(value) {
  if (value === undefined) return DEFAULT_CORS_ORIGINS
  const origins = value.split(',').map((origin) => origin.trim())
  if (
    origins.length === 0
    || origins.some((origin) => {
      if (!origin || origin === '*') return true
      try {
        const parsed = new URL(origin)
        return parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)
      } catch {
        return true
      }
    })
  ) {
    throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins without paths or wildcards.')
  }
  return [...new Set(origins)]
}

export function loadConfig(env = process.env) {
  const host = env.HOST === undefined || env.HOST === '' ? '127.0.0.1' : env.HOST.trim()
  if (!host) throw new Error('HOST must not be empty.')
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('HOST must resolve to loopback (127.0.0.1, localhost, or ::1).')
  }

  return {
    host,
    port: parseInteger(env.PORT, 'PORT', 3001, 1, 65535),
    corsOrigins: parseOrigins(env.CORS_ORIGINS),
    jsonLimitBytes: parseInteger(env.JSON_LIMIT_BYTES, 'JSON_LIMIT_BYTES', 32768, 1024, 32768)
  }
}
