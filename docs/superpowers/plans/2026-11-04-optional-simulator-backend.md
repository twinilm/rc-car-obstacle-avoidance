# Optional Simulator Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional local Express REST API and connect it to the existing simulator without changing browser-authoritative physics or breaking GitHub Pages/simulation-only use.

**Architecture:** Keep `src/` as the static Vite/Three.js frontend. Add a separate `server/` Node process with JSON REST routes, strict validation, and latest-only in-memory state. A frontend adapter enabled only by `VITE_API_BASE_URL` sends explicit control/mode events and at-most-1-Hz snapshots without blocking the render loop.

**Tech Stack:** Node.js, Express, browser `fetch`, Node built-in `node:test`.

**Spec:** [Approved optional backend design](../designs/2026-11-04-optional-simulator-backend.md)

## Global Constraints

- Preserve the existing Vite relative asset base `base: './'` for GitHub Pages.
- Keep browser vehicle physics, map-based autonomy, and simulated sensor generation authoritative.
- Default the backend host to `127.0.0.1` and reject non-loopback hosts; do not present it as a physical vehicle controller.
- Do not add a database, Socket.IO, accounts, ML, paid services, or hardware integrations.
- With `VITE_API_BASE_URL` unset, the frontend must make no backend requests and run as it does today.
- Limit frontend telemetry snapshot synchronization to at most once per second; do not await network work from the animation loop.
- Keep latest state in process memory only; restart clears it.
- Include only explicitly configured or documented local Vite origins in the CORS allowlist; do not use wildcard CORS.
- Label all sensor frames and emergency-stop values as simulated/mirrored, not physical measurements or safety-rated behavior.
- Do not add commit steps; this workspace is not a Git repository.

## Review Focus

1. **Backend unavailable or slow:** local driving, stop, reset, and rendering continue; backend status is unavailable and requests do not pile up. Test in the adapter and browser integration task.
2. **Malformed or oversized JSON:** API returns structured 4xx JSON and never mutates stored state. Test body limits and invalid payloads in the API task.
3. **Invalid numeric and enum values:** reject `NaN`/infinite values, out-of-range controls, unknown modes/statuses, negative radii, and malformed sensor readings. Test each resource in the API task.
4. **Cross-origin requests:** allow configured local origins, reject unconfigured origins, and handle preflight without wildcard access. Test CORS in the API task.
5. **Simulation-only/static build:** no configured API URL means zero fetch calls and the production frontend builds with relative asset paths. Test adapter and build in the integration task.

---

## Project File Map

- `package.json`, `package-lock.json`: Express dependency and `server` / `test:server` scripts.
- `server/src/config.js`: parse and validate host, port, CORS allowlist, and JSON body size.
- `server/src/services/validation.js`: parse exact request schemas and return explicit validation errors.
- `server/src/services/simulationStore.js`: replaceable in-memory store for latest vehicle, controls/status, sensors, and route obstacles.
- `server/src/routes/*.js`: health, vehicle, telemetry, sensor, and obstacle HTTP resources.
- `server/src/app.js`: Express middleware, route mounting, not-found handling, and JSON error handling; export an app factory for tests.
- `server/src/index.js`: start the configured HTTP server and handle startup errors.
- `server/test/api.test.js`: API contract, CORS, body-size, validation, and store-isolation tests using a local ephemeral HTTP server.
- `src/services/backendClient.js`: optional injectable API client, request coalescing, telemetry cadence, and status reporting.
- `src/services/backendClient.test.js`: Node built-in tests using a fake fetch and controllable time.
- `src/simulator.js`, `src/simulator.test.js`: publish browser-owned state/events and display backend connection status without gating local simulation.
- `README.md`: backend commands, local environment variables, API contract, and static-hosting/offline behavior.

## API Contract

JSON errors have shape `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }`; `details` may be an empty array. Unknown routes return 404. Request bodies over 32 KB return 413. Invalid JSON returns 400.

