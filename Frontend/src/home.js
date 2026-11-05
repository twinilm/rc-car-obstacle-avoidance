export function renderHome() {
  return `
    <div class="site-shell home-shell">
      <header class="site-header">
        <a class="brand" href="#home" aria-label="RC Lab home">
          <span class="brand-mark" aria-hidden="true">RC</span>
          <span class="brand-copy">
            <strong>RC / LAB</strong>
            <small>Autonomous Systems &amp; Robotics</small>
          </span>
        </a>
        <nav class="site-nav" aria-label="Main navigation">
          <a class="nav-link is-active" href="#home">Overview</a>
          <a class="nav-link" href="#simulator">3D Simulator</a>
        </nav>
        <a class="button button-primary header-action" href="#simulator">Launch 3D Simulator <span aria-hidden="true">↗</span></a>
      </header>

      <main>
        <section class="home-hero" aria-labelledby="home-title">
          <div class="hero-copy">
            <p class="eyebrow"><span class="status-pulse"></span> AUTONOMOUS RC SIMULATOR · ENGINEERING PROTOTYPE</p>
            <h1 id="home-title">Virtual Proving Ground.<br><span>Autonomous RC Platform.</span></h1>
            <p class="hero-description">
              An interactive 3D simulation environment built for testing autonomous navigation,
              waypoint pathfinding, and obstacle avoidance algorithms on a simulated 1:10 scale RC vehicle.
              Developed with Three.js and real-time vehicle kinematics.
            </p>
            <div class="hero-actions">
              <a class="button button-primary" href="#simulator">Open Simulator Console <span aria-hidden="true">→</span></a>
              <a class="button button-outline" href="#technical-specs">Technical Specifications <span aria-hidden="true">↓</span></a>
            </div>
            <p class="prototype-note">
              <span aria-hidden="true">ℹ</span> Engineering prototype: Simulation runs deterministically in-browser. All telemetry reflects simulated physics.
            </p>
          </div>

          <div class="hero-scene" role="img" aria-label="Technical diagram of the autonomous RC test platform">
            <div class="scene-topline">
              <span>PLATFORM · RC-TEST-01</span>
              <span><i></i> ENGINE ONLINE</span>
            </div>
            <div class="scene-grid"></div>
            <div class="scene-track">
              <span class="track-edge track-edge-left"></span>
              <span class="track-edge track-edge-right"></span>
              <span class="track-centerline"></span>
              <span class="scene-car">
                <span class="scene-car-window"></span>
                <span class="scene-wheel scene-wheel-front"></span>
                <span class="scene-wheel scene-wheel-back"></span>
              </span>
              <span class="scene-marker marker-one">01</span>
              <span class="scene-marker marker-two">02</span>
            </div>
            <div class="scene-readout">
              <span>SURFACE <strong>PROCEDURAL ASPHALT</strong></span>
              <span>AUTOPILOT <strong>MAP WAYPOINTS</strong></span>
            </div>
            <span class="scene-index">5 TRACKS <span>/</span> READY</span>
          </div>
        </section>

        <!-- Technical Specifications Strip -->
        <section class="project-strip" id="technical-specs" aria-labelledby="specs-heading">
          <div class="strip-heading">
            <span class="section-index">01 / ARCHITECTURE &amp; SUBSYSTEMS</span>
            <h2 id="specs-heading">Designed for rigorous<br>simulation testing.</h2>
          </div>
          <p class="strip-description">
            The platform models vehicle dynamics, road edge boundaries, obstacle collision boxes,
            and deterministic autopilot steering without heavy external game engine dependencies.
          </p>

          <div class="specs-grid">
            <div class="spec-card">
              <span class="spec-num">01</span>
              <h3>5 Distinct Test Tracks</h3>
              <p>City Road (intersections &amp; buildings), Highway Corridor, Curved Circuit, Slalom Obstacle Course, and Uneven Road.</p>
            </div>
            <div class="spec-card">
              <span class="spec-num">02</span>
              <h3>Map-Based Autopilot</h3>
              <p>Continuous waypoint path-following with predictive lateral detour calculation around simulated obstacles.</p>
            </div>
            <div class="spec-card">
              <span class="spec-num">03</span>
              <h3>1:10 Kinematic Model</h3>
              <p>Simulated steering articulation, wheel roll physics, acceleration curves, coasting decay, and braking lockup.</p>
            </div>
            <div class="spec-card">
              <span class="spec-num">04</span>
              <h3>Live Telemetry &amp; HUD</h3>
              <p>Real-time speed (MPH), steering angle, simulated ToF rangefinder proximity, odometry, and performance metrics.</p>
            </div>
          </div>
        </section>

        <!-- Environment Directory -->
        <section class="environments-section" aria-labelledby="env-heading">
          <div class="section-header-centered">
            <span class="section-index">02 / PROVING GROUND ENVIRONMENTS</span>
            <h2 id="env-heading">Selectable Test Scenarios</h2>
            <p>Each environment tests distinct vehicle dynamics and autonomous controller behaviors.</p>
          </div>

          <div class="env-cards-grid">
            <div class="env-preview-card">
              <div class="env-card-header">
                <strong>01 / City Road</strong>
                <span class="env-tag">URBAN</span>
              </div>
              <p>Marked lanes, 4-way street intersection, stop lines, roadside building structures, and traffic cone hazards.</p>
              <div class="env-meta"><span>Width: 10 m</span><span>Surface: Asphalt</span></div>
            </div>

            <div class="env-preview-card">
              <div class="env-card-header">
                <strong>02 / Highway</strong>
                <span class="env-tag">HIGH SPEED</span>
              </div>
              <p>High-speed sweeping curves, continuous double-steel guard rails, dashed highway dividers, and construction obstacles.</p>
              <div class="env-meta"><span>Width: 14 m</span><span>Surface: Asphalt</span></div>
            </div>

            <div class="env-preview-card">
              <div class="env-card-header">
                <strong>03 / Curved Track</strong>
                <span class="env-tag">TECHNICAL</span>
              </div>
              <p>Tight apex racing kerbs (red/white curbs), corner tire wall barriers, and alternating S-bend chicanes.</p>
              <div class="env-meta"><span>Width: 9 m</span><span>Surface: Asphalt</span></div>
            </div>

            <div class="env-preview-card">
              <div class="env-card-header">
                <strong>04 / Obstacle Course</strong>
                <span class="env-tag">AVOIDANCE</span>
              </div>
              <p>Slalom test course with cones, jersey concrete barriers with hazard stripes, and industrial drums requiring detours.</p>
              <div class="env-meta"><span>Width: 10 m</span><span>Surface: Proving Ground</span></div>
            </div>

            <div class="env-preview-card">
              <div class="env-card-header">
                <strong>05 / Uneven Road</strong>
                <span class="env-tag">SURFACE TEST</span>
              </div>
              <p>Variable surface proving grounds with rumble strip patches, cobblestone test zones, and boundary pylons.</p>
              <div class="env-meta"><span>Width: 10 m</span><span>Surface: Uneven</span></div>
            </div>
          </div>

          <div class="env-cta">
            <a class="button button-primary" href="#simulator">Launch Simulator &amp; Select Track <span aria-hidden="true">→</span></a>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <div class="footer-left">
          <a class="brand footer-brand" href="#home">
            <span class="brand-mark" aria-hidden="true">RC</span>
            <span class="brand-copy"><strong>RC / LAB</strong><small>Autonomous Systems Research</small></span>
          </a>
          <p>Autonomous RC Car 3D Simulation Platform · Engineered for academic and technical demonstration.</p>
        </div>
        <div class="footer-right">
          <span class="footer-status"><i></i> SIMULATION ENGINE READY</span>
          <a class="footer-link" href="#simulator">Open Simulator ↗</a>
        </div>
      </footer>
    </div>
  `
}
