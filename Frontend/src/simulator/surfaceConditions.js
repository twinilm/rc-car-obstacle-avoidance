export const SURFACE_CONDITIONS = [
  {
    id: 'dry-asphalt',
    label: 'Dry asphalt',
    speedFactor: 1,
    accelerationFactor: 1,
    brakingFactor: 1,
    roadColor: 0x1e242b,
    roughness: 0.88
  },
  {
    id: 'wet-asphalt',
    label: 'Wet / low-grip asphalt',
    speedFactor: 0.75,
    accelerationFactor: 0.85,
    brakingFactor: 0.65,
    roadColor: 0x101c27,
    roughness: 0.38
  },
  {
    id: 'uneven',
    label: 'Uneven surface',
    speedFactor: 0.65,
    accelerationFactor: 0.75,
    brakingFactor: 0.85,
    roadColor: 0x242b33,
    roughness: 0.95
  }
]

export function getSurfaceCondition(id) {
  const condition = SURFACE_CONDITIONS.find((item) => item.id === id)
  if (!condition) throw new TypeError(`Unknown surface condition: ${id}`)
  return condition
}
