/** 关于：一句话讲清定位与红线。 */
import { zh } from "../i18n/zh";
import "./AboutDialog.css";

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-head">
          <div className="about-mark" aria-hidden>
            <svg viewBox="0 0 48 48" width="40" height="40">
              <rect x="4" y="4" width="40" height="40" rx="12" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
              <path d="M12 34 L24 13 L36 34" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              <path d="M17.5 27 L30.5 27" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
            </svg>
          </div>
          <div>
            <h3 className="about-title">{zh.about.title}</h3>
            <div className="about-ver num">0.1.0 · 规格 v1.0 · MIT License</div>
          </div>
        </div>
        <p className="about-body">{zh.about.body}</p>
        <div className="about-facts">
          <span className="tag">全中文</span>
          <span className="tag">Windows 优先</span>
          <span className="tag">零联网</span>
          <span className="tag">零 AI</span>
          <span className="tag">不上传数据</span>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>
            {zh.about.close}
          </button>
        </div>
      </div>
    </div>
  );
}
