import * as THREE from 'three'
import { getSurfaceCondition } from './surfaceConditions.js'

export const ROAD_DEFINITIONS = [
  {
    id: 'city',
    name: 'City Road',
    summary: 'Urban corridor with lane markings, a 4-way intersection, roadside buildings, and traffic cones.',
    width: 10,
    surface: 'asphalt',
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [
      { x: 0, z: 0 },
      { x: 0, z: 22 },
      { x: 0, z: 31 },
      { x: 2, z: 36 },
      { x: 8, z: 39 },
      { x: 21, z: 39 },
      { x: 29, z: 42 },
      { x: 32, z: 49 },
      { x: 32, z: 72 }
    ],
    intersections: [{ x: 0, z: 31, width: 36, depth: 10 }],
    markings: ['lane-center', 'stop-line'],
    obstacles: [
      { id: 'city-cone-1', kind: 'cone', x: 0.6, z: 18, radius: 0.65 },
      { id: 'city-barrier', kind: 'barrier', x: 14, z: 37, radius: 0.9 }
    ]
  },
  {
    id: 'highway',
    name: 'Highway',
    summary: 'High-speed multi-lane corridor with sweeping curves, continuous safety guard rails, and lane dividers.',
    width: 14,
    surface: 'asphalt',
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [
      { x: 0, z: 0 },
      { x: 0, z: 25 },
      { x: 2, z: 45 },
      { x: 8, z: 65 },
      { x: 18, z: 85 },
      { x: 26, z: 105 },
      { x: 28, z: 125 }
    ],
    intersections: [],
    markings: ['highway-lanes'],
    obstacles: [
      { id: 'highway-barrier', kind: 'barrier', x: 4.8, z: 55, radius: 0.9 }
    ]
  },
  {
    id: 'curved',
    name: 'Curved Track',
    summary: 'Technical test circuit featuring alternating S-bends, apex racing kerbs, and tire barrier stacks.',
    width: 9,
    surface: 'asphalt',
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [
      { x: 0, z: 0 },
      { x: 0, z: 14 },
      { x: 3, z: 22 },
      { x: 10, z: 28 },
      { x: 19, z: 29 },
      { x: 27, z: 25 },
      { x: 31, z: 17 },
      { x: 29, z: 9 },
      { x: 22, z: 3 },
      { x: 13, z: 2 },
      { x: 5, z: 6 },
      { x: 1, z: 14 },
      { x: 3, z: 23 },
      { x: 10, z: 30 }
    ],
    intersections: [],
    markings: ['lane-center', 'curbs'],
    obstacles: []
  },
  {
    id: 'obstacle-course',
    name: 'Obstacle Course',
    summary: 'Dedicated slalom proving ground with hazard cones, jersey barriers, and industrial safety drums.',
    width: 10,
    surface: 'asphalt',
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [
      { x: 0, z: 0 },
      { x: 0, z: 13 },
      { x: -3, z: 20 },
      { x: -10, z: 26 },
      { x: -15, z: 34 },
      { x: -14, z: 44 },
      { x: -7, z: 51 },
      { x: 4, z: 57 },
      { x: 12, z: 65 },
      { x: 14, z: 77 }
    ],
    intersections: [],
    markings: ['lane-center'],
    obstacles: [
      { id: 'cone-a', kind: 'cone', x: -2.4, z: 17, radius: 0.7 },
      { id: 'barrier-a', kind: 'barrier', x: -12, z: 40, radius: 0.9 },
      { id: 'barrel-b', kind: 'barrel', x: 2.3, z: 56, radius: 0.7 },
      { id: 'cone-c', kind: 'cone', x: 12, z: 71, radius: 0.7 }
    ]
  },
  {
    id: 'uneven',
    name: 'Uneven Road',
    summary: 'Proving grounds featuring rumble strip patches, cobblestone test zones, and surface transition markings.',
    width: 10,
    surface: 'uneven',
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [
      { x: 0, z: 0 },
      { x: 0, z: 18 },
      { x: 3, z: 32 },
      { x: 8, z: 48 },
      { x: 11, z: 64 },
      { x: 7, z: 80 },
      { x: 0, z: 95 },
      { x: 0, z: 115 }
    ],
    intersections: [],
    markings: ['lane-center', 'rumble-strips'],
    obstacles: [
      { id: 'uneven-pylon', kind: 'pylon', x: 5.2, z: 40, radius: 0.75 }
    ]
  }
]

