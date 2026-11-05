function copy(value) {
  return value === null ? null : structuredClone(value)
}

export function createSimulationStore() {
  let vehicle = null
  let mode = 'manual'
  let control = {
    throttle: 0,
    steering: 0,
    brake: false,
    emergencyStop: false
  }
  let sensorFrame = null
  let updatedAt = null
  const obstaclesByRoute = new Map()

  function touch() {
    updatedAt = new Date().toISOString()
    return updatedAt
  }

  return {
    getVehicle() {
      return { vehicle: copy(vehicle), mode, updatedAt }
    },
    getStatus() {
      return {
        mode,
        status: control.emergencyStop ? 'emergency-stop' : vehicle?.status ?? 'ready',
        emergencyStop: control.emergencyStop,
        updatedAt
      }
    },
    setMode(nextMode) {
      mode = nextMode
      touch()
      return { mode }
    },
    setControl(nextControl) {
      control = copy(nextControl)
      touch()
      return { control: copy(control), updatedAt }
    },
    setVehicle(nextVehicle) {
      vehicle = copy(nextVehicle)
      mode = nextVehicle.mode
      touch()
      return { vehicle: copy(vehicle), mode, updatedAt }
    },
    getSensorFrame() {
      return copy(sensorFrame)
    },
    setSensorFrame(frame) {
      sensorFrame = copy(frame)
      touch()
      return { frame: copy(sensorFrame), updatedAt }
    },
    getObstacles(routeId) {
      if (routeId !== undefined) return copy(obstaclesByRoute.get(routeId) ?? [])
      return [...obstaclesByRoute.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, obstacles]) => ({ routeId: id, obstacles: copy(obstacles) }))
    },
    replaceObstacles(routeId, obstacles) {
      obstaclesByRoute.set(routeId, copy(obstacles))
      touch()
      return { routeId, obstacles: copy(obstacles), updatedAt }
    }
  }
}
