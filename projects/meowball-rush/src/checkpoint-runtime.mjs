// Checkpoint coordinates describe the supporting floor, not the ball centre.
export function resetBallToCheckpoint(ball, checkpoint) {
  Object.assign(ball, {
    x: checkpoint.x, y: checkpoint.y + ball.r + .06, z: checkpoint.z,
    vx: 0, vy: 0, vz: 0, grounded: false,
    supportRoute: null, supportPlatform: null,
    chuteRide: null, chuteTangent: null, routeTangent: null,
    launchAssist: null, launchLanding: 0, fallRecovery: null,
    popTimer: 0, dizzyTimer: 0, boostFlash: 0, burstTimer: 0,
    hammerHitCd: 0, rollingPinHitCd: 0, bumperHitCd: 0,
    chuteCooldown: .35, rollSlopeX: 0, rollSlopeZ: 0, landingImpact: 0,
  });
  ball.propCooldowns?.clear();
  ball.previousBottom = ball.y - ball.r;
  return ball;
}
