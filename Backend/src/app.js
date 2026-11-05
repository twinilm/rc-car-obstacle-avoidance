import express from 'express'
import { createObstaclesRouter } from './routes/obstacles.js'
import { createSensorsRouter } from './routes/sensors.js'
import { createTelemetryRouter } from './routes/telemetry.js'
import { createVehicleRouter } from './routes/vehicle.js'
import { ValidationError } from './services/validation.js'
import { createSimulationStore } from './services/simulationStore.js'

function createCorsMiddleware(allowedOrigins) {
  const origins = new Set(allowedOrigins)
  return (request, response, next) => {
    const origin = request.get('origin')
    if (origin && origins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        response.setHeader('Access-Control-Max-Age', '600')
        response.status(204).end()
        return
      }
    } else if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }
    next()
  }
}

export function createApp({
  config,
  store = createSimulationStore()
}) {
  if (!config || !Array.isArray(config.corsOrigins) || !Number.isInteger(config.jsonLimitBytes)) {
    throw new TypeError('createApp requires valid server configuration.')
  }

  const app = express()
  app.disable('x-powered-by')
  app.use(createCorsMiddleware(config.corsOrigins))
  app.use(express.json({ limit: config.jsonLimitBytes, strict: true }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', apiVersion: 1 })
  })
  app.use('/api/vehicle', createVehicleRouter(store))
  app.use('/api/telemetry', createTelemetryRouter(store))
  app.use('/api/sensors', createSensorsRouter(store))
  app.use('/api/obstacles', createObstaclesRouter(store))

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API route not found.', details: [] }
    })
  })

  app.use((error, _request, response, _next) => {
    if (response.headersSent) return
    if (error instanceof ValidationError) {
      response.status(error.statusCode).json({
        error: { code: error.code, message: error.message, details: error.details }
      })
      return
    }
    if (error?.type === 'entity.too.large') {
      response.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the configured limit.', details: [] }
      })
      return
    }
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.', details: [] }
      })
      return
    }
    console.error('Unhandled backend error.', error)
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.', details: [] }
    })
  })

  return app
}
