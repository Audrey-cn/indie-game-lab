// Embedded Transparent WebP Sprites (15) & Hand-Painted Game Posters (8)
import heroUrl from "./sprites/hero.webp";
import dustUrl from "./sprites/enemy-dust.webp";
import sockUrl from "./sprites/enemy-sock.webp";
import legoUrl from "./sprites/enemy-lego.webp";
import mopUrl from "./sprites/enemy-mop.webp";
import crateUrl from "./sprites/crate.webp";
import catcanUrl from "./sprites/loot-catcan.webp";
import cashUrl from "./sprites/loot-cash.webp";
import ringUrl from "./sprites/loot-ring.webp";
import duckUrl from "./sprites/loot-duck.webp";
import earbudUrl from "./sprites/loot-earbud.webp";
import remoteUrl from "./sprites/loot-remote.webp";
import coreUrl from "./sprites/loot-core.webp";
import catpawUrl from "./sprites/catpaw.webp";
import poopUrl from "./sprites/poop.webp";
import vfxSlashUrl from "./sprites/vfx-slash.webp";
import vfxBurstUrl from "./sprites/vfx-burst.webp";
import vfxFlameUrl from "./sprites/vfx-flame.webp";
import vfxBrushUrl from "./sprites/vfx-brush.webp";
import posterLobbyUrl from "./sprites/poster-lobby.webp";
import posterKitchenUrl from "./sprites/poster-map-kitchen.webp";
import posterStudyUrl from "./sprites/poster-map-study.webp";
import posterCatPalaceUrl from "./sprites/poster-map-catpalace.webp";
import posterRooftopUrl from "./sprites/poster-map-rooftop.webp";
import posterVictoryUrl from "./sprites/poster-victory.webp";
import posterWin3StarUrl from "./sprites/poster-win-3star.webp";
import posterDefeatUrl from "./sprites/poster-defeat.webp";

export const POSTERS = {
  lobby: posterLobbyUrl,
  kitchen: posterKitchenUrl,
  study: posterStudyUrl,
  cat_palace: posterCatPalaceUrl,
  rooftop: posterRooftopUrl,
  victory: posterVictoryUrl,
  win3star: posterWin3StarUrl,
  defeat: posterDefeatUrl,
};

export const SPRITE_URLS = {
  hero: heroUrl,
  dust: dustUrl,
  sock: sockUrl,
  lego: legoUrl,
  mop: mopUrl,
  crate: crateUrl,
  catcan: catcanUrl,
  cash: cashUrl,
  ring: ringUrl,
  duck: duckUrl,
  earbud: earbudUrl,
  remote: remoteUrl,
  core: coreUrl,
  catpaw: catpawUrl,
  poop: poopUrl,
};

function loadSprite(url, makeWhite = false) {
  const entry = { img: new Image(), ready: false, white: null };
  entry.img.onload = () => {
    entry.ready = true;
    if (makeWhite) {
      const c = document.createElement("canvas");
      c.width = entry.img.width;
      c.height = entry.img.height;
      const g = c.getContext("2d");
      g.drawImage(entry.img, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, c.width, c.height);
      entry.white = c;
    }
  };
  entry.img.src = url;
  return entry;
}

export const SPRITES = {
  hero: loadSprite(heroUrl, true),
  dust: loadSprite(dustUrl, true),
  sock: loadSprite(sockUrl, true),
  lego: loadSprite(legoUrl, true),
  mop: loadSprite(mopUrl, true),
  crate: loadSprite(crateUrl, true),
  catcan: loadSprite(catcanUrl, false),
  cash: loadSprite(cashUrl, false),
  ring: loadSprite(ringUrl, false),
  duck: loadSprite(duckUrl, false),
  earbud: loadSprite(earbudUrl, false),
  remote: loadSprite(remoteUrl, false),
  core: loadSprite(coreUrl, false),
  catpaw: loadSprite(catpawUrl, false),
  poop: loadSprite(poopUrl, true),
  vfxSlash: loadSprite(vfxSlashUrl, false),
  vfxBurst: loadSprite(vfxBurstUrl, false),
  vfxFlame: loadSprite(vfxFlameUrl, false),
  vfxBrush: loadSprite(vfxBrushUrl, false),
};