function distanceToSegment(position, start, end) {
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ
  const amount = lengthSquared === 0
    ? 0
    : Math.max(
      0,
      Math.min(1, ((position.x - start.x) * deltaX + (position.z - start.z) * deltaZ) / lengthSquared)
    )
  const closestX = start.x + amount * deltaX
  const closestZ = start.z + amount * deltaZ
  return Math.hypot(position.x - closestX, position.z - closestZ)
}

export function distanceToRoadCenterline(position, road) {
  const distances = road.centerline.slice(1).map((point, index) => (
    distanceToSegment(position, road.centerline[index], point)
  ))
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY
}

export function isInsideRoad(position, vehicleRadius, road) {
  return Number.isFinite(road.width)
    && road.width > 0
    && Number.isFinite(vehicleRadius)
    && vehicleRadius >= 0
    && distanceToRoadCenterline(position, road) + vehicleRadius <= road.width / 2
}

export function findCollidingObstacle(position, vehicleRadius, road) {
  if (!Number.isFinite(vehicleRadius) || vehicleRadius < 0) return null

  return road.obstacles.find((obstacle) => (
    Number.isFinite(obstacle.radius)
      && Math.hypot(position.x - obstacle.x, position.z - obstacle.z) <= vehicleRadius + obstacle.radius
  )) ?? null
}

function getRibbonEdges(centerline, halfWidth) {
  return centerline.map((point, index) => {
    const previous = centerline[Math.max(0, index - 1)]
    const next = centerline[Math.min(centerline.length - 1, index + 1)]
    const directionX = next.x - previous.x
    const directionZ = next.z - previous.z
    const length = Math.hypot(directionX, directionZ) || 1
    const normalX = -directionZ / length
    const normalZ = directionX / length

    return {
      left: { x: point.x + normalX * halfWidth, z: point.z + normalZ * halfWidth },
      right: { x: point.x - normalX * halfWidth, z: point.z - normalZ * halfWidth },
      normalX,
      normalZ,
      point
    }
  })
}