- `GET /api/health` → `{ status: "ok", apiVersion: 1 }`.
- `GET /api/vehicle` → `{ vehicle, mode, updatedAt }`; initially `vehicle` is `null`, mode is `"manual"`, and `updatedAt` is `null`.
- `GET /api/vehicle/status` → `{ mode, status, emergencyStop, updatedAt }`.
- `POST /api/vehicle/mode`, body `{ mode }`, accepts only `"manual"` or `"autonomous"`; returns the updated mode/status.
- `POST /api/vehicle/control`, body `{ throttle, steering, brake, emergencyStop }`; throttle and steering must be finite numbers in `[-1, 1]`, and both flags must be booleans. This records the latest command only.
- `POST /api/telemetry`, body `{ vehicle }`, where vehicle is `{ vehicleId, speedMps, accelerationMps2, braking, steering, position: { x, z }, headingRadians, mode, status, distanceMeters }`. `vehicleId` is a nonempty string up to 64 characters; `braking` is boolean; all numbers must be finite; speed is within `[-22, 22]`, acceleration within `[-20, 20]`, steering within `[-1, 1]`, and distance is nonnegative. Mode is `"manual"` or `"autonomous"`; status is `"ready"`, `"moving"`, `"collision"`, or `"boundary"`.
- `GET /api/sensors` → `{ frame }`; initial frame is `null`.
- `POST /api/sensors/data`, body `{ vehicleId, routeId, source: "simulated", readings }`. `vehicleId` and `routeId` are nonempty strings up to 64 characters. `readings` has `frontUltrasonic`, `leftDistance`, and `rightDistance` range records (`distanceMeters` is `null` with status `"clear"` or a finite nonnegative number with status `"detected"`; detected readings require nonempty obstacle id/kind, clear readings have null id/kind), and `cameraDetections` (at most 64 entries of `{ obstacleId, obstacleKind, distanceMeters }` with a finite distance in `[0, 15]`). Reject any source other than `"simulated"`.
- `GET /api/obstacles?routeId=<id>` → `{ routeId, obstacles }`; without `routeId`, return all current route groups.
- `POST /api/obstacles`, body `{ routeId, obstacles }`, atomically replaces that route's obstacle list. Each obstacle is `{ id, kind, x, z, radius, distanceMeters, status }`, where id/kind/routeId are nonempty bounded strings, x/z are finite, radius/distanceMeters are finite/nonnegative, and status is `"active"` or `"cleared"`. The browser computes distance from its current vehicle pose to the obstacle surface. Limit each route to 64 obstacles.

## Task 1: Express App, Configuration, and Validation

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `server/src/config.js`
- Create: `server/src/services/validation.js`
- Create: `server/src/app.js`
- Create: `server/src/index.js`
- Create: `server/test/api.test.js`

**Interfaces:**
- `loadConfig(env = process.env)` returns `{ host, port, corsOrigins, jsonLimitBytes }` and throws a descriptive `Error` for invalid configuration. Defaults: host `127.0.0.1`, port `3001`, origins `http://localhost:5173,http://127.0.0.1:5173`, body limit `32768`. The only allowed hosts are `127.0.0.1`, `localhost`, and `::1`.
- Validation exports `validateMode(body)`, `validateControl(body)`, `validateVehicle(body)`, `validateSensorFrame(body)`, and `validateObstacleSet(body)`. Each returns a newly constructed object containing only accepted fields or throws `ValidationError` with a message and field details.
- `createApp({ config, store })` returns an Express app without listening.
- `server/src/index.js` creates the HTTP server, listens only on `config.host`, and reports startup errors via stderr/nonzero exit.

- [ ] **Step 1: Add failing config and API contract tests**

Add tests that assert `loadConfig({})` uses loopback/3001/local origins/32768, rejects invalid port and empty origin entries, and that `GET /api/health` returns exactly `{ status: "ok", apiVersion: 1 }`. Start `createApp` on `server.listen(0, "127.0.0.1")` in test setup and close it in teardown.

- [ ] **Step 2: Run the focused tests**

Run: `node --test server/test/api.test.js`

Expected: FAIL because backend modules do not exist.

- [ ] **Step 3: Add Express and scripts**

Run `npm install express` and add:

```json
"server": "node server/src/index.js",
"test:server": "node --test server/test/*.test.js"
```

Preserve the current `test`, `build`, and dependency scripts.

- [ ] **Step 4: Implement config, validation error type, and app factory**

Parse comma-separated `CORS_ORIGINS`; trim and reject empty entries. Accept only integer port 1–65535 and `JSON_LIMIT_BYTES` in 1024–32768. Add strict JSON parsing with the configured limit, `/api/health`, a JSON 404 handler, and centralized JSON errors. CORS middleware must echo only an exact allowlisted `Origin`; requests without `Origin` are permitted for local CLI/tests. Reject malformed JSON as 400 and oversized requests as 413.

