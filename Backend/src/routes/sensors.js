import { Router } from 'express'
import { validateSensorFrame } from '../services/validation.js'

export function createSensorsRouter(store) {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({ frame: store.getSensorFrame() })
  })

  router.post('/data', (request, response) => {
    response.json(store.setSensorFrame(validateSensorFrame(request.body)))
  })

  return router
}
