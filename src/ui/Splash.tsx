/*
 * Vexa 启动页 —— 应用正常启动的第一屏。
 * 大厂式布局：背景图 + 左侧黑色渐晕保白字可读 + 超粗应用名 + 加载步骤。
 * 节奏放慢，整屏约 4 秒后淡出，7 秒硬兜底。
 */
import { useEffect, useState } from "react";
import bg from "../assets/splash-bg.jpg";
import { zh } from "../i18n/zh";
import BrandMark from "./BrandMark";
import "./Splash.css";

const STEPS = zh.splash.steps;
const STEP_MS = 620;
const HOLD_MS = 400;
const FADE_MS = 600;

export default function Splash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      const fontsReady = Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(1200)]);
      for (let i = 0; i < STEPS.length; i++) {
        await wait(STEP_MS);
        if (cancelled) return;
        setStep(i + 1);
      }
      await fontsReady;
      if (cancelled) return;
      await wait(HOLD_MS);
      if (cancelled) return;
      setFading(true);
      await wait(FADE_MS);
      if (!cancelled) onDone();
    })();

    const hardStop = setTimeout(() => {
      if (!cancelled) onDone();
    }, 7000);

    return () => {
      cancelled = true;
      clearTimeout(hardStop);
    };
  }, [onDone]);

  const pct = Math.round((step / STEPS.length) * 100);

  return (
    <div className={"splash" + (fading ? " splash--fading" : "")}>
      <img className="splash-bg" src={bg} alt="" draggable={false} />
      <div className="splash-scrim" />
      <div className="splash-inner">
        <div className="splash-mark">
          <BrandMark size={44} />
        </div>
        <div className="splash-name">Vexa</div>
        <div className="splash-meta">{zh.splash.meta}</div>
        <div className="splash-slogan">拉线成形，编排成图。</div>
        <div className="splash-loading">
          <span>{STEPS[Math.min(step, STEPS.length - 1)]}…</span>
          <span className="splash-pct num">{pct}%</span>
        </div>
        <div className="splash-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="splash-foot num">小方工作室 · MIT License · 零联网</div>
    </div>
  );
}
