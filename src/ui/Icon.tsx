/** 线性图标：统一 16×16 视觉栅格、1.3 描边，跟界面同一套克制语言。 */
import type { CSSProperties } from "react";

export type IconName =
  | "select"
  | "direct"
  | "pen"
  | "line"
  | "pencil"
  | "width"
  | "eyedropper"
  | "gradient"
  | "eraser"
  | "scissors"
  | "smooth"
  | "rect"
  | "roundrect"
  | "polygon"
  | "star"
  | "ellipse"
  | "text"
  | "artboard"
  | "hand"
  | "zoom"
  | "eye"
  | "eye-off"
  | "lock"
  | "unlock"
  | "trash"
  | "plus"
  | "undo"
  | "redo"
  | "export"
  | "sun"
  | "moon"
  | "layers"
  | "sliders"
  | "grid"
  | "magnet"
  | "close"
  | "image"
  | "trace"
  | "chevron"
  | "check";

const paths: Record<IconName, React.ReactNode> = {
  select: <path d="M4.2 2.6 12 8.9l-3.9.7 2.2 3.6-1.5.9-2.2-3.7-2.6 2.9z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />,
  direct: (
    <>
      <path d="M4.2 2.6 12 8.9l-3.9.7 2.2 3.6-1.5.9-2.2-3.7-2.6 2.9z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="10.4" y="10.4" width="3.6" height="3.6" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  pen: (
    <>
      <path d="M10.6 2.6 13.4 5.4 6.6 12.2 3.5 12.5 3.8 9.4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.1 4.9l2 2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.4" cy="11.6" r="0.9" fill="currentColor" />
    </>
  ),
  line: (
    <>
      <path d="M3.2 12.8 12.8 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="3.2" cy="12.8" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="12.8" cy="3.2" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  pencil: (
    <>
      <path d="M2.8 10.3c1.2-.1 1.6-2.3 3.1-2.2s1.3 2 2.8 1.7 1.7-2.5 3.2-2.4" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11.6 2.5 13.4 4.3 6.2 11.5l-2.4.6.6-2.4z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </>
  ),
  width: (
    <>
      <path d="M2.3 8.1c1.9-3.1 3.2 4.8 5.4 1.2 1.7-2.8 3.6-2.7 5.9-.3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M6.7 8.2 4.8 6.7M6.7 8.2 4.8 9.7M9.1 8.2 11 6.7M9.1 8.2 11 9.7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
      <circle cx="7.9" cy="8.2" r="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  eyedropper: (
    <>
      <path d="M9.6 4.2 11.8 6.4 6.3 11.9l-3.1.5.5-3.1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.2 2.4a1.8 1.8 0 0 1 2.5 0l1.9 1.9a1.8 1.8 0 0 1 0 2.5l-1.1 1.1-4.4-4.4z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2.4 13.6c.2-1.1.6-1.7 1.5-2.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  gradient: (
    <>
      <rect x="2.8" y="3.2" width="10.4" height="9.6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 10.4 13.2 4.8M2.8 8 10 4.4M4.6 12.8 13.2 8.3M8 12.8l5.2-2.8" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
      <path d="M3.2 12.4 12.9 3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
    </>
  ),
  eraser: (
    <>
      <path d="M3.1 10.3 8.7 4.7a1.3 1.3 0 0 1 1.9 0l2.7 2.7a1.3 1.3 0 0 1 0 1.9L8.5 14H4.9L2.5 11.6z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 7.4 10.6 12M4.3 12.3h7.3" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
    </>
  ),
  scissors: (
    <>
      <circle cx="3.4" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.6" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.9 10.5 11.8 2.4M11.1 10.5 4.2 2.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  smooth: (
    <>
      <path d="M2.1 11c1.6-4.4 3.3 4.4 5.1 0s3.4-4.4 5.1 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12.8" cy="3.6" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  rect: <rect x="2.6" y="3.6" width="10.8" height="8.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  roundrect: <rect x="2.6" y="3.6" width="10.8" height="8.8" rx="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  polygon: <path d="M8 2.4 13.4 6.7 11.4 13 4.6 13 2.6 6.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />,
  star: <path d="m8 2.2 1.75 3.9 4.25.42-3.2 2.86 1 4.14L8 11.4l-3.8 2.12 1-4.14L2 6.52l4.25-.42z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.5" ry="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  text: (
    <>
      <path d="M3.4 4.2h9.2M8 4.2v8.2M5.9 12.4h4.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  artboard: (
    <>
      <rect x="3.2" y="3.4" width="9.6" height="8.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1.6 4.6V3.4h1.2M14.4 4.6V3.4h-1.2M1.6 11.4v1.2h1.2M14.4 11.4v1.2h-1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  hand: <path d="M5.4 8.6V5.2a1 1 0 0 1 2 0v2.6-1.2V4a1 1 0 0 1 2 0v4.2-1.4V5a1 1 0 0 1 2 0v3.6l1.2-.8a1 1 0 0 1 1.4 1.4l-2.6 3.4a3.6 3.6 0 0 1-2.9 1.4H8.2A3.8 3.8 0 0 1 4.4 11V8.6a1 1 0 0 1 2 0z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  zoom: (
    <>
      <circle cx="7" cy="7" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2 13.8 13.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.2 7h3.6M7 5.2v3.6" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 8S4.3 3.8 8 3.8 14.2 8 14.2 8 11.7 12.2 8 12.2 1.8 8 1.8 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M1.8 8S4.3 3.8 8 3.8 14.2 8 14.2 8 11.7 12.2 8 12.2 1.8 8 1.8 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="7" width="8" height="6.4" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="7" width="8" height="6.4" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M11 7V4.8" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
    </>
  ),
  trash: (
    <>
      <path d="M3.4 4.6h9.2M6.2 4.6V3.2h3.6v1.4M4.6 4.6l.6 8.2h5.6l.6-8.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
  plus: <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  undo: <path d="M6.6 4.2 3.4 7.4 6.6 10.6M3.6 7.4h6a3.2 3.2 0 0 1 0 6.4H7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  redo: <path d="M9.4 4.2 12.6 7.4 9.4 10.6M12.4 7.4h-6a3.2 3.2 0 0 0 0 6.4H9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  export: (
    <>
      <path d="M8 2.6v7.4M4.9 7 8 10.1 11.1 7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3 11.6v1.6h10v-1.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.4v1.2M8 13.4v1.2M1.4 8h1.2M13.4 8h1.2M3.2 3.2l.9.9M11.9 11.9l.9.9M12.8 3.2l-.9.9M4.1 11.9l-.9.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  moon: <path d="M12.8 9.8a5.4 5.4 0 0 1-6.6-6.6 5.4 5.4 0 1 0 6.6 6.6Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  layers: (
    <>
      <path d="M8 2.2 14 5.4 8 8.6 2 5.4z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2 8.4 8 11.6 14 8.4M2 11.2 8 14.4 14 11.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6" strokeLinejoin="round" />
    </>
  ),
  sliders: (
    <>
      <path d="M2.6 4.4h10.8M2.6 8h10.8M2.6 11.6h10.8" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <circle cx="5.4" cy="4.4" r="1.6" fill="currentColor" opacity="0.9" />
      <circle cx="10.6" cy="8" r="1.6" fill="currentColor" opacity="0.9" />
      <circle cx="7.2" cy="11.6" r="1.6" fill="currentColor" opacity="0.9" />
    </>
  ),
  grid: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <path d="M6.2 2.6v10.8M9.8 2.6v10.8M2.6 6.2h10.8M2.6 9.8h10.8" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </>
  ),
  magnet: (
    <>
      <path d="M3.4 11.2V7.2a4.6 4.6 0 0 1 9.2 0v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.4 10.2h3.2v-3a1.4 1.4 0 0 1 2.8 0v3h3.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
      <path d="M3.4 7.2v-1.6M12.6 7.2v-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  image: (
    <>
      <rect x="2.6" y="3" width="10.8" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6.4" r="1.1" fill="currentColor" opacity="0.8" />
      <path d="M3.4 11.4 6.8 8.6l2.6 2 1.8-1.4 2.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
  trace: (
    <>
      <path d="M2.4 12.6c2.6 0 3-1.1 3.6-2.6.6-1.5 1.4-2.4 2.6-2.4 1.6 0 1.8-1.4 3.4-1.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.4" cy="10.2" r="1" fill="currentColor" />
      <circle cx="8.4" cy="7.8" r="1" fill="currentColor" />
    </>
  ),
  chevron: <path d="M5.4 6.2 8.4 9.2 11.4 6.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />,
  check: <path d="M3.4 8.4 6.4 11.2 12.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
};

interface Props {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export default function Icon({ name, size = 16, style, className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={style} className={className} aria-hidden focusable="false">
      {paths[name]}
    </svg>
  );
}
