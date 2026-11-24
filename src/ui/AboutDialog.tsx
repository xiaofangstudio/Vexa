/** 关于：一句话讲清定位与红线。 */
import { zh } from "../i18n/zh";
import BrandMark from "./BrandMark";
import "./AboutDialog.css";

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-head">
          <div className="about-mark">
            <BrandMark size={40} />
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
