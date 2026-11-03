import type { ReactNode } from "react";

const OCTAGON = "30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30";
const OCTAGON_INNER = "33,8 67,8 92,33 92,67 67,92 33,92 8,67 8,33";

export function Octagon({ size = 28, children }: { size?: number; children?: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={OCTAGON} fill="#f5f1e6" />
      <polygon points={OCTAGON_INNER} fill="#c8202a" />
      {children}
    </svg>
  );
}

export function Yield({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="4,8 96,8 50,94" fill="#facc15" stroke="#f5f1e6" strokeWidth="6" strokeLinejoin="round" />
      <polygon points="30,24 70,24 50,62" fill="#141413" />
    </svg>
  );
}

export function Diamond({ size = 22, color = "#f97316", label }: { size?: number; color?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,3 97,50 50,97 3,50" fill={color} stroke="#111" strokeWidth="5" strokeLinejoin="round" />
      {label && (
        <text x="50" y="56" fontSize="17" fontWeight="900" textAnchor="middle" fill="#111" fontFamily="Overpass, sans-serif">
          {label}
        </text>
      )}
    </svg>
  );
}

export function DeadEnd({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,3 97,50 50,97 3,50" fill="#f9b013" stroke="#111" strokeWidth="4" strokeLinejoin="round" />
      <text x="50" y="47" fontSize="17" fontWeight="900" textAnchor="middle" fill="#111" fontFamily="Overpass, sans-serif">
        DEAD
      </text>
      <text x="50" y="66" fontSize="17" fontWeight="900" textAnchor="middle" fill="#111" fontFamily="Overpass, sans-serif">
        END
      </text>
    </svg>
  );
}

export function StartSticker({ size = 240 }: { size?: number }) {
  const drips = [
    [116, 62, 4],
    [124, 66, 3],
    [152, 62, 5],
    [166, 66, 3],
    [190, 58, 4],
  ];
  return (
    <svg width={size} viewBox="0 0 220 180" aria-hidden="true">
      <polygon points="50,5 130,5 175,50 175,130 130,175 50,175 5,130 5,50" fill="#fff" />
      <polygon points="53,14 127,14 166,53 166,127 127,166 53,166 14,127 14,53" fill="#111" />
      <polygon points="56,20 124,20 160,56 160,124 124,160 56,160 20,124 20,56" fill="#d3272e" />
      <polygon points="20,97 160,97 160,124 124,160 56,160 20,124" fill="#a81f25" />
      <text x="26" y="110" fontSize="58" fontWeight="900" fill="#fff" fontFamily="Overpass, Arial, sans-serif">
        ST
      </text>
      <text
        x="84"
        y="110"
        fontSize="60"
        fontWeight="900"
        fill="#000"
        stroke="#fff"
        strokeWidth="2"
        paintOrder="stroke"
        fontFamily="Overpass, Arial, sans-serif"
      >
        ART
      </text>
      {drips.map(([x, h, w]) => (
        <rect key={x} x={x} y={106} width={w} height={h - 40} rx={w / 2} fill="#000" />
      ))}
    </svg>
  );
}

export function GameOver({ className = "text-4xl" }: { className?: string }) {
  return (
    <div className={`pixel-sticker text-[#e0202a] ${className}`} aria-hidden="true">
      GAME
      <br />
      OVER
    </div>
  );
}

export function Aura({ className = "text-2xl" }: { className?: string }) {
  return (
    <div className={`pixel-sticker ${className}`} aria-hidden="true">
      <span className="text-black" style={{ textShadow: "2px 0 #fff,-2px 0 #fff,0 2px #fff,0 -2px #fff,4px 0 #fff,-4px 0 #fff,0 4px #fff,0 -4px #fff" }}>
        +1000
      </span>
      <br />
      <span className="text-sign">AURA</span>
    </div>
  );
}

