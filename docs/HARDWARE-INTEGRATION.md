# Future Hardware Integration

This document describes proposed physical-hardware interfaces only. The browser simulator includes map-based autonomous driving and deterministic virtual sensor estimates derived from the selected track’s known obstacle geometry. Its forward ultrasonic-style range, left/right distances, and camera-like object list do not connect to a physical sensor or webcam and do not process images. An optional local Express API can validate and hold the latest simulated vehicle, sensor, and obstacle snapshots in volatile memory; it is not a hardware gateway. All simulator telemetry remains simulated output, not real sensor data or evidence of real-world perception.

## Implemented local simulation API

The optional `server/` process exposes REST endpoints for health, vehicle state/mode/control, telemetry, simulated sensor frames, and route obstacles. It listens on loopback by default and has no authentication or persistent storage. The frontend remains authoritative for vehicle motion and autonomous route decisions, and works normally with the backend disabled. The API does not connect to hardware, actuate commands, or provide a safety-rated emergency stop. See the project README for local startup and configuration instructions.

## Proposed message contracts

The following language-neutral shapes are starting points for a later transport adapter. They are not implemented or validated against hardware.

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
  pose:
    xMeters: number
    zMeters: number
    headingRadians: number
  status: "ready" | "moving" | "paused" | "fault"

SensorFrame:
  timestamp: ISO-8601 string
  camera: { frameReference: string } | null
  distance:
    - sensorId: string
      meters: number
      status: string
```

`frameReference` should be an authorized reference to a frame, not an assumption that image bytes can safely or efficiently be placed in a telemetry message. Sensor status should distinguish unavailable, stale, and invalid measurements from a valid zero-distance reading. Actual units, limits, and status values must be confirmed against chosen hardware before implementation.

## Proposed physical-hardware communication boundary

```text
Browser simulator UI
        |
        v
Browser transport adapter
        |
        v
Separately deployed backend gateway
        |
        v
Hardware-specific driver and safety layer
```

This diagram is for a future physical-hardware integration; the current local simulation API is not part of this command path. GitHub Pages serves static files and cannot host the gateway or provide a secure hardware control channel. A later deployment would need a separately hosted service and an explicitly selected transport and authentication design. The browser UI should consume a typed adapter interface rather than import hardware-specific drivers.

The gateway and hardware safety layer—not UI validation—must enforce command ranges, authorization, command expiry, vehicle-specific speed and steering limits, and a safe stop on communication loss or invalid commands. Do not send commands directly from a public static page to a vehicle or expose device credentials in frontend code.

## Proposed integration sequence

1. Select the controller, motors, steering actuator, camera, and distance sensors; record their verified limits and units.
2. Implement and test a gateway-side hardware adapter with input validation, authentication, command timeouts, fault reporting, and a hardware-appropriate stop behavior.
3. Implement a browser transport adapter for commands and telemetry. Keep simulated and physical data sources visibly distinct.
4. Add sensor frames only after defining ownership, authorization, retention, and transport requirements.
5. Test against a disconnected/mock adapter first, then perform supervised hardware validation with an operator-controlled emergency stop.

These proposed integration steps are not implemented in the browser simulator.
