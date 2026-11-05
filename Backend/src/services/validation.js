export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message)
    this.name = 'ValidationError'
    this.statusCode = 422
    this.code = 'VALIDATION_ERROR'
    this.details = details
  }
}

function fail(path, message) {
  throw new ValidationError('Request body does not match the required schema.', [
    { path, message }
  ])
}

function object(value, path, requiredKeys, optionalKeys = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object')
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'is required')
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'is not allowed')
  }
  return value
}

function string(value, path, maximum = 64) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    fail(path, `must be a non-empty string of at most ${maximum} characters`)
  }
  return value.trim()
}

function number(value, path, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `must be a finite number between ${minimum} and ${maximum}`)
  }
  return value
}

function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}

function oneOf(value, path, choices) {
  if (!choices.includes(value)) fail(path, `must be one of: ${choices.join(', ')}`)
  return value
}

function nullableString(value, path) {
  return value === null ? null : string(value, path)
}

export function validateMode(body) {
  object(body, 'body', ['mode'])
  return { mode: oneOf(body.mode, 'body.mode', ['manual', 'autonomous']) }
}

export function validateControl(body) {
  object(body, 'body', ['throttle', 'steering', 'brake', 'emergencyStop'])
  return {
    throttle: number(body.throttle, 'body.throttle', -1, 1),
    steering: number(body.steering, 'body.steering', -1, 1),
    brake: boolean(body.brake, 'body.brake'),
    emergencyStop: boolean(body.emergencyStop, 'body.emergencyStop')
  }
}

export function validateVehicle(body) {
  object(body, 'body', ['vehicle'])
  const vehicle = object(body.vehicle, 'body.vehicle', [
    'vehicleId',
    'speedMps',
    'accelerationMps2',
    'braking',
    'steering',
    'position',
    'headingRadians',
    'mode',
    'status',
    'distanceMeters'
  ])
  const position = object(vehicle.position, 'body.vehicle.position', ['x', 'z'])

  return {
    vehicle: {
      vehicleId: string(vehicle.vehicleId, 'body.vehicle.vehicleId'),
      speedMps: number(vehicle.speedMps, 'body.vehicle.speedMps', -22, 22),
      accelerationMps2: number(vehicle.accelerationMps2, 'body.vehicle.accelerationMps2', -20, 20),
      braking: boolean(vehicle.braking, 'body.vehicle.braking'),
      steering: number(vehicle.steering, 'body.vehicle.steering', -1, 1),
      position: {
        x: number(position.x, 'body.vehicle.position.x'),
        z: number(position.z, 'body.vehicle.position.z')
      },
      headingRadians: number(vehicle.headingRadians, 'body.vehicle.headingRadians'),
      mode: oneOf(vehicle.mode, 'body.vehicle.mode', ['manual', 'autonomous']),
      status: oneOf(vehicle.status, 'body.vehicle.status', [
        'ready', 'moving', 'collision', 'boundary'
      ]),
      distanceMeters: number(vehicle.distanceMeters, 'body.vehicle.distanceMeters', 0)
    }
  }
}

function validateRangeReading(value, path, maximumDistance) {
  const reading = object(value, path, [
    'distanceMeters', 'obstacleId', 'obstacleKind', 'status'
  ])
  const status = oneOf(reading.status, `${path}.status`, ['clear', 'detected'])
  const distanceMeters = reading.distanceMeters === null
    ? null
    : number(reading.distanceMeters, `${path}.distanceMeters`, 0, maximumDistance)
  const obstacleId = nullableString(reading.obstacleId, `${path}.obstacleId`)
  const obstacleKind = nullableString(reading.obstacleKind, `${path}.obstacleKind`)

  if (status === 'clear' && (
    distanceMeters !== null || obstacleId !== null || obstacleKind !== null
  )) {
    fail(path, 'clear readings must have null distance and obstacle fields')
  }
  if (status === 'detected' && (
    distanceMeters === null || obstacleId === null || obstacleKind === null
  )) {
    fail(path, 'detected readings require a distance and obstacle identity')
  }

  return { distanceMeters, obstacleId, obstacleKind, status }
}

export function validateSensorFrame(body) {
  object(body, 'body', ['vehicleId', 'routeId', 'source', 'readings'])
  const readings = object(
    body.readings,
    'body.readings',
    ['frontUltrasonic', 'leftDistance', 'rightDistance', 'cameraDetections']
  )
  if (!Array.isArray(readings.cameraDetections) || readings.cameraDetections.length > 64) {
    fail('body.readings.cameraDetections', 'must be an array with at most 64 items')
  }

  return {
    vehicleId: string(body.vehicleId, 'body.vehicleId'),
    routeId: string(body.routeId, 'body.routeId'),
    source: oneOf(body.source, 'body.source', ['simulated']),
    readings: {
      frontUltrasonic: validateRangeReading(
        readings.frontUltrasonic,
        'body.readings.frontUltrasonic',
        4
      ),
      leftDistance: validateRangeReading(
        readings.leftDistance,
        'body.readings.leftDistance',
        2.5
      ),
      rightDistance: validateRangeReading(
        readings.rightDistance,
        'body.readings.rightDistance',
        2.5
      ),
      cameraDetections: readings.cameraDetections.map((detection, index) => {
        const path = `body.readings.cameraDetections[${index}]`
        const item = object(
          detection,
          path,
          ['obstacleId', 'obstacleKind', 'distanceMeters']
        )
        return {
          obstacleId: string(item.obstacleId, `${path}.obstacleId`),
          obstacleKind: string(item.obstacleKind, `${path}.obstacleKind`),
          distanceMeters: number(item.distanceMeters, `${path}.distanceMeters`, 0, 15)
        }
      })
    }
  }
}

export function validateObstacleSet(body) {
  object(body, 'body', ['routeId', 'obstacles'])
  if (!Array.isArray(body.obstacles) || body.obstacles.length > 64) {
    fail('body.obstacles', 'must be an array with at most 64 items')
  }

  const ids = new Set()
  const obstacles = body.obstacles.map((obstacle, index) => {
    const path = `body.obstacles[${index}]`
    object(obstacle, path, [
      'id', 'kind', 'x', 'z', 'radius', 'distanceMeters', 'status'
    ])
    const id = string(obstacle.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id`, 'must be unique within the route')
    ids.add(id)
    return {
      id,
      kind: string(obstacle.kind, `${path}.kind`),
      x: number(obstacle.x, `${path}.x`),
      z: number(obstacle.z, `${path}.z`),
      radius: number(obstacle.radius, `${path}.radius`, 0),
      distanceMeters: number(obstacle.distanceMeters, `${path}.distanceMeters`, 0),
      status: oneOf(obstacle.status, `${path}.status`, ['active', 'cleared'])
    }
  })

  return { routeId: string(body.routeId, 'body.routeId'), obstacles }
}
