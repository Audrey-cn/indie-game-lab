// Embedded Transparent WebP Sprites (11) & Game Posters (3)
import heroUrl from "./sprites/hero.webp";
import dustUrl from "./sprites/enemy-dust.webp";
import sockUrl from "./sprites/enemy-sock.webp";
import legoUrl from "./sprites/enemy-lego.webp";
import mopUrl from "./sprites/enemy-mop.webp";
import crateUrl from "./sprites/crate.webp";
import catcanUrl from "./sprites/loot-catcan.webp";
import cashUrl from "./sprites/loot-cash.webp";
import ringUrl from "./sprites/loot-ring.webp";
import catpawUrl from "./sprites/catpaw.webp";
import poopUrl from "./sprites/poop.webp";
import posterLobbyUrl from "./sprites/poster-lobby.webp";
import posterVictoryUrl from "./sprites/poster-victory.webp";
import posterWin3StarUrl from "./sprites/poster-win-3star.webp";
import posterDefeatUrl from "./sprites/poster-defeat.webp";

export const POSTERS = {
  lobby: posterLobbyUrl,
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
  catpaw: loadSprite(catpawUrl, false),
  poop: loadSprite(poopUrl, true),
};
