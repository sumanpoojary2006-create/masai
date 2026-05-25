export function MasaiLensLogo({
  iconSize = 52,
  showTagline = false,
  className = "",
}: {
  iconSize?: number;
  showTagline?: boolean;
  className?: string;
}) {
  const textSize = Math.round(iconSize * 0.38);
  const taglineSize = Math.round(iconSize * 0.16);

  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: Math.round(iconSize * 0.22) + "px" }}
    >
      <MasaiLensIcon size={iconSize} />
      <div>
        <p style={{ fontSize: textSize, lineHeight: 1.1, margin: 0 }}>
          <span style={{ fontWeight: 300, color: "#ffffff", letterSpacing: "0.01em" }}>masai</span>
          {" "}
          <span style={{ fontWeight: 700, color: "#ffffff", letterSpacing: "0.01em" }}>Lens</span>
        </p>
        {showTagline && (
          <p
            style={{
              fontSize: taglineSize,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginTop: "4px",
              lineHeight: 1.5,
              margin: "4px 0 0",
            }}
          >
            TRACK. REMIND. COMPLETE.
            <br />
            ALWAYS ON TRACK.
          </p>
        )}
      </div>
    </div>
  );
}

function MasaiLensIcon({ size }: { size: number }) {
  const uid = "ml";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-outer`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#5a5f70" />
          <stop offset="60%" stopColor="#2a2d38" />
          <stop offset="100%" stopColor="#1a1d26" />
        </radialGradient>
        <radialGradient id={`${uid}-inner`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1a1e2a" />
          <stop offset="100%" stopColor="#0c0e14" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer metallic ring */}
      <circle cx="50" cy="50" r="48" fill={`url(#${uid}-outer)`} />
      {/* Inner dark body */}
      <circle cx="50" cy="50" r="41" fill={`url(#${uid}-inner)`} />
      {/* Inner detail ring */}
      <circle cx="50" cy="50" r="37" fill="none" stroke="#2e3342" strokeWidth="0.8" />

      {/* Circuit nodes — left side */}
      <circle cx="14" cy="32" r="3.2" fill="none" stroke="#5a6270" strokeWidth="1.4" />
      <circle cx="14" cy="32" r="1.4" fill="#5a6270" />
      <line x1="17.2" y1="32" x2="24" y2="32" stroke="#5a6270" strokeWidth="1.4" />

      <circle cx="14" cy="50" r="3.2" fill="none" stroke="#5a6270" strokeWidth="1.4" />
      <circle cx="14" cy="50" r="1.4" fill="#5a6270" />
      <line x1="17.2" y1="50" x2="24" y2="50" stroke="#5a6270" strokeWidth="1.4" />

      <circle cx="14" cy="68" r="3.2" fill="none" stroke="#5a6270" strokeWidth="1.4" />
      <circle cx="14" cy="68" r="1.4" fill="#5a6270" />
      <line x1="17.2" y1="68" x2="24" y2="68" stroke="#5a6270" strokeWidth="1.4" />

      {/* M — glow halo */}
      <path
        d="M30 72 L30 37 L50 59 L70 37 L70 72"
        fill="none"
        stroke="#ff2020"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.22"
        filter={`url(#${uid}-glow)`}
      />
      {/* M — dark base */}
      <path
        d="M30 72 L30 37 L50 59 L70 37 L70 72"
        fill="none"
        stroke="#7a0a0a"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* M — neon highlight */}
      <path
        d="M30 72 L30 37 L50 59 L70 37 L70 72"
        fill="none"
        stroke="#ff3535"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Checkmark — glow halo */}
      <path
        d="M35 52 L47 66 L77 33"
        fill="none"
        stroke="#ff2020"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.22"
        filter={`url(#${uid}-glow)`}
      />
      {/* Checkmark — dark base */}
      <path
        d="M35 52 L47 66 L77 33"
        fill="none"
        stroke="#7a0a0a"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Checkmark — neon highlight */}
      <path
        d="M35 52 L47 66 L77 33"
        fill="none"
        stroke="#ff4545"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