- [ ] **Step 5: Run focused tests and add config/error cases**

Run: `node --test server/test/api.test.js`

Expected: config and health pass; malformed JSON, unknown route, and body-size tests pass with their specified JSON/status shapes.

- [ ] **Step 6: Start backend and verify the live health endpoint**

Run in one PowerShell session: `npm run server`.

In another: `Invoke-RestMethod http://127.0.0.1:3001/api/health`.

Expected: `{ status: "ok", apiVersion: 1 }`; terminate only the process started for this check.

## Task 2: In-Memory State and REST Resources

**Files:**
- Create: `server/src/services/simulationStore.js`
- Create: `server/src/routes/vehicle.js`
- Create: `server/src/routes/telemetry.js`
- Create: `server/src/routes/sensors.js`
- Create: `server/src/routes/obstacles.js`
- Modify: `server/src/app.js`
- Modify: `server/test/api.test.js`

**Interfaces:**
- `createSimulationStore()` returns methods `getVehicle()`, `getStatus()`, `setMode(mode)`, `setControl(control)`, `setVehicle(vehicle)`, `getSensorFrame()`, `setSensorFrame(frame)`, `getObstacles(routeId?)`, and `replaceObstacles(routeId, obstacles)`. Getters return defensive copies; replacing one route does not mutate other routes.
- Route handlers validate request bodies before calling store methods. Invalid input never changes stored data.
- Every successful update returns the canonical value stored in memory with an ISO timestamp. No history is kept.

- [ ] **Step 1: Write failing tests for store defaults and copy isolation**

Assert initial vehicle/frame are null, initial mode is manual and stopped, control is neutral, and mutating objects returned by getters does not mutate the store. Assert replacing route A obstacles leaves route B unchanged.

- [ ] **Step 2: Run the store/API tests**

Run: `node --test server/test/api.test.js`

Expected: new store tests fail before implementation.

- [ ] **Step 3: Implement the store and test it**

Use `structuredClone` for JSON-compatible state snapshots. Store only latest vehicle/control/mode/sensor state and current obstacle lists by route id. Preserve emergency-stop state in the status response; this value is informational and does not actuate anything.

- [ ] **Step 4: Add failing tests for every REST endpoint**

Cover initial GETs; successful mode/control/telemetry/sensor/obstacle updates; route-filtered obstacle GET; and 400/422 validation responses for missing fields, wrong types, unknown enum values, non-finite/out-of-range numbers, non-simulated sensor source, and oversized arrays. For each invalid update, verify the previously stored value is unchanged.

- [ ] **Step 5: Run API tests to verify endpoint failures**

Run: `node --test server/test/api.test.js`

Expected: endpoint tests fail because resource routes are not mounted.

- [ ] **Step 6: Implement the resource routes**

Implement the contract exactly as listed above. Use 201 for obstacle registration, 200 for replacements and telemetry updates, 400 for invalid/missing/invalid-JSON input, 413 for body limit, 404 for unknown paths, and 422 for well-formed JSON with invalid fields. Ensure `/api/vehicle/status` is mounted before `/api/vehicle/:...` if parameterized routes are added.

- [ ] **Step 7: Test CORS and run all API tests**

Send an allowed `Origin` and assert `Access-Control-Allow-Origin` equals that origin; send an unlisted origin and assert no allow-origin header; send an OPTIONS preflight for an allowed origin and assert allowed methods/headers are explicit. Run `npm run test:server` and fix failures.

## Task 3: Optional Frontend API Client

**Files:**
- Create: `src/services/backendClient.js`
- Create: `src/services/backendClient.test.js`
- Modify: `package.json`

**Interfaces:**
- `createBackendClient({ baseUrl = "", fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 2000 } = {})` returns `{ enabled, getStatus(), checkHealth(), sendMode(mode), sendControl(control), publishSnapshot(snapshot), dispose() }`.
- `getStatus()` returns `{ state, message }`, where `state` is `"disabled"`, `"checking"`, `"connected"`, or `"unavailable"`.
- Disabled clients perform zero fetches. Calls are nonthrowing to callers and update status on errors; they must not return success-shaped results for failed HTTP responses.
- `publishSnapshot` accepts `{ vehicle, sensorFrame, routeId, obstacles }`; at most one snapshot request may be in flight and no two publish attempts occur less than 1000 ms apart. Discrete mode/control calls are not delayed by snapshot throttling.

