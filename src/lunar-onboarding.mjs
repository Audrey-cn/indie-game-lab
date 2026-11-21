const PREFERENCE = "selene-field-guide";

const constructionGuides = {
  fabricate: [
    ["制造中继套件", "Build a relay kit"],
    ["带两份晶样和勘测记录到工坊。停车后按 R，机械臂会把套件装上车。", "Bring two samples and your survey log to the workshop. Stop and press R to load a kit."],
    ["带晶样和勘测记录到工坊。停稳后点制造，机械臂会把套件装上车。", "Bring your samples and survey log to the workshop. Stop and tap Fabricate."],
  ],
  deploy: [
    ["把通信接入远坡", "Set up the relay"],
    ["沿雷达上的琥珀圈到施工点。停车后按 R 预览，确认净空后再按 R 安装。", "Follow the amber marker. Stop and press R to preview, then press R again to install."],
    ["沿雷达上的琥珀圈到施工点。停稳后点预览地基，再点安装。", "Follow the amber marker. Stop, tap Preview site, then tap Install."],
  ],
  resupply: [
    ["观测站补给", "Gather survey station supplies"],
    ["凑齐三份晶样和两份勘测记录，即可制造地形观测站。", "Collect three samples and two field readings to build the survey station."],
  ],
  fabricateObservatory: [
    ["制造观测站套件", "Build a survey station kit"],
    ["回到同一座工坊。用新增的晶样与勘测记录组装观测设备。", "Return to the workshop with the new sample and reading to assemble the survey kit."],
  ],
  deployObservatory: [
    ["安装观测仪器", "Install the survey station"],
    ["带着套件到另一侧施工点。停车后按 R 预览地基，再按 R 安装。", "Take the kit to the next site. Stop and press R to preview, then press R again to install."],
    ["带着套件到另一侧施工点。停稳后点预览地基，再点安装。", "Take the kit to the next site. Stop, tap Preview site, then tap Install."],
  ],
  calibrateObservatory: [
    ["校准地形扫描", "Calibrate the terrain scanner"],
    ["等观测站通电，在原地长按 E。镜头会先对准坡面，再写入扫描记录。", "Wait for power, then hold E. The optics will align with the slope and log the scan."],
    ["等观测站通电，停稳后轻点校准。", "Wait for power, then stop and tap Calibrate."],
  ],
  fabricatePower: [
    ["制造补给站套件", "Build a solar station kit"],
    ["回工坊停车，按 R 制造并装载太阳能补给站套件。", "Park at the workshop and press R to build and load the solar station kit."],
    ["回工坊停稳后轻点制造，机械臂会把补给站套件装上车。", "Stop at the workshop and tap Fabricate to load the solar station kit."],
  ],
  deployPower: [
    ["接通太阳能补给站", "Bring solar power online"],
    ["到补给站施工点停车。按 R 预览地基，再按 R 安装。建成后在附近停车可补电。", "Park at the site. Press R to preview, then press it again to install. Park nearby to recharge."],
    ["到施工点停稳后，点预览地基，再点安装。建成后在附近停车可补电。", "Stop at the site, tap Preview site, then Install. Park nearby to recharge."],
  ],
  return: [
    ["带回观测数据", "Return with the survey data"],
    ["设备已经投入工作。沿雷达返回着陆区，交付这次任务。", "The stations are online. Follow the radar back to the landing zone to hand in the data."],
  ],
};

const touchManual = {
  drive: ["左手摇杆驾驶，右半屏空白处滑动观察。单独按住推进可前进。行驶时按刹车停车，停稳后松开再长按刹车即可倒车。",
    "Drive with the left stick and look around by swiping the right half. Hold Throttle to drive straight. Brake to stop. Release, then hold Brake to reverse."],
  sample: ["停车后轻点目标旁的交互键，自动取样、勘测或校准。点取消或重新驾驶可中断。",
    "Stop, then tap the action beside the target to sample, survey, or calibrate. Tap Cancel or drive away to interrupt."],
  build: ["完整任务先带两份晶样和两份勘测记录回着陆区。停车后轻点制造。到施工点先点预览地基，再点安装。点交互键校准观测站。太阳能补给站建成后，停车即可补电。",
    "Return two samples and two field readings to the landing zone. Tap Fabricate at the workshop. At a site, tap Preview site, then Install. Tap Calibrate at the survey station. Park near the solar station to recharge."],
  earth: ["前往雷达浅紫色菱形标出的观测台。停稳后轻点观测地球，双指捏合变焦，两侧箭头切换波段与地球全景。拍摄后可查看分析并下载照片。",
    "Follow the lilac diamond to the Earth observatory. Stop and tap Observe Earth. Pinch to zoom and use the arrows to change mode. After a capture, review and download the image."],
};

