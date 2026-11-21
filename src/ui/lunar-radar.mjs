import { ARENA_LIMIT, RETURN_RADIUS, readyToUpload } from "../simulation/lunar-rules.mjs";
import { SURVEY_SITES } from "../world/lunar-survey.mjs";
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

  function draw({ state, crystals, hazard, navigationGoal, motionTime, arcadeTarget, extractionNodes, extractionCrates, extractionGates, extractionUnbanked, extractionStormRadius }) {
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

    if (extractionNodes) {
      if (extractionStormRadius > 0) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.4;
        signal(0, 0, Math.min(middle - 3, extractionStormRadius * scale), "#d88affcc", true);
        ctx.restore();
      }
      if (extractionUnbanked > 0) {
        ctx.lineWidth = 1.6;
        signal(0, 0, RETURN_RADIUS * scale + 2.2 + Math.sin(motionTime * 6) * 1.6, "#74ffd8", true);
      }
      signal(0, 0, 3.2, "#ffd597");
      for (const node of extractionNodes) {
        if (node.harvested) continue;
        signal(node.x, node.z, node.tier === 3 ? 3.8 : 3.0, node.css);
        if (node.jackpot) {
          ctx.lineWidth = 1.3;
          signal(node.x, node.z, 5.4 + Math.sin(motionTime * 7) * 1.1, "#ffd275", true);
        }
      }
      if (extractionGates) {
        ctx.lineWidth = 1.1;
        for (const gate of extractionGates) {
          if (gate.group.visible) signal(gate.x, gate.z, 3.3, "#74ffd8", true);
        }
      }
      if (extractionCrates) {
        for (const crate of extractionCrates) {
          if (crate.opened) continue;
          ctx.save();
          ctx.translate(middle + crate.x * scale, middle + crate.z * scale);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = "#ffd275";
          ctx.fillRect(-3.0, -3.0, 6.0, 6.0);
          ctx.restore();
        }
      }
    } else if (arcadeTarget) {
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
