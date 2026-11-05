const SNAPSHOT_INTERVAL_MS = 1000

export function createBackendClient({
  baseUrl = '',
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = 2000
} = {}) {
  const normalizedBaseUrl = typeof baseUrl === 'string'
    ? baseUrl.trim().replace(/\/+$/, '')
    : ''
  const enabled = normalizedBaseUrl.length > 0
  let state = enabled ? 'checking' : 'disabled'
  let message = enabled ? 'Checking backend connection.' : 'Backend sync is disabled.'
  let lastSnapshotAt = Number.NEGATIVE_INFINITY
  let snapshotInFlight = false
  let disposed = false
  let latestVehicle = null
  const controllers = new Set()

  function getStatus() {
    return { state, message }
  }

  function getLatestVehicle() {
    return latestVehicle === null ? null : structuredClone(latestVehicle)
  }

  async function request(path, body) {
    if (!enabled || disposed) return false
    if (typeof fetchImpl !== 'function') {
      state = 'unavailable'
      message = 'Backend sync is unavailable because fetch is not supported.'
      return false
    }

    state = 'checking'
    message = 'Connecting to backend.'
    const controller = new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
      if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`)
      const result = await response.json()
      state = 'connected'
      message = 'Backend connected.'
      return result
    } catch (error) {
      state = 'unavailable'
      message = error?.name === 'AbortError'
        ? `Backend request timed out after ${timeoutMs} ms.`
        : `Backend unavailable: ${error instanceof Error ? error.message : String(error)}`
      return false
    } finally {
      clearTimeout(timeout)
      controllers.delete(controller)
    }
  }

  async function checkHealth() {
    const result = await request('/api/health')
    if (result === false) return false
    if (result?.status !== 'ok' || result?.apiVersion !== 1) {
      state = 'unavailable'
      message = 'Backend returned an incompatible health response.'
      return false
    }
    return true
  }

  async function sendMode(mode) {
    const result = await request('/api/vehicle/mode', { mode })
    return result !== false
  }

  async function sendControl(control) {
    const result = await request('/api/vehicle/control', control)
    return result !== false
  }

  async function publishSnapshot(snapshot) {
    if (!enabled || disposed) return false
    const timestamp = now()
    if (
      snapshotInFlight
      || timestamp - lastSnapshotAt < SNAPSHOT_INTERVAL_MS
    ) {
      return false
    }

    lastSnapshotAt = timestamp
    snapshotInFlight = true
    try {
      const results = await Promise.all([
        request('/api/telemetry', { vehicle: snapshot.vehicle }),
        request('/api/sensors/data', snapshot.sensorFrame),
        request('/api/obstacles', {
          routeId: snapshot.routeId,
          obstacles: snapshot.obstacles
        })
      ])
      if (results.every((result) => result !== false)) {
        latestVehicle = results[0]?.vehicle ?? null
        state = 'connected'
        message = 'Backend connected.'
        return true
      }
      state = 'unavailable'
      message = 'One or more backend snapshot updates failed.'
      return false
    } finally {
      snapshotInFlight = false
    }
  }

  function dispose() {
    disposed = true
    for (const controller of controllers) controller.abort()
    controllers.clear()
  }

  return {
    enabled,
    getStatus,
    getLatestVehicle,
    checkHealth,
    sendMode,
    sendControl,
    publishSnapshot,
    dispose
  }
}
