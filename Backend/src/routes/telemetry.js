import { Router } from 'express'
import { validateVehicle } from '../services/validation.js'

export function createTelemetryRouter(store) {
  const router = Router()

  router.post('/', (request, response) => {
    response.json(store.setVehicle(validateVehicle(request.body).vehicle))
  })

  return router
}