function makeRoadRibbon(centerline, width, yOffset = 0) {
  const edges = getRibbonEdges(centerline, width / 2)
  const positions = []
  const uvs = []
  const indices = []

  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index]
    positions.push(edge.left.x, yOffset, edge.left.z, edge.right.x, yOffset, edge.right.z)
    uvs.push(0, index, 1, index)
    if (index < edges.length - 1) {
      const current = index * 2
      indices.push(current, current + 2, current + 1, current + 1, current + 2, current + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeLine(points, color, opacity = 1, y = 0.035) {
  const vertices = points.map((point) => new THREE.Vector3(point.x, y, point.z))
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(vertices),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
  )
}

function addCenterMarkings(group, road) {
  for (let index = 1; index < road.centerline.length; index += 1) {
    const start = road.centerline[index - 1]
    const end = road.centerline[index]
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    const dashCount = Math.floor(length / 4)
    for (let dash = 0; dash < dashCount; dash += 1) {
      const startRatio = (dash * 4 + 0.7) / length
      const endRatio = Math.min((dash * 4 + 2.5) / length, 1)
      if (startRatio >= 1) continue
      group.add(makeLine([
        {
          x: start.x + (end.x - start.x) * startRatio,
          z: start.z + (end.z - start.z) * startRatio
        },
        {
          x: start.x + (end.x - start.x) * endRatio,
          z: start.z + (end.z - start.z) * endRatio
        }
      ], 0xe2e8f0, 0.9))
    }
  }
}

function addHighwayMarkings(group, road) {
  const halfWidth = road.width / 2
  const laneOffset = halfWidth * 0.45
  const leftEdges = getRibbonEdges(road.centerline, laneOffset)
  const rightEdges = getRibbonEdges(road.centerline, -laneOffset)

  const drawDashes = (edges) => {
    for (let index = 1; index < edges.length; index += 1) {
      const start = edges[index - 1].left
      const end = edges[index].left
      const length = Math.hypot(end.x - start.x, end.z - start.z)
      const dashCount = Math.floor(length / 4.5)
      for (let dash = 0; dash < dashCount; dash += 1) {
        const startRatio = (dash * 4.5 + 0.8) / length
        const endRatio = Math.min((dash * 4.5 + 2.8) / length, 1)
        if (startRatio >= 1) continue
        group.add(makeLine([
          {
            x: start.x + (end.x - start.x) * startRatio,
            z: start.z + (end.z - start.z) * startRatio
          },
          {
            x: start.x + (end.x - start.x) * endRatio,
            z: start.z + (end.z - start.z) * endRatio
          }
        ], 0xf8fafc, 0.95))
      }
    }
  }

  drawDashes(leftEdges)
  drawDashes(rightEdges)
}

function addIntersections(group, road) {
  for (const intersection of road.intersections) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(intersection.width, intersection.depth),
      new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.92 })
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.set(intersection.x, 0.012, intersection.z)
    group.add(patch)

    const stopLine = makeLine([
      { x: intersection.x - intersection.width / 2, z: intersection.z + intersection.depth / 2 - 0.7 },
      { x: intersection.x + intersection.width / 2, z: intersection.z + intersection.depth / 2 - 0.7 }
    ], 0xf1f5f9)
    group.add(stopLine)
  }
}

function addObstacleMesh(group, obstacle) {
  const isBarrier = obstacle.kind === 'barrier'
  const isBarrel = obstacle.kind === 'barrel'
  const isPylon = obstacle.kind === 'pylon'

  if (isBarrier) {
    const barrierGroup = new THREE.Group()
    barrierGroup.position.set(obstacle.x, 0, obstacle.z)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.82, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
    )
    base.position.y = 0.41
    base.castShadow = true
    base.receiveShadow = true
    barrierGroup.add(base)

    const chevron = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 0.28, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 })
    )
    chevron.position.y = 0.45
    barrierGroup.add(chevron)

    group.add(barrierGroup)
    return
  }

  if (isBarrel) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.65 })
    )
    barrel.position.set(obstacle.x, 0.55, obstacle.z)
    barrel.castShadow = true
    group.add(barrel)

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.49, 0.49, 0.22, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    )
    band.position.set(obstacle.x, 0.6, obstacle.z)
    group.add(band)
    return
  }

  if (isPylon) {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.25, 10),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 })
    )
    pylon.position.set(obstacle.x, 0.62, obstacle.z)
    pylon.castShadow = true
    group.add(pylon)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.1, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    )
    base.position.set(obstacle.x, 0.05, obstacle.z)
    group.add(base)
    return
  }

  // Traffic cone default
  const coneGroup = new THREE.Group()
  coneGroup.position.set(obstacle.x, 0, obstacle.z)

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 })
  )
  cone.position.y = 0.55
  cone.castShadow = true
  coneGroup.add(cone)

  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.32, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
  )
  stripe.position.y = 0.52
  coneGroup.add(stripe)

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.06, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
  )
  base.position.y = 0.03
  coneGroup.add(base)

  group.add(coneGroup)
}

