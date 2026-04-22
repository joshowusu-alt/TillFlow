import React from 'react';

type IconVariant = 'default' | 'apple';

// Pre-computed trig constants for the ring arc
const DEG = (d: number) => (d * Math.PI) / 180;
const COS_50  = Math.cos(DEG(50));   //  0.6428
const SIN_50  = Math.sin(DEG(50));   //  0.7660
const COS_330 = Math.cos(DEG(330));  //  0.8660
const SIN_330 = Math.sin(DEG(330));  // -0.5000

/**
 * TillFlow premium app icon.
 *
 * Visual elements (from back to front):
 *  1. Deep royal-blue gradient tile
 *  2. Radial sheen — top-left highlight for material depth
 *  3. Three motion lines — left side, white, very subtle
 *  4. Cyan→emerald sync ring — 280° arc, gap on the right, glow + main stroke
 *  5. White TF geometric monogram
 *  6. Subtle inner-edge border for definition
 */
export function renderTillFlowAppIcon(size: number, _variant: IconVariant = 'default') {
  const br = Math.round(size * 0.221);   // rounded-square border radius
  const cx = size / 2;
  const cy = size / 2;
  const S  = size / 1024;               // linear scale factor from the 1024-px master

  // ── Ring geometry ──────────────────────────────────────────────────────────
  // Arc: 280° clockwise, start at 50° (lower-right), end at 330° (upper-right)
  // Gap sits on the right side (~1 o'clock → 5 o'clock) — suggests forward motion
  const ringR       = size * 0.288;
  const ringStroke  = Math.max(2, ringR * 0.075);
  const glowStroke  = ringStroke * 2.0;

  const sx = cx + ringR * COS_50;
  const sy = cy + ringR * SIN_50;
  const ex = cx + ringR * COS_330;
  const ey = cy + ringR * SIN_330;

  // Arc SVG path — large-arc (1), clockwise sweep (1)
  const arc = `M ${sx} ${sy} A ${ringR} ${ringR} 0 1 1 ${ex} ${ey}`;

  // Gradient y-positions: bottom of ring → top of ring (cyan → emerald)
  const gy1 = cy + ringR;
  const gy2 = cy - ringR;

  // ── Monogram geometry (master: 1024 px) ────────────────────────────────────
  // T: crossbar 367–509 × 392–426, stem centred at x=438, w=34, h=240
  // F: starts at x=531 (22 px gap after T), stem+top bar+mid bar
  // Combined center: x=(367+669)/2=518, y=(392+632)/2=512

  return (
    <div
      style={{
        display:      'flex',
        width:        size,
        height:       size,
        borderRadius: br,
        overflow:     'hidden',
        position:     'relative',
        background:   'linear-gradient(140deg, #1a368c 0%, #0e1f6a 52%, #080e44 100%)',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Top-left sheen — simulates ambient top-right light source */}
          <radialGradient id="tf-sheen" cx="34%" cy="27%" r="54%">
            <stop offset="0%"   stopColor="#7ab4ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#7ab4ff" stopOpacity="0"    />
          </radialGradient>

          {/* Ring: cyan at the bottom of the arc, emerald at the top */}
          <linearGradient
            id="tf-ring"
            x1={`${cx}`} y1={`${gy1}`}
            x2={`${cx}`} y2={`${gy2}`}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stopColor="#22d3ee" />
            <stop offset="55%"  stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* 1 · Sheen */}
        <rect width={size} height={size} fill="url(#tf-sheen)" />

        {/* 2 · Motion lines — white, horizontal, left side, ~22–23 % of width */}
        <line x1={84*S}  y1={464*S} x2={222*S} y2={464*S}
          stroke="white" strokeWidth={3.4*S} strokeLinecap="round" opacity="0.26" />
        <line x1={62*S}  y1={511*S} x2={236*S} y2={511*S}
          stroke="white" strokeWidth={3.4*S} strokeLinecap="round" opacity="0.34" />
        <line x1={84*S}  y1={558*S} x2={222*S} y2={558*S}
          stroke="white" strokeWidth={3.4*S} strokeLinecap="round" opacity="0.26" />

        {/* 3 · Ring — glow layer */}
        <path d={arc} fill="none"
          stroke="url(#tf-ring)" strokeWidth={glowStroke}
          strokeLinecap="round" opacity="0.18" />

        {/* 4 · Ring — main stroke */}
        <path d={arc} fill="none"
          stroke="url(#tf-ring)" strokeWidth={ringStroke}
          strokeLinecap="round" />

        {/* 5 · TF monogram — white geometric rectangles ─────────────────── */}

        {/* T — crossbar */}
        <rect x={367*S} y={392*S} width={142*S} height={34*S} fill="white" rx={2*S} />
        {/* T — vertical stem (crossbar centre 438, half-width 17 → starts at 421) */}
        <rect x={421*S} y={392*S} width={34*S}  height={240*S} fill="white" rx={2*S} />

        {/* F — vertical stem (22 px gap after T end 509 → starts at 531) */}
        <rect x={531*S} y={392*S} width={34*S}  height={240*S} fill="white" rx={2*S} />
        {/* F — top crossbar */}
        <rect x={531*S} y={392*S} width={138*S} height={34*S}  fill="white" rx={2*S} />
        {/* F — mid crossbar (~40 % of letter height: 392 + 96 = 488) */}
        <rect x={531*S} y={488*S} width={105*S} height={30*S}  fill="white" rx={2*S} />

        {/* 6 · Inner-edge highlight for tile definition */}
        <rect width={size} height={size} rx={br}
          fill="none" stroke="white" strokeWidth={2.5*S} opacity="0.07" />
      </svg>
    </div>
  );
}
