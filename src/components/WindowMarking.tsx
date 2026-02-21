import type { WindowType } from "../types/floorplan";

interface WindowMarkingProps {
  canMark: boolean;
  isWindowMode: boolean;
  selectedType: WindowType;
  windowsCount: number;
  selectedWindowId: string | null;
  onToggleWindowMode: () => void;
  onSelectType: (type: WindowType) => void;
  onDeleteSelectedWindow: () => void;
}

const TYPE_OPTIONS: Array<{ type: WindowType; label: string; hint: string }> = [
  { type: "floor", label: "落地窗", hint: "窗底 0.0m / 開口高 2.1m" },
  { type: "normal", label: "一般窗", hint: "窗底 0.9m / 開口高 1.2m" },
  { type: "high", label: "氣窗", hint: "窗底 1.8m / 開口高 0.6m" },
];

export function WindowMarking({
  canMark,
  isWindowMode,
  selectedType,
  windowsCount,
  selectedWindowId,
  onToggleWindowMode,
  onSelectType,
  onDeleteSelectedWindow,
}: WindowMarkingProps) {
  return (
    <div className="window-marking">
      <h3>窗戶標記</h3>
      <p className="calibration-status">
        在畫布中拖曳框選範圍，框到牆段就會自動截取成窗戶。可重複新增多扇窗。
      </p>
      <div className="wall-actions">
        <button type="button" className="btn" onClick={onToggleWindowMode} disabled={!canMark}>
          {isWindowMode ? "停止窗戶模式" : "開始窗戶模式"}
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={onDeleteSelectedWindow}
          disabled={!selectedWindowId}
        >
          刪除選取窗戶
        </button>
      </div>
      <div className="window-type-row">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            className={`window-chip${selectedType === option.type ? " active" : ""}`}
            onClick={() => onSelectType(option.type)}
            disabled={!canMark}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="calibration-status">
        {canMark ? "可直接框選任意區域，不需先選牆段。" : "請先完成比例尺校正並上傳圖片。"}
      </p>
      <p className="calibration-status">窗戶數量：{windowsCount}</p>
    </div>
  );
}
