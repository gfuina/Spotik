/** Mini boussole : le trait orange pointe vers le spot (0° = nord). */

type Props = {
  bearingDeg: number;
  label: string;
};

export function SpotListCompass({ bearingDeg, label }: Props) {
  const r = 13;
  const cx = 18;
  const cy = 18;
  const rad = (bearingDeg * Math.PI) / 180;
  const x2 = cx + r * Math.sin(rad);
  const y2 = cy - r * Math.cos(rad);
  const ariaLabel = `${label}, cap ${Math.round(bearingDeg)} degrés depuis le nord`;

  return (
    <div
      className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch border-r border-spotik-border bg-black py-1"
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={36}
        height={36}
        viewBox="0 0 36 36"
        className="shrink-0"
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={1.5}
        />
        <line
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke="#ff4d00"
          strokeWidth={2.25}
          strokeLinecap="square"
        />
        <circle cx={cx} cy={cy} r={2} fill="#ffffff" />
        <text
          x={cx}
          y={6}
          textAnchor="middle"
          className="fill-[#888] font-mono"
          style={{ fontSize: "7px" }}
        >
          N
        </text>
      </svg>
      <span
        className="max-w-[3.25rem] text-center font-mono text-[7px] font-bold leading-[1.15] tracking-wide text-spotik-orange"
        title={label}
      >
        {label}
      </span>
    </div>
  );
}
