const messages = {
  ore: [
    ["嘿，看看那块晶石！取一份带回车上，我想再细扫一遍。", "Hey, look at that crystal. Bring a piece aboard and I'll take a closer look."],
    ["灰扑扑的地上还有这道亮光。取一份样本吧。", "A little glint in all that gray. Let's take a sample."],
    ["我找到一块晶石。给机械臂留点空位，咱们带一份走。", "Found another crystal. Give the arm some room and let's collect a piece."],
    ["月面没有纪念品店，这块晶石倒值得带份样本回去。", "No gift shops on the Moon. This crystal will make a fine souvenir."],
    ["又见到一块晶石。我的镜头已经对上了，接下来交给机械臂。", "Another crystal in my sights. Over to the sampling arm."],
  ],
  survey: [
    ["前面有台勘测仪。试试把现场读数存一份。", "There's a survey instrument up ahead. Let's record its reading."],
    ["看到那台仪器了。咱们给这条路线添一条现场记录。", "I see the instrument. Let's add a field reading to the route log."],
    ["勘测仪就在前面。给下一班探险队留份记录吧。", "Instrument ahead. Let's leave a reading for the next crew."],
  ],
  workshop: [
    ["工作台在前面。带来的材料正好能用上。", "The workbench is up ahead. Good thing we brought materials."],
    ["到工坊了。咱们把零件装成一套，再开去现场。", "We're at the workshop. Pack a kit here, then take it to the site."],
    ["那是工坊。工作台旁边给机械臂留点位置。", "That's the workshop. Leave the arm some space by the bench."],
  ],
  foundation: [
    ["找到施工点了。先看看地基平不平，给机械臂留点空间。", "Found the site. Check the slope and leave room for the arm."],
    ["先给设施挑个站得稳的地方。沿标记靠过去。", "Let's find a place where the equipment can stand level. Follow the marker."],
    ["这就是施工点。别挡在地基中间，让机械臂够得到它。", "This is the site. Park beside it so the arm can reach."],
  ],
  calibration: [
    ["找到观测站的镜头了。等设备通电再校准。", "I found the station's optics. Wait for power before calibrating."],
    ["该让观测站看看前面的坡了。通电后就能校准。", "Time for the station to take a look at that slope. Calibrate once it's powered."],
  ],
  earth: [
    ["找到地球观测镜了。想看看家有多远吗？", "I found the Earth telescope. Want a look at home?"],
    ["这个位置适合看地球。咱们借望远镜看一眼。", "Good spot for a view of Earth. Let's look through the telescope."],
  ],
  landing: [
    ["看到着陆区了。沿标记驶进去，把车停稳就能交付记录。", "Landing zone in sight. Follow the marker and stop inside to hand in the readings."],
    ["着陆区在前面。把车开进去停好，咱们交记录。", "Landing zone ahead. Pull in and park. I'll have the log ready."],
  ],
};

const actions = {
  ore: [["停稳后长按 E 取样。", "Stop and hold E to sample."], ["停稳后轻点取样。", "Stop and tap Sample."]],
  survey: [["停稳后长按 E 勘测。", "Stop and hold E to survey."], ["停稳后轻点勘测。", "Stop and tap Survey."]],
  workshop: [["停稳后按 R 制造。", "Stop and press R to fabricate."], ["停稳后轻点制造。", "Stop and tap Fabricate."]],
  foundation: [["停稳后按 R 预览地基。", "Stop and press R to preview the site."], ["停稳后轻点预览地基。", "Stop and tap Preview site."]],
  calibration: [["停稳后长按 E 校准。", "Stop and hold E to calibrate."], ["停稳后轻点校准。", "Stop and tap Calibrate."]],
  earth: [["停稳后按 E 打开取景器。", "Stop and press E to open the viewfinder."], ["停稳后轻点观测地球。", "Stop and tap Observe Earth."]],
};

export function createCompanionLines() {
  const byMode = new Map();
  function next(target, touch) {
    const mode = target?.mode;
    if (!Object.hasOwn(messages, mode)) return null;
    const count = byMode.get(mode) ?? 0;
    byMode.set(mode, count + 1);
    const pool = messages[mode];
    const [zh, en] = pool[count % pool.length];
    const action = actions[mode]?.[Number(Boolean(touch))];
    return action ? [zh + action[0], en + " " + action[1]] : [zh, en];
  }
  return { next, reset: () => byMode.clear() };
}