- [ ] **Step 1: Add failing tests with injected fake fetch and clock**

Use `node:test` and a fake `fetchImpl` that records URLs/options and returns `{ ok, status, json }`. Test disabled zero calls, payload URL/body, `ok: false` status changes to unavailable, network rejection does not throw, `now`-controlled 1000-ms cadence, and skipped overlapping snapshot requests.

- [ ] **Step 2: Run the client test**

Run: `node --test src/services/backendClient.test.js`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement client methods and lifecycle**

Normalize base URL by removing a trailing slash. Add an `AbortController` timeout per request. Require `response.ok`; parse JSON only when the endpoint returns JSON; record errors and return `false` on failure. Clear timers/controllers in `dispose`. Do not read Vite env at module import time; pass `import.meta.env?.VITE_API_BASE_URL ?? ""` from the frontend integration so Node tests remain runnable.

- [ ] **Step 4: Run client tests**

Run: `node --test src/services/backendClient.test.js`

Expected: all adapter tests pass, including no-fetch disabled behavior.

## Task 4: Simulator Integration, Documentation, and Acceptance

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/simulator.test.js`
- Modify: `README.md`
- Modify: `package.json` if a combined test script is appropriate.

**Interfaces:**
- Construct one client per mounted simulator and dispose it in the existing cleanup function.
- Publish current browser vehicle state, deterministic sensor frame, selected route id, and current route obstacles on a one-second timer that is independent of physics stepping.
- Send mode changes and discrete manual control press/release or stop/reset state as individual backend events; never await them from UI handlers or the tick.
- Render client state only in backend connection status UI. Never replace local physics/dashboard values with backend responses.

- [ ] **Step 1: Add failing simulator integration tests**

Test that backend status markup is accessible, integration construction is disabled with an empty API URL, and local simulator controls/status remain available. Add a testable helper or dependency seam rather than importing browser globals into Node tests.

- [ ] **Step 2: Run the focused simulator tests**

Run: `node --test src/simulator.test.js src/services/backendClient.test.js`

Expected: the backend status/integration assertions fail before wiring.

- [ ] **Step 3: Wire optional sync without blocking local behavior**

Pass `import.meta.env?.VITE_API_BASE_URL ?? ""` to the client factory. Start a 1000-ms publication timer only for an enabled client; compute state using existing vehicle/sensor helpers. Catch/report failures inside the client. Keep local `stop`, `reset`, manual control, autonomy, and render loop synchronous and functional. Clear the interval and dispose the client when simulator cleanup runs.

- [ ] **Step 4: Verify disabled mode and static build**

Run: `npm test` and `npm run build`.

Expected: existing simulation behavior tests pass, disabled client makes no requests, and Vite builds with the unchanged relative base.

- [ ] **Step 5: Document commands and contracts**

Update README with:

```powershell
npm install
npm run server
npm run dev
npm run test:server
```

Document default local API URL `http://127.0.0.1:3001`, setting `VITE_API_BASE_URL=http://127.0.0.1:3001` in a local `.env.local`, allowed local Vite CORS origins, API endpoint table, in-memory reset-on-restart behavior, simulation-only sensor provenance, and that GitHub Pages does not host the backend. Do not commit environment files or credentials.

- [ ] **Step 6: Run backend, frontend, and production checks**

Run `npm run test:server`, `npm test`, and `npm run build`. Start backend and Vite using the configured API URL; exercise health, manual/autonomous mode changes, control events, telemetry, sensors, and obstacle routes in the browser. Stop backend and verify local simulation keeps running and shows unavailable status. Inspect browser console and requests to confirm no per-frame traffic or uncaught errors.

## Acceptance Criteria

- All documented API endpoints accept valid input and reject invalid input without mutating state.
- CORS is allowlisted, backend binds to loopback by default, oversized requests are rejected, and errors use structured JSON.
- Sensor frames are rejected unless explicitly marked simulated.
- Emergency-stop state is mirrored only; local stop remains immediate and authoritative.
- With no API URL, frontend sends no network requests and remains functional.
- With the backend enabled, mode/control events and at-most-1-Hz snapshots synchronize without delaying rendering or local controls.
- `npm run test:server`, `npm test`, and `npm run build` pass; browser testing reports no console errors.
