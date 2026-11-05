# Optional Simulator Backend

## Understanding summary

- Add a modular local Node.js/Express REST backend to the existing Vite, vanilla JavaScript, and Three.js simulator.
- Preserve the current frontend, browser-side vehicle physics, map-based autonomous planner, and simulated sensor calculations as authoritative.
- Let the backend validate and mirror vehicle state, mode/control requests, simulated sensor readings, and route obstacles.
- Keep integration optional so the frontend continues to work as a static GitHub Pages app without network access.
- Start with one local browser session, volatile in-memory state, and no accounts, database, Socket.IO, or remote deployment.
- Clearly distinguish simulated data and backend coordination from physical sensors, hardware control, and safety-rated stopping.

## Existing project

The application is a Vite static site with a vanilla JavaScript hash router and a Three.js simulator. Vehicle state and movement are implemented in `src/simulator/vehicle.js`; map-based path planning and autonomous obstacle detours are in `src/simulator/autopilot.js`; roads and obstacle geometry are in `src/simulator/roads.js`; deterministic virtual sensors are in `src/simulator/sensors.js`; and `src/simulator.js` coordinates the render loop, UI, controls, and dashboard. There is no existing server, API, database, or network transport. Vite uses a relative asset base for GitHub Pages.

## Architecture

```text
Browser (Vite / Three.js)              Local Node.js process
┌─────────────────────────────┐        ┌────────────────────────────┐
│ Physics, route planner      │        │ Express REST API           │
│ Simulated sensor generation │  HTTP  │ In-memory simulation state │
│ Dashboard and controls      ├───────►│ Validation and responses   │
│ Optional API client         │◄───────┤ Health and status           │
└─────────────────────────────┘        └────────────────────────────┘
```

The browser remains authoritative for movement, autonomous route decisions, and generation of simulated measurements. The backend accepts bounded JSON snapshots and records the latest state for local coordination and inspection; it does not calculate vehicle physics or drive the car. Requests and responses must identify sensor data as simulated. Backend failure must never stop or block the local simulation.

Proposed project structure:

```text
server/
  src/
    app.js
    index.js
    config.js
    routes/
      health.js
      vehicle.js
      sensors.js
      obstacles.js
    services/
      simulationStore.js
      validation.js
  test/
    api.test.js
src/
  services/
    backendClient.js
```

## API and data flow

Use JSON REST endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Report process/API health and API version. |
| `GET` | `/api/vehicle` | Return the latest in-memory vehicle snapshot and mode. |
| `GET` | `/api/vehicle/status` | Return current driving and emergency-stop status. |
| `POST` | `/api/vehicle/mode` | Validate and record `manual` or `autonomous` mode. |
| `POST` | `/api/vehicle/control` | Validate and record bounded control values and emergency-stop state; never actuate a vehicle. |
| `POST` | `/api/telemetry` | Replace latest vehicle telemetry snapshot. |
| `GET` / `POST` | `/api/sensors` and `/api/sensors/data` | Read or replace the latest simulated sensor frame. |
| `GET` / `POST` | `/api/obstacles` | Read or register validated obstacles associated with a route. |

Vehicle snapshots include a stable simulation vehicle identifier, speed, acceleration, braking state, steering direction, position/heading, mode, status, and distance travelled. Sensor frames include front/left/right ranges, obstacle detections, status, and explicit simulated provenance. Obstacles include identifier, route identifier, position, radius/kind, distance to the obstacle surface from the current vehicle pose, and status.

The optional frontend client is enabled only when `VITE_API_BASE_URL` is configured. With the variable unset, it issues no requests. When enabled, mode/control events are sent promptly; vehicle, sensor, and current-route obstacle snapshots are synchronized at most once per second. Network requests must not be awaited from or block the animation/render loop. The UI may show whether the backend is disabled, connected, or unavailable, but the simulation remains usable in every state.

## Security, reliability, and persistence

- Bind to loopback only by default (`127.0.0.1`); reject non-loopback hosts.
- Allow only configured CORS origins, with the local Vite origin documented for development.
- Apply a conservative JSON body limit and validate content types, required fields, finite numbers, enum values, numeric bounds, and obstacle/sensor array sizes.
- Return consistent JSON errors and appropriate 4xx/5xx status codes; do not silently accept malformed commands.
- Keep only latest session state in process memory. Restart clears it; no database or history retention is required.
- Do not add authentication for this loopback-only single-user development backend. Do not expose it publicly or treat it as a hardware-control interface.
- `emergencyStop` is a mirrored simulation status only. The existing browser-side stop remains local and immediate; the backend response is not a safety-rated stop.
- Backend unavailability and invalid synchronization responses are surfaced as backend status/errors without claiming success or changing local physics.

## Alternatives considered

1. **Express REST with optional API client (selected):** simple, testable, appropriate for one local client and occasional snapshots; no persistent connection.
2. **Express plus Socket.IO:** provides server-push and richer multi-client synchronization but adds connection state and a dependency without a current need.
3. **Backend-authoritative simulation:** centralizes physics and command decisions, but conflicts with the approved browser-authoritative requirement and would make local operation depend on the backend.
4. **Database-backed state:** enables restart persistence and history, but no such requirement exists; adds setup, schema, and maintenance.

## Testing strategy

- Use Node’s built-in test runner and an ephemeral HTTP listener to test every endpoint without requiring a test framework dependency.
- Cover valid and malformed payloads, range/enum checks, body limits, mode transitions, control bounds, emergency-stop reporting, sensor provenance, obstacle registration/listing, health, CORS, and error response shapes.
- Run all existing frontend/simulation tests unchanged and add focused tests for the optional API client.
- Browser-test the simulator with API integration disabled and enabled; verify manual/autonomous operation, dashboard values, backend-offline behavior, and absence of console errors.
- Run frontend production build with no API URL and with a configured API URL to preserve GitHub Pages-relative asset behavior.

## Assumptions

- Initial usage is one browser session and one local Node process, without user accounts or simultaneous-user isolation.
- Backend data is volatile and only latest-state synchronization is useful.
- Backend sync cadence is capped at one update per second for snapshots; discrete mode/control changes may be sent immediately.
- Local development is the only supported backend deployment in this phase.
- The frontend’s API URL comes from a Vite environment variable rather than a runtime UI setting.

## Decision log

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| B1 | Keep browser physics, route planning, and sensor generation authoritative. | Move simulation decisions to Node or make the backend the controller. | Preserves current working simulation and supports offline/static operation. |
| B2 | Use Express REST first; defer Socket.IO. | Persistent bidirectional socket from the beginning. | One local client and throttled snapshots do not require server push. |
| B3 | Keep only latest state in memory; no database. | SQLite or another persistence layer. | Restart-proof history/settings are not required. |
| B4 | Enable sync only with `VITE_API_BASE_URL`. | Always-on localhost requests or an in-app URL setting. | Static GitHub Pages runs without backend requests or UI configuration. |
| B5 | Send snapshots at most once per second and discrete events immediately. | Per-frame telemetry or event-only synchronization. | Keeps network overhead low while exposing useful live state. |
| B6 | Bind to loopback and use configured CORS origins. | Public listen address or permissive CORS. | The backend is local-only, unauthenticated, and not a hardware gateway. |
| B7 | Treat sensor values as simulated and emergency stop as mirrored state only. | Present values as physical measurements or backend stop authority. | Avoids misleading users and unsafe hardware-control implications. |
