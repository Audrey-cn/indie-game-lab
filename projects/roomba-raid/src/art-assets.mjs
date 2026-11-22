// Hand-crafted Illustrated SVG Data-URL Art Assets for Unboxing Rewards & Dynamic Map Backdrops
import { POSTERS, SPRITE_URLS } from "./sprites.mjs";

const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;

// High-craft Illustrated Object Art for every Loot Item (real WebP sprites + custom shaded vector art)
export const LOOT_ART = {
  catcan: SPRITE_URLS.catcan,
  cash: SPRITE_URLS.cash,
  ring: SPRITE_URLS.ring,
  duck: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <radialGradient id="dg" cx="38%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#fff8b0"/>
          <stop offset="45%" stop-color="#ffd233"/>
          <stop offset="100%" stop-color="#c97a00"/>
        </radialGradient>
        <linearGradient id="bk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff9a2e"/>
          <stop offset="100%" stop-color="#d9480f"/>
        </linearGradient>
      </defs>
      <ellipse cx="82" cy="136" rx="46" ry="12" fill="rgba(0,0,0,0.35)"/>
      <path d="M36 96 C32 70, 56 64, 72 72 C88 78, 118 72, 128 84 C136 94, 130 124, 96 128 C58 132, 38 118, 36 96 Z" fill="url(#dg)" stroke="#241504" stroke-width="5"/>
      <circle cx="66" cy="58" r="28" fill="url(#dg)" stroke="#241504" stroke-width="5"/>
      <path d="M40 58 C24 56, 20 68, 38 72 C46 74, 52 68, 48 60 Z" fill="url(#bk)" stroke="#241504" stroke-width="4.5"/>
      <circle cx="58" cy="52" r="6" fill="#18121e"/>
      <circle cx="56" cy="50" r="2.2" fill="#ffffff"/>
      <path d="M78 88 C94 84, 112 92, 108 106 C104 116, 82 114, 74 102 Z" fill="#ffe66d" stroke="#241504" stroke-width="4"/>
      <path d="M52 34 L56 16 L67 26 L77 14 L82 34 Z" fill="#ffe066" stroke="#241504" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="77" cy="14" r="3.5" fill="#38f3ff"/>
      <path d="M56 42 Q64 36 74 42" stroke="#ffffff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7"/>
    </svg>
  `),
  earbud: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="eb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="65%" stop-color="#dbe7f5"/>
          <stop offset="100%" stop-color="#94a9c4"/>
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="138" rx="34" ry="10" fill="rgba(0,0,0,0.35)"/>
      <path d="M62 42 C40 42, 34 74, 56 82 L68 84 L64 128 C64 134, 80 136, 84 128 L92 78 C114 74, 114 42, 86 42 Z" fill="url(#eb)" stroke="#14182e" stroke-width="5"/>
      <ellipse cx="52" cy="62" rx="9" ry="13" fill="#1e293b"/>
      <rect x="75" y="96" width="6" height="16" rx="3" fill="#38f3ff"/>
      <circle cx="88" cy="56" r="5" fill="#38f3ff" opacity="0.85"/>
      <path d="M66 49 Q78 45 92 50" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>
  `),
  remote: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="rm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#475569"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
      </defs>
      <g transform="rotate(-14 80 80)">
        <rect x="52" y="18" width="56" height="124" rx="16" fill="url(#rm)" stroke="#0f172a" stroke-width="5"/>
        <circle cx="68" cy="36" r="7" fill="#ff4268" stroke="#0f172a" stroke-width="2.5"/>
        <circle cx="92" cy="36" r="5" fill="#38f3ff"/>
        <circle cx="80" cy="68" r="17" fill="#334155" stroke="#0f172a" stroke-width="3"/>
        <circle cx="80" cy="68" r="7" fill="#ffd54a"/>
        <rect x="62" y="96" width="14" height="10" rx="3" fill="#94a3b8"/>
        <rect x="84" y="96" width="14" height="10" rx="3" fill="#94a3b8"/>
        <rect x="62" y="114" width="14" height="10" rx="3" fill="#94a3b8"/>
        <rect x="84" y="114" width="14" height="10" rx="3" fill="#39ff88"/>
      </g>
    </svg>
  `),
  core: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="cr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e0ffff"/>
          <stop offset="45%" stop-color="#38f3ff"/>
          <stop offset="100%" stop-color="#6d28d9"/>
        </linearGradient>
      </defs>
      <polygon points="80,14 134,58 112,138 48,138 26,58" fill="url(#cr)" stroke="#141126" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="80,14 108,58 80,138 52,58" fill="rgba(255,255,255,0.28)"/>
      <polygon points="80,32 100,62 80,104 60,62" fill="#ffffff" opacity="0.65"/>
    </svg>
  `),
  crate: SPRITE_URLS.crate,
  skin: SPRITE_URLS.hero,
};