function addCityScenery(group, road) {
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
  const accentBuildingMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.2, metalness: 0.6 })

  const buildings = [
    { x: -16, z: 12, w: 10, d: 14, h: 18, mat: buildingMaterial },
    { x: -18, z: 38, w: 12, d: 16, h: 26, mat: accentBuildingMaterial },
    { x: 18, z: 15, w: 12, d: 12, h: 22, mat: buildingMaterial },
    { x: 22, z: 58, w: 14, d: 14, h: 32, mat: accentBuildingMaterial },
    { x: -12, z: 62, w: 10, d: 12, h: 16, mat: buildingMaterial },
    { x: 48, z: 42, w: 16, d: 14, h: 24, mat: buildingMaterial },
    { x: 46, z: 70, w: 12, d: 16, h: 28, mat: accentBuildingMaterial }
  ]

  for (const b of buildings) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), b.mat)
    mesh.position.set(b.x, b.h / 2, b.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)

    // Window bands
    const windowBand = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.1, 0.8, b.d + 0.1), glassMaterial)
    windowBand.position.set(b.x, b.h * 0.6, b.z)
    group.add(windowBand)
  }

  // Street lamp posts
  const lampPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 })
  const lampLightMaterial = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.8 })

  const lampPositions = [
    { x: -6.5, z: 10 },
    { x: -6.5, z: 24 },
    { x: 6.5, z: 10 },
    { x: 6.5, z: 24 },
    { x: 15, z: 45 },
    { x: 26, z: 45 }
  ]

  for (const pos of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8), lampPoleMaterial)
    pole.position.set(pos.x, 2.25, pos.z)
    pole.castShadow = true
    group.add(pole)

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.35), lampLightMaterial)
    lamp.position.set(pos.x, 4.5, pos.z)
    group.add(lamp)
  }
}

function addHighwayScenery(group, road) {
  const guardRailMaterial = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 })
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })

  const edges = getRibbonEdges(road.centerline, road.width / 2 + 0.35)

  for (let index = 0; index < edges.length - 1; index += 1) {
    const startLeft = edges[index].left
    const endLeft = edges[index + 1].left
    const startRight = edges[index].right
    const endRight = edges[index + 1].right

    const addRailSegment = (start, end) => {
      const deltaX = end.x - start.x
      const deltaZ = end.z - start.z
      const length = Math.hypot(deltaX, deltaZ)
      const angle = Math.atan2(deltaX, deltaZ)

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, length), guardRailMaterial)
      rail.position.set((start.x + end.x) / 2, 0.55, (start.z + end.z) / 2)
      rail.rotation.y = angle
      rail.castShadow = true
      group.add(rail)

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), postMaterial)
      post.position.set(start.x, 0.42, start.z)
      group.add(post)
    }

    addRailSegment(startLeft, endLeft)
    addRailSegment(startRight, endRight)
  }

  // Overhead highway gantry sign
  const gantryGroup = new THREE.Group()
  const gantryZ = 35
  const gantryWidth = road.width + 4
  const postLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 6, 8), guardRailMaterial)
  postLeft.position.set(-gantryWidth / 2, 3, gantryZ)
  gantryGroup.add(postLeft)

  const postRight = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 6, 8), guardRailMaterial)
  postRight.position.set(gantryWidth / 2, 3, gantryZ)
  gantryGroup.add(postRight)

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(gantryWidth, 0.4, 0.4), guardRailMaterial)
  crossbar.position.set(0, 5.8, gantryZ)
  gantryGroup.add(crossbar)

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1.8, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
  )
  sign.position.set(0, 5.2, gantryZ)
  gantryGroup.add(sign)

  group.add(gantryGroup)
}

