# Autonomous RC Car 3D Simulator Design

## Understanding summary

- Keep the existing RC Lab homepage, Vite app shell, and GitHub Pages-compatible relative asset configuration.
- Replace the CSS simulator mockup with a browser-based Three.js driving demo using `three@0.160.0`.
- Present a road and driving-mode selection view before starting a simulation.
- Implement City Roads, Curved Roads, and an Obstacle Course as selectable simulator environments.
- Support manual keyboard and on-screen driving, basic speed/steering, road boundaries, obstacle collisions, a follow/adjustable camera, speed display, status, pause/restart, and reset.
- Show an Autonomous mode choice only as a clear non-functional placeholder; do not implement ML or autonomous driving.
- Document proposed future hardware, sensor, and telemetry interfaces without connecting hardware or implementing a backend.

## Current project status

The project is a Vite static site with `src/main.js` routing between a homepage in `src/home.js` and a simulator mockup in `src/simulator.js`. The current simulator uses DOM/CSS for a decorative track, local keyboard/pointer interactions, and generated speed/distance values. It is not a 3D scene.

`package.json` and `package-lock.json` do not contain Three.js. `npm ls three --depth=0` reports no direct Three.js dependency. The existing production build succeeds, and `vite.config.js` already sets `base: './'` for relative project-page asset URLs. The project does not have a test runner or a Git repository.

## Assumptions and non-goals

- Add the exact Three.js version `0.160.0` as a direct dependency.
- Use procedural Three.js geometry for the RC car, roads, markings, cones, and barriers; do not require external model downloads.
- Use lightweight custom JavaScript kinematics rather than a full physics engine.
- Target a typical modern desktop browser with WebGL and aim for smooth interaction around 30 FPS. Display an explicit error if WebGL or renderer initialization is unavailable.
- Keep all simulator runtime behavior client-side, with no user data collection or external runtime service.
- Do not add a backend, database, hardware connection, autonomous-driving implementation, machine learning, object detection, or fabricated sensor readings.
- Surface behavior, hilly-road physics, sensor simulation, and physical-car testing are not claimed.

## Final architecture

Retain the current hash-routed single-page app. `#home` renders the existing homepage. `#simulator` opens the road and mode selection interface. Starting a road transitions the simulator through `ready`, `running`, and `paused` states without changing the route. Returning Home invokes the simulator cleanup function.

Opening `#simulator` initializes a preview of the selected road so the 3D viewport is visible before driving. The render loop remains scoped to the simulator view; vehicle motion begins only after the user starts a manual drive. Manual input updates a kinematic vehicle state; each simulation step checks the selected road’s drivable boundaries and obstacle collision shapes, then updates vehicle and camera transforms and the dashboard. Reset restores the selected road and vehicle to their initial state. Pause suspends simulation updates while retaining the current scene. Cleanup cancels animation, removes event listeners, and disposes geometries, materials, and renderer resources.

Three.js performs rendering only. Vehicle position, heading, speed, steering, and collision checks are owned by local JavaScript modules; no physics engine or network service is involved. Speed is stored internally in meters per second and formatted as mph for the UI.

## Module and file responsibilities

- `package.json`, `package-lock.json`: add exact `three@0.160.0` dependency; do not add another runtime or physics library.
- `src/main.js`: preserve app routing, mount and unmount views, and invoke simulator cleanup when navigating away.
- `src/home.js`: preserve the current homepage and its Start Simulator navigation.
- `src/simulator.js`: render road/mode selection and dashboard UI; own selection and ready/running/paused transitions; coordinate input, vehicle state, scene, and UI.
- `src/simulator/roads.js`: export the road catalog, `buildRoad(road): THREE.Group`, and pure helpers for sampled road boundaries and collision checks.
- `src/simulator/vehicle.js`: export procedural vehicle creation and pure kinematic state/update helpers.
- `src/simulator/scene.js`: initialize Three.js scene, renderer, lighting, camera and selected road; synchronize visuals; handle resize and view controls; provide disposal and explicit initialization errors.
- `src/simulator/vehicle.test.js`, `src/simulator/roads.test.js`: use Node’s built-in `node:test` runner to cover pure movement and road/collision logic without adding test dependencies.
- `docs/superpowers/designs/2026-10-27-autonomous-rc-3d-simulator.md`: this validated design and decision record.
- `docs/HARDWARE-INTEGRATION.md`: proposed future hardware/backend boundaries and interface shapes; no runtime connection.
- `src/style.css`: update current simulator styles for selection, viewport, 3D canvas, dashboard, controls, status, and responsive layouts while preserving homepage styling.

