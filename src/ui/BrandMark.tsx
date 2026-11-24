/** 全局品牌标记：与 assets/brand/vexa-icon.svg、应用图标使用同一套几何。 */
interface Props {
  size?: number;
  className?: string;
}

export default function BrandMark({ size = 26, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden
      focusable="false"
      style={{ display: "block" }}
    >
      <rect x="40" y="40" width="944" height="944" rx="226" fill="#2D5AF7" />
      <g transform="rotate(-2.5 512 512)">
        <rect x="220" y="220" width="600" height="600" rx="96" fill="#0D2E8C" />
      </g>
      <g transform="rotate(-7.5 512 512)">
        <rect x="206" y="206" width="600" height="600" rx="96" fill="#FFF5E1" />
        <path
          d="M300 318 L512 706 L724 318"
          fill="none"
          stroke="#111319"
          strokeWidth="106"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="271" y="289" width="58" height="58" rx="12" fill="#FFF5E1" stroke="#111319" strokeWidth="9" />
        <rect x="695" y="289" width="58" height="58" rx="12" fill="#FFF5E1" stroke="#111319" strokeWidth="9" />
        <circle cx="512" cy="706" r="43" fill="#FF6247" stroke="#111319" strokeWidth="9" />
      </g>
    </svg>
  );
}
