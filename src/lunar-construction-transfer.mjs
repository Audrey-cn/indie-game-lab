import * as THREE from "three";
import { createConstructionCrate } from "./lunar-construction-crate.mjs";

const { clamp, smootherstep, lerp } = THREE.MathUtils;
const UP = new THREE.Vector3(0, 1, 0);
const BAY_LOAD = new THREE.Vector3(0, 0, -0.18);
const BAY_OUT = new THREE.Vector3(0, 0, 0.255);
const BAY_SIDE_CLEARANCE = 1.26;
const flightProgress = (t, start, end) => clamp((t - start) / (end - start), 0, 1);

export function createConstructionTransfer(scene, height, { kitBay, kitHatch }, { kitRack, poseKitArm, getKitGrip }) {
  const installed = [];
  const source = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const bayExit = new THREE.Vector3();
  const bayFlank = new THREE.Vector3();
  const sourceRotation = new THREE.Quaternion();
  const destinationRotation = new THREE.Quaternion();
  const armTarget = new THREE.Vector3();
  const measuredGrip = new THREE.Vector3();
  const measuredHandle = new THREE.Vector3();
  let work = null;
  let caseKit = null;

  function begin(stage, pad) {
    const fabrication = stage.startsWith("fabricate");
    if (!fabrication && (!pad || !caseKit)) return;
    if (fabrication) {
      caseKit = createConstructionCrate();
      scene.add(caseKit.group);
    } else {
      scene.attach(caseKit.group);
    }
    work = { stage, pad, fabrication, facilityProgress: 0, phase: "", contact: false };
  }

  function sampleFlight(position, takeoff, landing, t, clearance, aroundBay) {
    if (t < 0.22) {
      position.copy(takeoff);
      position.y = lerp(takeoff.y, clearance, smootherstep(t, 0, 0.22));
    } else if (t < 0.76) {
      const travel = smootherstep(t, 0.22, 0.76);
      if (aroundBay) {
        const remaining = 1 - travel;
        position.copy(takeoff).multiplyScalar(remaining ** 3)
          .addScaledVector(bayExit, 3 * remaining ** 2 * travel)
          .addScaledVector(bayFlank, 3 * remaining * travel ** 2)
          .addScaledVector(landing, travel ** 3);
      } else position.copy(takeoff).lerp(landing, travel);
      position.y = clearance;
    } else {
      position.copy(landing);
      position.y = lerp(clearance, landing.y, smootherstep(t, 0.76, 1));
    }
  }

  function update(buildStage, progress) {
    if (!work) return false;
    const { fabrication, pad, stage } = work;
    const { group, setOpening, setTransfer, handle } = caseKit;
    const finished = stage !== buildStage;
    const t = finished ? 1 : progress;
    let advance;
    let clamp;
    let armAmount;
    let aroundBay = false;
    if (fabrication) {
      kitBay.getWorldQuaternion(sourceRotation);
      source.copy(BAY_LOAD).lerp(BAY_OUT, smootherstep(t, 0.095, 0.28));
      kitBay.localToWorld(source);
      kitHatch.rotation.x = -1.84 * smootherstep(t, 0, 0.095)
        * (1 - smootherstep(t, 0.55, 0.77));
      kitRack.getWorldPosition(destination);
      kitRack.getWorldQuaternion(destinationRotation);
      kitBay.worldToLocal(bayFlank.copy(destination));
      aroundBay = Math.abs(bayFlank.x) > 0.78 && bayFlank.z < 0.52;
      if (aroundBay) {
        // Clear the service rails and the habitat's front corner before turning to the rack.
        bayExit.set(0, 0, BAY_SIDE_CLEARANCE);
        bayFlank.z = BAY_SIDE_CLEARANCE;
        kitBay.localToWorld(bayExit);
        kitBay.localToWorld(bayFlank);
      }
      advance = flightProgress(t, 0.43, 0.82);
      clamp = smootherstep(t, 0.36, 0.43) * (1 - smootherstep(t, 0.82, 0.89));
      armAmount = smootherstep(t, 0.19, 0.36) * (1 - smootherstep(t, 0.89, 1));
      work.phase = t < 0.35 ? "工坊出箱" : t < 0.82 ? "机械臂装载" : "套件固定";
    } else {
      kitRack.getWorldPosition(source);
      kitRack.getWorldQuaternion(sourceRotation);
      const { x, z } = pad.site;
      destination.set(x, height(x, z) + (pad.structure.deploymentHeight ?? 0.01), z);
      destinationRotation.setFromAxisAngle(UP, pad.structure.deploymentYaw ?? 0);
      advance = flightProgress(t, 0.23, 0.57);
      clamp = smootherstep(t, 0.17, 0.23) * (1 - smootherstep(t, 0.57, 0.63));
      armAmount = smootherstep(t, 0, 0.17) * (1 - smootherstep(t, 0.63, 0.75));
      const open = smootherstep(t, 0.67, 0.86);
      work.facilityProgress = smootherstep(t, 0.73, 1);
      setOpening(open);
      work.phase = t < 0.23 ? "夹取套件" : t < 0.57 ? "机械臂落箱" : t < 0.69 ? "套件解锁" : "设施展开";
    }

    const deckHeight = kitRack.getWorldPosition(armTarget).y;
    const liftHeight = Math.max(deckHeight + 0.64, source.y + 0.37, destination.y + 0.37);
    sampleFlight(group.position, source, destination, advance, liftHeight, aroundBay);
    group.quaternion.copy(sourceRotation).slerp(destinationRotation, smootherstep(advance, 0.22, 0.76));
    setTransfer(clamp);
    if (armAmount > 0) {
      handle.getWorldPosition(armTarget);
      // The jaws approach from above and clear the handle before the boom retracts.
      armTarget.addScaledVector(UP, (1 - clamp) * 0.065);
      poseKitArm(armTarget, armAmount, clamp, group.quaternion);
    }
    work.contact = clamp > 0.999;
    if (finished) {
      if (fabrication) {
        kitRack.add(group);
        group.position.set(0, 0, 0);
        group.quaternion.identity();
      } else {
        installed.push(group);
        caseKit = null;
      }
      work = null;
    }
    return armAmount > 0;
  }

  function facilityProgress(pad) {
    return work?.pad === pad ? work.facilityProgress : undefined;
  }

  function reset() {
    for (const group of installed) group.removeFromParent();
    installed.length = 0;
    caseKit?.group.removeFromParent();
    caseKit = work = null;
    kitHatch.rotation.x = 0;
  }

  function inspect() {
    if (!caseKit) return { phase: null, installed: installed.length };
    return {
      phase: work?.phase ?? "车载",
      installed: installed.length,
      anchored: caseKit.group.parent === kitRack,
      position: caseKit.group.getWorldPosition(measuredHandle).toArray(),
      facilityProgress: work?.facilityProgress ?? 0,
      gripGap: work?.contact ? caseKit.handle.getWorldPosition(measuredHandle).distanceTo(getKitGrip(measuredGrip)) : null,
    };
  }

  return {
    begin, update, facilityProgress, reset, inspect,
    get active() { return Boolean(work); },
    get stage() { return work?.stage; },
    get phase() { return work?.phase; },
    aim(out) {
      caseKit.group.getWorldPosition(out);
      out.y += 0.24 + (work?.facilityProgress ?? 0) * 0.48;
    },
  };
}
