# Meowball Rush v3.0.0 implementation

The user has approved the ten multi-view blueprints in `docs/concept-art/v3-blueprints/` and supplied the four-mode camera specification. Those are the design authority. Preserve the existing cats, save compatibility, audio, poster sharing, and esbuild single-file delivery. Do not push.

1. Author ten independent continuous 3D centerline courses, explicit chutes, launches, precision camera zones and world sections. Measure physical centerline length. Resolve the incompatible endpoint/growth ranges with the user; default to the explicit minimum 20% growth.
2. Share polyline sampling and route-floor projection between drawing, rail physics and verification. Chute points represent the floor; the ball center adds its radius. Preserve gravity 26 and normal movement feel.
3. Build blueprint-specific environments, props, half-pipe chutes, landmarks and finish gates. Grounded terrain and indoor floors must surround the route; reserve floating islands for the sky stages.
4. Implement pure, testable Camera Director and chute/prop runtime modules, then integrate them into the existing game loop. Priority: chute, setpiece, authored orbit, follow. Every movement device uses the current camera yaw. Left touch controls movement; right touch controls orbit.
5. Verify real collision functions, complete route connectivity, launch trajectories, entry/exit continuity, camera transitions, finite geometry and all scene registrations. Independently inspect a browser render if available. Run `npm run build && npm run verify:physics && npm run verify:scenes` and report the actual results.

Review focus: overlapping routes at different heights; full-circle chute entry retriggers; receiving deck tangents; launch input cancelling the authored trajectory; multitouch cancellation; manual orbit staying put; old fixed-yaw assumptions; indoor furniture clipping the camera. Parallel ownership: course data/math, scene builder/worlds, verification scripts, root runtime/director/input/integration.
