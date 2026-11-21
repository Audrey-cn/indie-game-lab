export function createTitleCinematic(video, embeddedMedia) {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let onTitle = false;
  let mediaUrl = null;
  let failed = false;

  function showMotion(value) {
    document.body.dataset.titleMotion = String(value);
  }

  function releaseSource() {
    if (!mediaUrl) return;
    const url = mediaUrl;
    mediaUrl = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }

  function reflectPlayback() {
    if (!onTitle || preference.matches || failed) {
      showMotion(false);
      releaseSource();
      return;
    }
    if (document.hidden) {
      showMotion(false);
      video.pause();
      return;
    }
    if (!mediaUrl) {
      const base64 = embeddedMedia?.textContent.trim();
      if (!base64) return;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      mediaUrl = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
      video.src = mediaUrl;
    }
    const source = mediaUrl;
    video.play().catch(() => {
      if (mediaUrl === source) showMotion(false);
    });
  }

  video.addEventListener("playing", () => {
    showMotion(onTitle && !document.hidden && !preference.matches);
  });
  video.addEventListener("pause", () => {
    if (video.paused) showMotion(false);
  });
  video.addEventListener("error", () => {
    if (!mediaUrl || !video.error) return;
    failed = true;
    reflectPlayback();
  });
  document.addEventListener("visibilitychange", reflectPlayback);
  preference.addEventListener("change", reflectPlayback);

  return function setTitleActive(active) {
    onTitle = active;
    reflectPlayback();
  };
}