function addCurvedTrackScenery(group, road) {
  // Racing kerbs along edge
  const edges = getRibbonEdges(road.centerline, road.width / 2)
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })

  for (let index = 0; index < edges.length - 1; index += 1) {
    const current = edges[index]
    const next = edges[index + 1]

    const addKerbStrips = (start, end) => {
      const length = Math.hypot(end.x - start.x, end.z - start.z)
      const count = Math.max(1, Math.floor(length / 1.4))
      for (let i = 0; i < count; i += 1) {
        const mat = i % 2 === 0 ? redMaterial : whiteMaterial
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.2), mat)
        const t = (i + 0.5) / count
        kerb.position.set(start.x + (end.x - start.x) * t, 0.04, start.z + (end.z - start.z) * t)
        kerb.rotation.y = Math.atan2(end.x - start.x, end.z - start.z)
        group.add(kerb)
      }
    }

    addKerbStrips(current.left, next.left)
    addKerbStrips(current.right, next.right)
  }

  // Tire wall stacks in corners
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
  const tirePositions = [
    { x: -5, z: 28 },
    { x: 35, z: 24 },
    { x: 33, z: 5 },
    { x: 14, z: -4 },
    { x: -3, z: 6 }
  ]

  for (const pos of tirePositions) {
    for (let stack = 0; stack < 3; stack += 1) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.35, 12), tireMaterial)
      tire.position.set(pos.x, 0.18 + stack * 0.32, pos.z)
      tire.castShadow = true
      group.add(tire)
    }
  }
}

function addUnevenScenery(group, road) {
  // Rumble strip patches across the road
  const rumbleMaterialYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 })
  const rumbleMaterialBlack = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 })

  const rumbleZPositions = [25, 55, 88]

  for (const rz of rumbleZPositions) {
    for (let i = 0; i < 6; i += 1) {
      const mat = i % 2 === 0 ? rumbleMaterialYellow : rumbleMaterialBlack
      const strip = new THREE.Mesh(new THREE.BoxGeometry(road.width * 0.9, 0.045, 0.32), mat)
      strip.position.set(3, 0.025, rz + i * 0.5)
      group.add(strip)
    }
  }
}

export function buildRoad(road, surfaceCondition) {
  if (!road || road.centerline.length < 2 || !Number.isFinite(road.width) || road.width <= 0) {
    throw new TypeError('Road geometry requires at least two waypoints and a positive width.')
  }
  const activeSurface = surfaceCondition
    ? getSurfaceCondition(surfaceCondition.id)
    : getSurfaceCondition(road.surface === 'uneven' ? 'uneven' : 'dry-asphalt')

  const group = new THREE.Group()
  group.name = `road-${road.id}`

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ color: 0x0f141a, roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  ground.receiveShadow = true
  group.add(ground)

  // Ground subtle grid
  const gridHelper = new THREE.GridHelper(300, 75, 0x1e293b, 0x141b22)
  gridHelper.position.y = -0.04
  group.add(gridHelper)

  // Road surface ribbon
  const surface = new THREE.Mesh(
    makeRoadRibbon(road.centerline, road.width, 0.01),
    new THREE.MeshStandardMaterial({
      color: activeSurface.roadColor,
      roughness: activeSurface.roughness,
      side: THREE.DoubleSide
    })
  )
  surface.receiveShadow = true
  group.add(surface)

  // Road edge lines (cyan / white refined technical boundaries)
  const edges = getRibbonEdges(road.centerline, road.width / 2)
  const edgeColor = road.id === 'highway' ? 0xf8fafc : 0x00e5ff
  group.add(makeLine(edges.map((edge) => edge.left), edgeColor, 0.88, 0.038))
  group.add(makeLine(edges.map((edge) => edge.right), edgeColor, 0.88, 0.038))

  // Centerline markings
  if (road.markings.includes('lane-center')) addCenterMarkings(group, road)
  if (road.markings.includes('highway-lanes')) addHighwayMarkings(group, road)
  addIntersections(group, road)

  // Scenery props
  if (road.id === 'city') addCityScenery(group, road)
  if (road.id === 'highway') addHighwayScenery(group, road)
  if (road.id === 'curved') addCurvedTrackScenery(group, road)
  if (road.id === 'uneven') addUnevenScenery(group, road)

  // Obstacles
  for (const obstacle of road.obstacles) addObstacleMesh(group, obstacle)

  return group
}