## Road catalog and collision behavior

Each road definition has a stable ID, display name, summary, width, centerline waypoints, surface label, markings/roadside props, and obstacle placements. A shared road builder consumes this data to construct a drivable surface and its visible markings and boundaries.

Road catalog:

1. **City Roads:** a drivable route with straight sections, turns, lane markings, and a marked intersection.
2. **Curved Roads:** connected left and right bends with different curve radii/angles.
3. **Obstacle Course:** a winding lane with cones and barriers to demonstrate collision handling.

Road-edge checks prevent the vehicle from escaping the drivable region and update status when the boundary is reached. Obstacle collision sets a visible collision status and stops vehicle movement until the user resets or restarts. Collision geometry remains simple and suitable for the procedural objects. The catalog format is designed to admit later roads; the current catalog contains these three routes.

## Controls, modes, and camera

- Road selection and driving mode are selected before starting.
- **Manual** is the only mode that accepts driving input.
- **Autonomous** may be selected to reveal a visible “not implemented” explanation; it does not drive, claim test results, or expose generated sensor readings.
- **W/Up** accelerates; **S/Down** reverses and acts as braking when moving forward; **A/Left** and **D/Right** steer.
- On-screen controls share the same held-input state. Keydown/keyup and pointer down/up/cancel/blur must not leave controls stuck.
- Start creates the scene; Pause/Resume stops or restarts simulation updates; Restart restores the selected road’s initial state; Reset Camera restores its default view.
- A maximum-speed slider sets the manual speed limit; throttle remains the driving input.
- Follow camera is the default. A Follow/Orbit view control plus pointer drag and wheel/trackpad zoom let the user adjust the view.
- Dashboard shows selected road, manual/autonomous placeholder status, driving state, and locally simulated speed. No physical telemetry is implied.

## Future hardware and sensor interfaces

`docs/HARDWARE-INTEGRATION.md` will define proposed interface shapes only:

```text
VehicleCommand:
  throttle: number in [-1, 1]
  steering: number in [-1, 1]
  brake: boolean
  mode: "manual" | "autonomous"
  timestamp: ISO-8601 string

VehicleTelemetry:
  timestamp: ISO-8601 string
  speedMps: number
  pose: { xMeters: number, zMeters: number, headingRadians: number }
  status: "ready" | "moving" | "paused" | "fault"

SensorFrame:
  timestamp: ISO-8601 string
  camera: { frameReference: string } | null
  distance: Array<{ sensorId: string, meters: number, status: string }>
```

These shapes do not represent actual sensor readings. The future data path is **simulator UI → transport adapter → separately deployed backend gateway → hardware**, with telemetry returning through the gateway. GitHub Pages can serve the static frontend but cannot host the gateway. A later physical integration requires a separately reviewed transport, authentication, failure handling, and safe command policy; none are inferred or implemented here.

## Error handling and validation

- If Three.js renderer/WebGL setup fails, show a clear in-view error and retain working Home navigation; do not silently substitute simulated hardware behavior.
- Validate the road/mode selection before initialization and surface any initialization failures in the simulator UI.
- Ensure pause, reset, route cleanup, tab hiding, and window blur release controls or stop updates as appropriate.
- Run `node --test src/simulator/*.test.js` for pure vehicle and road logic.
- Run `npm run build` and inspect generated asset paths for relative URLs.
- In a browser, verify the homepage, selection screen, direct `#simulator` load, each road start, keyboard/on-screen control states, boundaries, obstacles, speed cap, pause/resume, restart, camera orbit/zoom/reset, mode placeholder, navigation cleanup, WebGL error handling, and a narrow mobile layout.
- Do not claim physical hardware or autonomous behavior was tested.

