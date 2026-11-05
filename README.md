# Autonomous RC Car Simulator

An interactive, browser-based 3D simulation and virtual test track for autonomous RC vehicle exploration. Built with Three.js and Vite.

## Overview

The Autonomous RC Car Simulator provides a real-time virtual environment to experiment with vehicle kinematics, map-based waypoint navigation, autonomous obstacle avoidance, and telemetry monitoring in a web browser without requiring physical hardware.

## Key Features

- **Real-Time 3D Simulation**: Five procedural routes, road markings, intersections, barriers, obstacle props, and dynamic vehicle rendering powered by Three.js.
- **Map-Based Autonomous Driving**: Path-following algorithm that computes safe vehicle routes around track waypoints and obstacles with real-time waypoint progression.
- **Manual Control Option**: Keyboard (`WASD` / Arrow keys + `Space` for brake) and on-screen touch/mouse directional buttons.
- **Virtual Sensors**: Deterministic front ultrasonic-style range, left/right distance readings, and camera-like obstacle labels computed from known track geometry. These are simulated estimates, not physical sensor or image-processing results.
- **Surface Conditions**: Dry asphalt, wet/low-grip asphalt, and uneven presets affect speed, acceleration, braking, and road appearance.
- **Live Telemetry Dashboard**: Speed, session distance, steering, route and surface condition, directional readings, camera-like detections, and system status.
- **Optional Local Backend**: Express REST API for validated vehicle, mode/control, simulated sensor, and route-obstacle snapshots. The browser remains authoritative for physics and autonomous decisions.
- **Multiple Test Tracks**:
  - **City Road**: Urban intersection, roadside buildings, and traffic cone obstacles.
  - **Highway**: Sweeping turns, safety guard rails, and a construction obstacle.
  - **Curved Track**: Alternating bends, kerbs, and tire stacks.
  - **Obstacle Course**: Slalom route with cones, barriers, and drums.
  - **Uneven Road**: Rumble strips, rough-surface scenery, and a boundary pylon.
- **Four Camera Modes**: Follow, orbit, top-down, and bumper views.

All driving, telemetry, and sensor values are generated locally in the browser. The app does not connect to physical hardware, access a webcam, or use machine learning.

## Tech Stack

- **Three.js** (v0.160.0): 3D scene graph, road geometry generation, lighting, and rendering.
- **Vanilla JavaScript**: ES modules for vehicle physics, autopilot path generation, and UI state management.
- **Vanilla CSS**: Bespoke responsive dark-mode styling with zero framework bloat.
- **Vite**: Rapid local development and production bundling configured for GitHub Pages (`base: './'`).
- **Express**: Optional loopback-only local REST API; no database or persistent session history.
- **Node.js Test Runner**: Built-in native unit test suites for frontend behavior, vehicle physics, autopilot, sensors, the API client, and backend endpoints.

## Project Structure

```text
autocar/
├── Frontend/
│   ├── .env.example              # Example API configuration for local backend sync
│   ├── index.html                # HTML entry point with semantic metadata
│   ├── vite.config.js            # Vite build configuration for relative asset URLs
│   ├── package.json              # Frontend scripts and dependencies
│   ├── public/
│   │   └── favicon.svg            # Custom simulator icon
│   └── src/
│       ├── simulator/
│       │   ├── autopilot.js       # Map-based path planner and obstacle avoidance
│       │   ├── autopilot.test.js
│       │   ├── roads.js           # Road catalogs and Three.js geometry builders
│       │   ├── roads.test.js
│       │   ├── scene.js           # Three.js scene setup, lighting, and camera controllers
│       │   ├── sensors.js         # Deterministic virtual range and camera-like detections
│       │   ├── sensors.test.js
│       │   ├── surfaceConditions.js
│       │   ├── surfaceConditions.test.js
│       │   ├── vehicle.js         # Physically simulated RC vehicle state model
│       │   └── vehicle.test.js
│       ├── services/
│       │   ├── backendClient.js  # Optional API client for backend sync
│       │   └── backendClient.test.js
│       ├── home.js               # Landing overview page
│       ├── main.js               # Hash router and view mounting
│       ├── simulator.js          # Simulator dashboard and controls orchestration
│       ├── simulator.test.js     # DOM and simulator behavior tests
│       └── style.css             # Global layout and simulator styling
├── Backend/
│   ├── package.json              # Backend scripts and Express dependency
│   ├── src/
│   │   ├── app.js                # Express middleware, routes, CORS, and error handling
│   │   ├── config.js             # Host/port/CORS/body-limit configuration
│   │   ├── index.js              # Backend entry point
│   │   ├── routes/
│   │   │   ├── vehicle.js
│   │   │   ├── telemetry.js
│   │   │   ├── sensors.js
│   │   │   └── obstacles.js
│   │   └── services/
│   │       ├── validation.js    # Strict request validation and error generation
│   │       └── simulationStore.js
│   └── test/
│       └── api.test.js           # Backend contract and validation tests
├── docs/
│   ├── HARDWARE-INTEGRATION.md
│   └── superpowers/
├── .gitignore
├── README.md
└── .env.example                  # Optional root-level environment template (not required)
```

## Getting Started

### Prerequisites

- Node.js (18+ or 20+ recommended)
- npm

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

To enable local backend sync, create `Frontend/.env.local` with:

```text
VITE_API_BASE_URL=http://127.0.0.1:3001
```

### Backend

```bash
cd Backend
npm install
npm start
```

The backend listens on loopback only by default at `http://127.0.0.1:3001`.

### Running Tests

Frontend tests:

```bash
cd Frontend
npm test
```

Backend tests:

```bash
cd Backend
npm test
```

### Production Build

```bash
cd Frontend
npm run build
npm run preview
```

GitHub Pages builds remain static and use `base: './'`; the backend is not deployed by GitHub Pages.

## Deployment

The project is preconfigured for static hosting such as GitHub Pages. The Vite config sets `base: './'`, allowing the built assets in `dist/` to load relative to any project URL subdirectory.

## License

MIT
