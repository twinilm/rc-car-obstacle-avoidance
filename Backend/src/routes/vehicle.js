import { Router } from 'express'
import { validateControl, validateMode } from '../services/validation.js'

export function createVehicleRouter(store) {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json(store.getVehicle())
  })

  router.get('/status', (_request, response) => {
    response.json(store.getStatus())
  })

  router.post('/mode', (request, response) => {
    const { mode } = validateMode(request.body)
    response.json(store.setMode(mode))
  })

  router.post('/control', (request, response) => {
    response.json(store.setControl(validateControl(request.body)))
  })

  return router
}
