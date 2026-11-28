import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { CAMERA_MODES, cameraRelativeInput, createDirector, triggerSetpiece, updateDirector } from '../src/director.mjs';

const radians = degrees => degrees * Math.PI / 180;
const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const renderedHeading = pose => Math.atan2(pose.x - pose.lookX, pose.z - pose.lookZ);
const trackFixture = orbit => ({ worldType: 'grounded_nature', cameraZones: orbit
  ? [{ type: 'orbit', x: 0, y: 4, z: 0, r: 1000, minY: -10, maxY: 100 }] : [] });
function pointBall(heading = 0) {
  return { x: 0, y: 4.62, z: 0, vx: -Math.sin(heading) * 5, vy: 0,
    vz: -Math.cos(heading) * 5, r: 0.62, grounded: true,
    routeTangent: { x: -Math.sin(heading), z: -Math.cos(heading) } };
}
function aimBall(ball, heading) {
  ball.vx = -Math.sin(heading) * 5; ball.vz = -Math.cos(heading) * 5;
  ball.routeTangent = { x: -Math.sin(heading), z: -Math.cos(heading) };
}

// Uses the real director and its returned camera/lookAt pose. A yaw-only test
// misses the second angular lag formerly introduced by world-space pose lerps.
export function verifyCameraStability() {
  const rates = [120, 60, 25], failures = [];
  let scenarios = 0, maxControlHeadingError = 0, maxLateralYawDrift = 0;
  const caseAt = (hz, name, run) => {
    scenarios++;
    try { run(); } catch (error) { failures.push(`${hz}Hz ${name}: ${error.message}`); }
  };
  for (const hz of rates) {
    const dt = 1 / hz;
    const rig = (yaw = 0, heading = yaw, orbit = false) => {
      const d = createDirector(yaw), ball = pointBall(heading), track = trackFixture(orbit);
      let pose, elapsed = 0;
      const tick = (options = {}) => {
        ball.x += ball.vx * dt; ball.z += ball.vz * dt; elapsed += dt;
        pose = updateDirector(d, { ball, track, dt, elapsed, forwardInput: 0, ...options });
        for (const key of ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ', 'fov'])
          assert(Number.isFinite(pose[key]), `non-finite rendered ${key}`);
        const viewYaw = renderedHeading(pose), error = Math.abs(difference(viewYaw, d.yaw));
        maxControlHeadingError = Math.max(maxControlHeadingError, error);
        assert(error < 1e-9, `control yaw differs from actual rendered heading by ${(error * 180 / Math.PI).toFixed(3)} degrees`);
        const up = cameraRelativeInput(0, -1, viewYaw), right = cameraRelativeInput(1, 0, viewYaw);
        const length = Math.hypot(pose.lookX - pose.x, pose.lookZ - pose.z);
        assert(Math.abs(up.x - (pose.lookX - pose.x) / length) < 1e-10, 'up steering X misses camera forward');
        assert(Math.abs(up.z - (pose.lookZ - pose.z) / length) < 1e-10, 'up steering Z misses camera forward');
        assert(Math.abs(up.x * right.x + up.z * right.z) < 1e-10, 'control axes lost orthogonality');
        return pose;
      };
      const run = (seconds, options = {}) => {
        for (let i = 0; i < Math.ceil(seconds * hz - 1e-9); i++) tick(typeof options === 'function' ? options(i) : options);
        return pose;
      };
      return { d, ball, track, tick, run, get pose() { return pose; } };
    };
    caseAt(hz, 'generous deadzone including angle wrap', () => {
      for (const [yaw, heading] of [[0, 20], [0, -20], [179, -165]]) {
        const r = rig(radians(yaw), radians(heading));
        r.run(4, { forwardInput: 1 });
        assert(Math.abs(difference(r.d.yaw, radians(yaw))) < 1e-10, 'small route turns rotate the camera');
      }
    });
    caseAt(hz, 'active keyboard gyro and stick lateral steering freezes automatic yaw', () => {
      for (const lateralInput of [-1, 1, -0.35, 0.12]) {
        const r = rig(0, radians(70));
        r.run(3, { forwardInput: 1, lateralInput });
        const drift = Math.abs(difference(r.d.yaw, 0));
        maxLateralYawDrift = Math.max(maxLateralYawDrift, drift);
        assert(drift < 1e-10, 'automatic camera fights active lateral input');
      }
      const r = rig(0, radians(70));
      r.run(0.9, { forwardInput: 1 });
      const yaw = r.d.yaw;
      r.run(2, { forwardInput: 1, lateralInput: -1 });
      const drift = Math.abs(difference(r.d.yaw, yaw));
      maxLateralYawDrift = Math.max(maxLateralYawDrift, drift);
      assert(drift < 1e-10, 'a pending follow turn continues after lateral steering begins');
      assert.equal(r.d.yaw, yaw, 'active lateral steering must freeze the stored heading exactly');
      r.run(0.3, { forwardInput: 1 });
      assert(Math.abs(difference(r.d.yaw, yaw)) < 1e-10, 'follow resumes before forward intent is sustained again');
    });
    caseAt(hz, 'only sustained forward turns receive very gentle alignment', () => {
      const r = rig(0, radians(65));
      r.run(0.3, { forwardInput: 1 });
      assert(Math.abs(r.d.yaw) < 1e-10, 'brief turn starts automatic yaw');
      r.run(2, { forwardInput: 1 });
      assert(r.d.yaw > radians(3), 'sustained forward turn never aligns');
      assert(r.d.yaw < radians(15), 'automatic follow turns too quickly');
      const yaw = r.d.yaw;
      r.run(3, { forwardInput: 0 }); r.run(2, { forwardInput: -1 });
      assert(Math.abs(difference(r.d.yaw, yaw)) < 1e-10, 'coasting or reverse input starts automatic yaw');
    });
    caseAt(hz, 'held forward input cannot align during rollback or a lateral slide', () => {
      for (const velocityAngle of [radians(135), radians(-135), radians(-45)]) {
        const r = rig(0, radians(45));
        r.ball.vx = -Math.sin(velocityAngle) * 5;
        r.ball.vz = -Math.cos(velocityAngle) * 5;
        r.run(3, { forwardInput: 1 });
        assert.equal(r.d.yaw, 0, 'held W starts camera alignment while actual motion is sideways or backward');
      }
    });
    caseAt(hz, 'manual Q E and drag rotate directly and hold after release', () => {
      const r = rig();
      r.tick({ manualDelta: 0.45 });
      assert(Math.abs(difference(r.d.yaw, 0.45)) < 1e-10, 'drag input was attenuated by automatic follow');
      r.run(0.4, { manualDelta: 1.5 * dt, orbitHeld: true });
      assert(Math.abs(difference(r.d.yaw, 1.05)) < 1e-10, 'E orbit does not apply the requested angle');
      r.run(0.4, { manualDelta: -1.5 * dt, orbitHeld: true });
      assert(Math.abs(difference(r.d.yaw, 0.45)) < 1e-10, 'Q orbit does not undo the requested angle');
      r.run(3);
      assert(Math.abs(difference(r.d.yaw, 0.45)) < 1e-10, 'manual yaw recenters without forward intent');
    });
    caseAt(hz, 'manual orbit has zero automatic drift through motion pitch zoom and entry', () => {
      const r = rig(0, radians(70));
      r.run(1, { forwardInput: 1 });
      r.track.cameraZones = trackFixture(true).cameraZones;
      const yaw = renderedHeading(r.pose);
      r.run(3, i => ({ forwardInput: 1, pitchDelta: i < hz ? 0.005 : 0, zoomDelta: i < hz ? 0.002 : 0 }));
      assert.equal(r.d.mode, CAMERA_MODES.MANUAL_ORBIT);
      assert(Math.abs(difference(renderedHeading(r.pose), yaw)) < 1e-10, 'rendered orbit keeps drifting after entering precision zone');
      r.tick({ manualDelta: -0.7 });
      const manualYaw = r.d.yaw;
      aimBall(r.ball, -2); r.run(5, { forwardInput: 1, lateralInput: 1 });
      assert(Math.abs(difference(renderedHeading(r.pose), manualYaw)) < 1e-10, 'manual orbit follows changing route heading');
      assert.equal(r.d.yaw, manualYaw, 'manual orbit must freeze the stored heading exactly');
    });
    caseAt(hz, 'setpiece locks yaw and restores stable manual orbit', () => {
      const r = rig(0.6, -1.2, true); r.tick(); triggerSetpiece(r.d, 1.2);
      r.run(0.8, { manualDelta: 0.2, forwardInput: 1 });
      assert.equal(r.d.mode, CAMERA_MODES.LOCKED_SETPIECE);
      assert(Math.abs(difference(r.d.yaw, 0.6)) < 1e-10, 'setpiece accepts unlocked orbit or route heading');
      r.run(1, { forwardInput: 1 });
      assert.equal(r.d.mode, CAMERA_MODES.MANUAL_ORBIT);
      assert(Math.abs(difference(renderedHeading(r.pose), 0.6)) < 1e-10, 'setpiece release changes manual heading');
    });
    caseAt(hz, 'chute exit settles captured heading in 0.35s and stays steady', () => {
      const r = rig(0, 0);
      r.ball.chuteRide = { distance: 1 };
      r.run(1, i => {
        const yaw = (i + 1) * dt * 1.3;
        r.ball.chuteTangent = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        return { manualDelta: 0.05, lateralInput: 1 };
      });
      assert.equal(r.d.mode, CAMERA_MODES.LOCKED_CHUTE);
      assert(r.d.yaw > 0.8 && r.d.yaw < 1.31, 'chute does not cinematically follow its tangent');
      r.ball.chuteRide = null;
      aimBall(r.ball, -1.1); // The receiving route must not overwrite captured exit yaw.
      r.run(0.36);
      assert(Math.abs(difference(r.d.yaw, 1.3)) < 1e-8, 'exit heading did not finish settling at about 0.35s');
      assert.equal(r.d.mode, CAMERA_MODES.DEFAULT_FOLLOW);
      r.run(4);
      assert(Math.abs(difference(renderedHeading(r.pose), 1.3)) < 1e-8, 'camera keeps recentering after the chute exit');
    });
    caseAt(hz, 'chute release into manual zone has no remaining yaw lag', () => {
      const r = rig(0, 0, true); r.ball.chuteRide = {};
      r.ball.chuteTangent = { x: -1, z: 0 }; r.run(0.2);
      r.ball.chuteRide = null; r.run(0.4);
      assert.equal(r.d.mode, CAMERA_MODES.MANUAL_ORBIT);
      const yaw = renderedHeading(r.pose); aimBall(r.ball, -1); r.run(3, { forwardInput: 1 });
      assert(Math.abs(difference(renderedHeading(r.pose), yaw)) < 1e-10, 'manual mode inherits pending cinematic angular smoothing');
    });
    caseAt(hz, 'manual or lateral input immediately takes control during chute exit settle', () => {
      for (const options of [{ manualDelta: -0.3 }, { lateralInput: 1, forwardInput: 1 }]) {
        const r = rig(); r.ball.chuteRide = {}; r.ball.chuteTangent = { x: -1, z: 0 };
        r.run(0.1); const yaw = renderedHeading(r.pose);
        r.ball.chuteRide = null; r.tick(options);
        assert.equal(r.d.mode, CAMERA_MODES.DEFAULT_FOLLOW, 'exit settle does not yield to active player control');
        const wanted = yaw + (options.manualDelta || 0);
        assert(Math.abs(difference(renderedHeading(r.pose), wanted)) < 1e-10, 'exit settle fights newly resumed control');
        r.run(1, { lateralInput: 1, forwardInput: 1 });
        assert(Math.abs(difference(renderedHeading(r.pose), wanted)) < 1e-10, 'cancelled exit settle resumes automatically');
      }
    });
    caseAt(hz, 'follow takes the short path across the pi boundary', () => {
      const r = rig(radians(170), radians(-140));
      r.run(2, { forwardInput: 1 });
      const turn = difference(r.d.yaw, radians(170));
      assert(turn > radians(2) && turn < radians(13), 'wrapped heading takes the long route or snaps');
    });
    caseAt(hz, 'manual orbit and chute release cross the pi boundary without a long spin', () => {
      const manual = rig(radians(179), radians(179), true);
      manual.tick({ manualDelta: radians(4) });
      assert(Math.abs(difference(renderedHeading(manual.pose), radians(-177))) < 1e-10, 'manual drag wraps incorrectly');
      const chute = rig(radians(170), radians(170));
      chute.ball.chuteRide = {};
      chute.ball.chuteTangent = { x: -Math.sin(radians(-170)), z: -Math.cos(radians(-170)) };
      chute.tick(); const start = chute.d.yaw;
      chute.ball.chuteRide = null;
      for (let i = 0; i < Math.ceil(0.4 * hz); i++) {
        chute.tick();
        const turn = difference(chute.d.yaw, start);
        assert(turn > -1e-10 && turn < radians(20), 'chute exit interpolates through the long angle');
      }
      assert(Math.abs(difference(renderedHeading(chute.pose), radians(-170))) < 1e-10, 'chute exit misses wrapped heading');
    });
  }
  assert.equal(failures.length, 0, `Camera stability regressions:\n${failures.join('\n')}`);
  return { rates, scenarios, maxControlHeadingError, maxLateralYawDrift, exitSettleSeconds: 0.35 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(verifyCameraStability(), null, 2));
