import { ARENA_LIMIT, RETURN_RADIUS, readyToUpload } from "./lunar-rules.mjs";
import { SURVEY_SITES } from "./lunar-survey.mjs";
import { EARTH_SITE } from "./lunar-earth-observatory.mjs";

const RADAR_INSET = 12;

export function createRadarRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function signal(x, z, size, color, outline = false) {
    const scale = (canvas.width * 0.5 - RADAR_INSET) / ARENA_LIMIT;
    ctx.beginPath();
    ctx.arc(canvas.width * 0.5 + x * scale, canvas.height * 0.5 + z * scale, size, 0, Math.PI * 2);
    if (outline) {
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function draw({ state, crystals, hazard, navigationGoal, motionTime, arcadeTarget }) {
    const side = canvas.width, middle = side * 0.5;
    const scale = (middle - RADAR_INSET) / ARENA_LIMIT;
    ctx.clearRect(0, 0, side, side);
    ctx.strokeStyle = "#94b5c437";
    ctx.lineWidth = 1;
    ctx.strokeRect(RADAR_INSET, RADAR_INSET, side - 2 * RADAR_INSET, side - 2 * RADAR_INSET);
    signal(0, 0, 33, "#94b5c425", true);
    ctx.fillStyle = "#a5aab0";
    ctx.textAlign = "center";
    ctx.font = "8px monospace";
    ctx.fillText("N", middle, 9);

    if (arcadeTarget) {
      ctx.lineWidth = 1.6;
      signal(arcadeTarget.x, arcadeTarget.z, 5.2 + Math.sin(motionTime * 8) * 1.4, "#74ffd8", true);
      signal(arcadeTarget.x, arcadeTarget.z, 2.8, "#ffd28a");
    } else {
      const returning = state.returnEligible || readyToUpload(state);
      if (returning) signal(0, 0, RETURN_RADIUS * scale + Math.sin(motionTime * 5) * 1.6, "#ffd597", true);
      signal(0, 0, 3.2, "#ffd597");
      ctx.save();
      ctx.translate(middle + EARTH_SITE.x * scale, middle + EARTH_SITE.z * scale);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "#c8acff";
      ctx.strokeRect(-2.5, -2.5, 5, 5);
      ctx.restore();
      for (const [index, { x, z }] of crystals.entries()) {
        if (!(state.mask & (1 << index))) signal(x, z, 3.15, "#6dfbe2");
      }
      for (const [index, { x, z }] of SURVEY_SITES.entries()) {
        if (!(state.surveyMask & (1 << index))) {
          ctx.lineWidth = 1.1;
          signal(x, z, 3.7, "#dbca95", true);
        }
      }
      if (navigationGoal) {
        ctx.lineWidth = 1.35;
        signal(navigationGoal.x, navigationGoal.z, 4.6, "#ffd2a0", true);
      }
    }

    signal(hazard.x, hazard.z, 3.4, hazard.mode === "relay" ? "#b6cea5" : hazard.scanning ? "#ff765b" : "#af8979");
    ctx.save();
    ctx.translate(middle + state.x * scale, middle + state.z * scale);
    ctx.rotate(-state.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.2, 4.5);
    ctx.lineTo(0, 2.7);
    ctx.lineTo(-4.2, 4.5);
    ctx.closePath();
    ctx.fillStyle = "#f4f9ff";
    ctx.fill();
    ctx.restore();
  }

  return { draw };
}