/** Original illustration in the spirit of the road collage. */
export function RoadArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 800" role="img" aria-label="Winding road past stop, yield and dead end signs, into a pile of wrecked cars">
      <g fill="#111">
        <path d="M60 180 q-30 -60 60 -70 q30 -60 120 -50 q70 -40 130 10 q70 0 70 60 q50 30 0 60 l-340 30 q-60 -10 -40 -40z" />
      </g>
      <g fill="#8f8f8a">
        <path d="M110 130l40 -22 26 22 -30 16z" />
        <path d="M210 90l48 -12 18 26 -44 14z" />
        <path d="M300 120l44 -10 12 26 -40 12z" />
        <path d="M170 180l60 -14 16 22 -56 14z" />
        <path d="M330 180l42 -12 14 20 -40 10z" />
      </g>
      <g fill="#f5f1e6">
        <path d="M130 150l22 -8 6 10 -20 8z" />
        <path d="M240 130l26 -6 6 10 -24 6z" />
        <path d="M350 150l20 -6 6 8 -18 6z" />
      </g>
      <path d="M-40 860 C 60 620, 420 560, 470 420 C 510 300, 380 280, 300 220" fill="none" stroke="#f5f1e6" strokeWidth="196" strokeLinecap="butt" />
      <path d="M-40 860 C 60 620, 420 560, 470 420 C 510 300, 380 280, 300 220" fill="none" stroke="#121211" strokeWidth="180" />
      <path d="M-40 860 C 60 620, 420 560, 470 420 C 510 300, 380 280, 300 220" fill="none" stroke="#f5f1e6" strokeWidth="8" strokeDasharray="46 40" />

      <g transform="translate(155 590) rotate(-18)">
        <path d="M0 34 q4 -30 26 -34 h34 q22 4 26 34 v26 q-43 8 -86 0z" fill="#f5f1e6" stroke="#111" strokeWidth="3" />
        <path d="M16 26 q4 -16 14 -18 h26 q10 2 14 18z" fill="#333" />
        <rect x="6" y="52" width="14" height="6" fill="#c8202a" />
        <rect x="66" y="52" width="14" height="6" fill="#c8202a" />
      </g>

      <rect x="540" y="210" width="10" height="110" fill="#8d9498" />
      <g transform="translate(488 90) rotate(7)">
        <polygon points="36,0 84,0 120,36 120,84 84,120 36,120 0,84 0,36" fill="#f5f1e6" />
        <polygon points="39,8 81,8 112,39 112,81 81,112 39,112 8,81 8,39" fill="#c8202a" />
        <text x="60" y="73" fontSize="35" fontWeight="900" textAnchor="middle" fill="#f5f1e6" fontFamily="Overpass, Arial, sans-serif">STOP</text>
      </g>

      <rect x="70" y="420" width="12" height="160" fill="#8d9498" transform="rotate(-8 76 500)" />
      <g transform="translate(-6 270) rotate(6)">
        <polygon points="0,0 150,20 90,170" fill="#f5f1e6" />
        <polygon points="14,10 138,26 88,152" fill="#c8202a" />
        <polygon points="44,28 112,36 84,106" fill="#f5f1e6" />
        <text x="78" y="62" fontSize="17" fontWeight="800" textAnchor="middle" fill="#c8202a" fontFamily="Overpass, Arial, sans-serif">YIELD</text>
      </g>

      <rect x="274" y="345" width="10" height="70" fill="#6c5c3e" />
      <g transform="translate(205 225) rotate(-10)">
        <rect width="104" height="108" rx="5" fill="#f5f1e6" />
        <circle cx="52" cy="52" r="42" fill="#c8202a" />
        <rect x="16" y="43" width="72" height="18" fill="#f5f1e6" />
        <text x="52" y="34" fontSize="13" fontWeight="800" textAnchor="middle" fill="#f5f1e6" fontFamily="Overpass, Arial, sans-serif">DO NOT</text>
        <text x="52" y="80" fontSize="13" fontWeight="800" textAnchor="middle" fill="#f5f1e6" fontFamily="Overpass, Arial, sans-serif">ENTER</text>
        <rect y="114" width="104" height="48" rx="4" fill="#c8202a" stroke="#f5f1e6" strokeWidth="3" />
        <text x="52" y="136" fontSize="15" fontWeight="900" textAnchor="middle" fill="#f5f1e6" fontFamily="Overpass, Arial, sans-serif">WRONG</text>
        <text x="52" y="153" fontSize="15" fontWeight="900" textAnchor="middle" fill="#f5f1e6" fontFamily="Overpass, Arial, sans-serif">WAY</text>
      </g>

      <rect x="486" y="660" width="14" height="150" fill="#8d9498" transform="rotate(6 493 730)" />
      <g transform="translate(508 540) rotate(10)">
        <polygon points="0,-130 130,0 0,130 -130,0" fill="#111" />
        <polygon points="0,-120 120,0 0,120 -120,0" fill="#e6981c" />
        <text y="-8" fontSize="44" fontWeight="800" textAnchor="middle" fill="#111" fontFamily="Overpass, Arial, sans-serif">DEAD</text>
        <text y="42" fontSize="44" fontWeight="800" textAnchor="middle" fill="#111" fontFamily="Overpass, Arial, sans-serif">END</text>
      </g>
    </svg>
  );
}

/** Your own photo: drop it at frontend/public/theme/ride.jpg. Hidden while the file is missing. */
export function RidePhoto({ className = "" }: { className?: string }) {
  return (
    <img
      src="/theme/ride.jpg"
      alt="Two riders on a motorcycle"
      className={`bg-white p-2 pb-6 shadow-xl ${className}`}
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}

export function PanelNotice({ sign, title, children }: { sign: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      {sign}
      <div className="font-black tracking-wide uppercase">{title}</div>
      <div className="text-muted text-sm">{children}</div>
    </div>
  );
}
