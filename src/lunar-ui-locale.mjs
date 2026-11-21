const attributes = ["aria-label", "title"];

export function createLunarLocale() {
  const languageSelect = document.querySelector("#language-select");
  let language = "zh-CN";
  const copy = Array.from(document.querySelectorAll("[data-l10n]"), node =>
    ({ node, zh: node.textContent, en: node.dataset.l10n }));
  const labels = attributes.flatMap(attribute =>
    Array.from(document.querySelectorAll(`[data-l10n-${attribute}]`), node => ({
      node, attribute, zh: node.getAttribute(attribute), en: node.getAttribute(`data-l10n-${attribute}`),
    })));

  function t(zh, en) { return language === "en" ? en ?? zh : zh; }

  function updateStatic() {
    document.documentElement.lang = language;
    document.title = t("月面采集站", "Lunar Field Station");
    if (languageSelect) languageSelect.value = language;
    for (const { node, zh, en } of copy) node.textContent = t(zh, en);
    for (const { node, attribute, zh, en } of labels) node.setAttribute(attribute, t(zh, en));
  }

  function set(value) {
    const normalized = value === "en" ? "en" : "zh-CN";
    if (normalized !== language) {
      language = normalized;
      updateStatic();
    }
    return language;
  }

  return { set, t, updateStatic, get language() { return language; } };
}