export function createOnboarding(isTouch, t = zh => zh, restoreStatic = () => {}) {
  const manual = document.querySelector("#manual");
  const toggle = document.querySelector("#guide-toggle");
  let enabled = true;
  let lastStage = null;
  let stageChange = 0;
  try { enabled = localStorage.getItem(PREFERENCE) !== "off"; } catch { /* Session defaults. */ }

  function reflectPreference() {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? t("随行引导开", "Guide on") : t("随行引导关", "Guide off");
  }

  function setEnabled(value) {
    enabled = value;
    try { localStorage.setItem(PREFERENCE, enabled ? "on" : "off"); } catch { /* Session choice. */ }
    reflectPreference();
  }

  function cue(id, title, text) { return { id, title: t(...title), text: t(...text) }; }

  function update(state, elapsed, paused, stowing) {
    if (lastStage !== state.buildStage) {
      lastStage = state.buildStage;
      stageChange = elapsed;
    }
    if (!enabled || paused || state.phase !== "playing") return null;
    const touchDevice = isTouch();
    const stageGuide = constructionGuides[state.buildStage];
    if (stageGuide && elapsed - stageChange < 9) {
      const [title, desktop, mobile = desktop] = stageGuide;
      return cue(state.buildStage, title, touchDevice ? mobile : desktop);
    }
    if (state.campaignStage === "survey" && state.collected >= 2 && state.surveyCount >= 2
      && Math.hypot(state.x, state.z) < 4) {
      return cue("upload", ["上传勘测记录", "Upload the survey"],
        ["在着陆区停稳后开始建设，车上的样本和勘测记录会继续使用。", "Park inside the landing zone to unlock construction. Your samples and readings carry over."]);
    }
    if (state.collected === 0 && elapsed < 11 && Math.hypot(state.x, state.z) < 0.72) {
      return cue("drive", ["驶出着陆区", "Leave the landing zone"], touchDevice
        ? ["左手推摇杆驾驶，右半边空白处滑动看四周。三角指向晶样。", "Drive with the left stick. Swipe the right half to look. The triangle points to a sample."]
        : ["用 WASD 或方向键驶向雷达上的实心点。接近晶样时按空格刹车。", "Follow solid dots on radar with WASD or arrow keys. Press Space to brake."]);
    }
    if (state.collected === 0 && state.scanHold && state.scanProgress < 0.22 && !stowing) {
      return cue("core", ["停稳再取样", "Stop to sample"], touchDevice
        ? ["轻点取样后，等机械臂将样本送进车内。点取消或重新驾驶可中断。", "Tap Sample and wait for the arm to stow the core. Cancel or drive away to interrupt."]
        : ["长按 E 取样。等机械臂将样本送进车内。", "Hold E and wait for the arm to stow the core."]);
    }
    if (state.surveyCount === 0 && state.surveyIndex >= 0 && !state.scanHold) {
      return cue("survey", ["取得第一份现场读数", "Record your first reading"], touchDevice
        ? ["在雷达空心点旁停车，等车身稳定再轻点勘测。", "Park by a hollow radar dot. Once settled, tap Survey."]
        : ["在雷达空心点旁停车，等车身稳定再长按 E 勘测。", "Park by a hollow radar dot. Once settled, hold E."]);
    }
    if (state.mission === "survey" && state.returnEligible && !state.scanHold && !state.surveyHold
        && Math.hypot(state.x, state.z) < 4) {
      return cue("landing", ["返航交付", "Return to the landing zone"],
        ["驶入雷达中心的着陆区即可结算。继续取样和勘测可以提高评级。", "Drive into the landing zone to finish. More samples and readings can improve your grade."]);
    }
    return null;
  }

  document.querySelector("#manual-open").addEventListener("click", () => {
    restoreStatic();
    if (isTouch()) {
      for (const [key, text] of Object.entries(touchManual)) document.querySelector("#manual-" + key).textContent = t(...text);
    }
    manual.showModal();
  });
  document.querySelector("#guide-dismiss").addEventListener("click", () => setEnabled(false));
  toggle.addEventListener("click", () => setEnabled(!enabled));
  reflectPreference();
  return { update, refreshLanguage: reflectPreference, get enabled() { return enabled; }, get manualOpen() { return manual.open; } };
}
