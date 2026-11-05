import { Router } from 'express'
import { validateObstacleSet } from '../services/validation.js'

export function createObstaclesRouter(store) {
  const router = Router()

  router.get('/', (request, response) => {
    const { routeId } = request.query
    if (routeId !== undefined && (
      typeof routeId !== 'string' || routeId.trim().length === 0 || routeId.length > 64
    )) {
      response.status(400).json({
        error: {
          code: 'INVALID_QUERY',
          message: 'routeId must be a non-empty string up to 64 characters.',
          details: []
        }
      })
      return
    }

    if (routeId !== undefined) {
      response.json({ routeId, obstacles: store.getObstacles(routeId) })
      return
    }
    response.json({ routes: store.getObstacles() })
  })

  router.post('/', (request, response) => {
    const { routeId, obstacles } = validateObstacleSet(request.body)
    response.status(201).json(store.replaceObstacles(routeId, obstacles))
  })

  return router
}