// 5 Distinct Scenic Backdrops & Card Previews — Switching Map Cards Transforms the Entire Home Page!
export const MAP_BACKDROPS = {
  living: POSTERS.lobby,
  kitchen: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="kbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0b1d2e"/>
          <stop offset="50%" stop-color="#14324a"/>
          <stop offset="100%" stop-color="#09131f"/>
        </linearGradient>
        <radialGradient id="kgl" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stop-color="#38f3ff" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="#38f3ff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="720" fill="url(#kbg)"/>
      <rect width="400" height="720" fill="url(#kgl)"/>
      <!-- Midnight Window + Moon -->
      <rect x="230" y="95" width="130" height="150" rx="10" fill="#0d2238" stroke="#38bdf8" stroke-width="4"/>
      <circle cx="318" cy="145" r="24" fill="#fef08a"/>
      <circle cx="328" cy="138" r="21" fill="#0d2238"/>
      <!-- Stainless Fridge with Cyan Glow -->
      <rect x="28" y="135" width="128" height="240" rx="14" fill="#cbd5e1" stroke="#0f172a" stroke-width="5"/>
      <line x1="28" y1="245" x2="156" y2="245" stroke="#475569" stroke-width="4"/>
      <rect x="48" y="165" width="12" height="54" rx="5" fill="#475569"/>
      <rect x="48" y="268" width="12" height="72" rx="5" fill="#475569"/>
      <rect x="96" y="176" width="38" height="24" rx="4" fill="#38f3ff"/>
      <!-- Marble Kitchen Island -->
      <rect x="85" y="340" width="290" height="110" rx="14" fill="#e2e8f0" stroke="#0f172a" stroke-width="5"/>
      <rect x="85" y="395" width="290" height="65" rx="8" fill="#334155" stroke="#0f172a" stroke-width="5"/>
      <!-- Glowing spilled milk-tea puddle & checkered floor -->
      <ellipse cx="210" cy="520" rx="110" ry="28" fill="#c08457" opacity="0.55"/>
      <circle cx="178" cy="518" r="6" fill="#2e1810"/><circle cx="222" cy="526" r="7" fill="#2e1810"/><circle cx="246" cy="512" r="5" fill="#2e1810"/>
    </svg>
  `),
  study: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#14112b"/>
          <stop offset="55%" stop-color="#281d3d"/>
          <stop offset="100%" stop-color="#0f0c1d"/>
        </linearGradient>
        <radialGradient id="slamp" cx="68%" cy="42%" r="48%">
          <stop offset="0%" stop-color="#ffd54a" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#ffd54a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="720" fill="url(#sbg)"/>
      <!-- Tall Starry Window -->
      <rect x="135" y="75" width="145" height="210" rx="12" fill="#090d24" stroke="#7c5c46" stroke-width="6"/>
      <circle cx="172" cy="118" r="3" fill="#fff"/><circle cx="242" cy="142" r="2.5" fill="#fde047"/><circle cx="204" cy="175" r="2" fill="#38f3ff"/>
      <!-- Mahogany Bookshelves -->
      <rect x="18" y="105" width="96" height="295" rx="8" fill="#4a2c20" stroke="#140c0a" stroke-width="5"/>
      <rect x="30" y="128" width="18" height="44" rx="2" fill="#e11d48"/><rect x="52" y="134" width="16" height="38" rx="2" fill="#0284c7"/><rect x="72" y="124" width="22" height="48" rx="2" fill="#d97706"/>
      <rect x="30" y="198" width="22" height="42" rx="2" fill="#16a34a"/><rect x="56" y="192" width="18" height="48" rx="2" fill="#7c3aed"/><rect x="78" y="202" width="18" height="38" rx="2" fill="#f59e0b"/>
      <!-- Study Desk + Glowing Lamp -->
      <rect x="95" y="345" width="275" height="95" rx="12" fill="#5c3d2e" stroke="#140c0a" stroke-width="5"/>
      <rect x="165" y="300" width="96" height="58" rx="6" fill="#cbd5e1" stroke="#0f172a" stroke-width="4"/>
      <rect x="174" y="309" width="78" height="38" rx="3" fill="#38f3ff"/>
      <circle cx="295" cy="295" r="28" fill="#ffd54a"/>
      <rect width="400" height="720" fill="url(#slamp)"/>
    </svg>
  `),
  cat_palace: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a113d"/>
          <stop offset="50%" stop-color="#4c1d57"/>
          <stop offset="100%" stop-color="#190924"/>
        </linearGradient>
        <radialGradient id="cgl" cx="50%" cy="34%" r="55%">
          <stop offset="0%" stop-color="#ffd54a" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#ffd54a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="720" fill="url(#cbg)"/>
      <rect width="400" height="720" fill="url(#cgl)"/>
      <!-- Giant Cat Silhouette Throne & Glowing Golden Eyes -->
      <path d="M105 260 L125 145 L175 195 Q200 185 225 195 L275 145 L295 260 Q295 360 200 365 Q105 360 105 260 Z" fill="#1e0b2e" stroke="#ffd54a" stroke-width="4"/>
      <ellipse cx="164" cy="252" rx="22" ry="15" fill="#ffd54a"/>
      <ellipse cx="236" cy="252" rx="22" ry="15" fill="#ffd54a"/>
      <ellipse cx="164" cy="252" rx="5" ry="13" fill="#180826"/>
      <ellipse cx="236" cy="252" rx="5" ry="13" fill="#180826"/>
      <!-- Velvet Cushion & Floating Gold Cans -->
      <ellipse cx="200" cy="435" rx="145" ry="44" fill="#9d174d" stroke="#ffd54a" stroke-width="4"/>
      <circle cx="88" cy="340" r="22" fill="#ffd54a" stroke="#241504" stroke-width="3.5"/>
      <circle cx="314" cy="315" r="24" fill="#ffd54a" stroke="#241504" stroke-width="3.5"/>
    </svg>
  `),
  rooftop: svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#070b1a"/>
          <stop offset="48%" stop-color="#172554"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <radialGradient id="rgl" cx="50%" cy="28%" r="55%">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#38f3ff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="720" fill="url(#rbg)"/>
      <rect width="400" height="720" fill="url(#rgl)"/>
      <!-- Giant Moon & Cyberpunk City Skyline -->
      <circle cx="200" cy="175" r="68" fill="#fef08a" opacity="0.9"/>
      <rect x="14" y="245" width="54" height="190" fill="#0f172a"/><rect x="78" y="210" width="66" height="225" fill="#1e293b"/>
      <rect x="160" y="255" width="74" height="180" fill="#0f172a"/><rect x="252" y="195" width="68" height="240" fill="#1e293b"/>
      <rect x="330" y="240" width="58" height="195" fill="#0f172a"/>
      <rect x="92" y="232" width="10" height="10" fill="#38f3ff"/><rect x="114" y="258" width="10" height="10" fill="#ffd54a"/>
      <rect x="268" y="220" width="12" height="12" fill="#ff4c76"/><rect x="292" y="250" width="12" height="12" fill="#38f3ff"/>
      <!-- Rooftop Glass Railing & Glowing Safe -->
      <rect x="0" y="395" width="400" height="18" fill="#38f3ff" opacity="0.45"/>
      <rect x="0" y="412" width="400" height="308" fill="#1e293b" opacity="0.72"/>
    </svg>
  `),
};