## Decision log

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D1 | Add exact `three@0.160.0`. | Leave dependency absent; choose another Three.js version. | User approved adding the version named in the project specification after inspection found it missing. |
| D2 | Use procedural Three.js geometry. | Download a free third-party RC model and road assets. | Avoid asset licensing, network loading, and extra files while making a complete demonstrable scene. |
| D3 | Use custom lightweight kinematics and collision checks. | Add a general-purpose physics engine. | The simulator needs controllable movement and basic boundaries/collisions, not a complex rigid-body simulation. |
| D4 | Implement City, Curved, and Obstacle Course roads. | Other combinations from the eight proposed road types. | User selected this set; it demonstrates intersections, bends, and collision obstacles. |
| D5 | Keep road selection and simulator in the existing hash-routed app. | Add a new document/route or recreate the app. | Preserves current working navigation and static GitHub Pages compatibility. |
| D6 | Keep Autonomous as a selectable but non-driving placeholder. | Implement autonomous behavior or omit the mode UI. | ML is handled separately; the user requested visible separation without false autonomy claims. |
| D7 | Make speed control a maximum-speed slider. | Simulation time-speed multiplier. | User selected a speed cap while retaining throttle as the actual manual driving input. |
| D8 | Use follow by default and provide adjustable orbit/zoom and camera reset. | Fixed camera only or free camera only. | Satisfies follow-camera and viewing-angle requirements while keeping a useful default view. |
| D9 | Document future interfaces without adding a backend or hardware adapter. | Add a backend/database or hardware connection. | Static hosting is sufficient for the simulator; hardware requires a separately deployed gateway and safety review. |
| D10 | Use Node’s built-in test runner for pure logic and browser checks for rendering. | Add a test framework dependency or rely only on a successful build. | Keeps dependencies minimal while testing deterministic simulation logic and real Three.js interactions. |

## Source readability cleanup

### Confirmed understanding

- The project is a small, static Vite/Three.js simulator intended to be understandable as a student project.
- The requested change concerns source code, not a visual redesign.
- Keep the working simulator features, browser compatibility, tests, and relative asset paths.
- Prefer straightforward, familiar JavaScript and useful module boundaries over a rewrite or extra abstractions.
- Do not alter code to evade AI detectors or imply a particular authorship.

### Scope and assumptions

The cleanup will focus on application JavaScript and directly related tests. Existing planning/design documents and future hardware documentation are out of scope. The simulator remains a local browser demo with no backend, sensitive data, or multi-user runtime. Maintain the existing behavior and performance; optimize for comprehension and ease of explanation.

### Accepted approach

Make a modest, behavior-preserving cleanup in the current modules. Keep the separation between simulator UI/state, road definitions and rendering, vehicle kinematics, and Three.js scene lifecycle. Only simplify patterns that are unnecessarily repetitive or harder to explain than their direct equivalent. Preserve explicit WebGL failure handling, lifecycle cleanup, accessible controls, and meaningful names. Avoid adding comments or abstractions solely to create a particular appearance.

### Cleanup decision log

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| C1 | Keep current module boundaries and simplify in place. | Merge simulator modules or make only cosmetic edits. | Low risk while retaining useful separation and making targeted readability improvements. |
| C2 | Preserve runtime behavior and verify with tests/build. | Change features or remove functionality during refactoring. | The request is about readability, not a simulator redesign. |
| C3 | Limit edits to application source and related tests; leave design/planning/hardware documents untouched. | Rewrite previous project documentation as part of the cleanup. | Those documents are project history and outside the requested source-code scope. |
| C4 | Treat “human-made” as a readability goal, not detector evasion or authorship concealment. | Obfuscate or intentionally distort code to influence authorship classifiers. | Maintain honest, maintainable source. |
