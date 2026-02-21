import type { ReactNode } from "react";

interface WallDrawingProps {
  canDraw: boolean;
  isDrawingMode: boolean;
  isContinuousMode: boolean;
  wallsCount: number;
  polygonsCount: number;
  selectedWallId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onToggleDrawingMode: () => void;
  onToggleContinuousMode: (enabled: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  windowControls?: ReactNode;
}

export function WallDrawing({
  canDraw,
  isDrawingMode,
  isContinuousMode,
  wallsCount,
  polygonsCount,
  selectedWallId,
  canUndo,
  canRedo,
  onToggleDrawingMode,
  onToggleContinuousMode,
  onUndo,
  onRedo,
  onDeleteSelected,
  windowControls,
}: WallDrawingProps) {
  return (
    <section className="panel">
      <h2>1.6 牆線繪製</h2>
      <p>完成比例尺後即可開始繪製牆段，資料會以公尺單位儲存。</p>

      <div className="wall-actions">
        <button type="button" className="btn" onClick={onToggleDrawingMode} disabled={!canDraw}>
          {isDrawingMode ? "停止繪製" : "開始繪製"}
        </button>
        <label className="wall-checkbox">
          <input
            type="checkbox"
            checked={isContinuousMode}
            onChange={(event) => onToggleContinuousMode(event.target.checked)}
            disabled={!canDraw}
          />
          連續繪製
        </label>
      </div>

      <div className="wall-actions">
        <button type="button" className="btn" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="btn" onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={onDeleteSelected}
          disabled={!selectedWallId}
        >
          刪除選取牆段
        </button>
      </div>

      <p className="calibration-status">
        {canDraw
          ? isDrawingMode
            ? "繪製模式中：點擊設定起點/終點，Shift 可強制水平或垂直。"
            : "目前未在繪製模式。"
          : "請先完成比例尺校正。"}
      </p>
      <p className="calibration-status">
        牆段數量：{wallsCount}｜封閉 polygon：{polygonsCount}
      </p>
      <p className="calibration-status">
        {selectedWallId ? `已選取：${selectedWallId}` : "尚未選取牆段"}
      </p>

      {windowControls}
    </section>
  );
}
