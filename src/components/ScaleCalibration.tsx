import type { FloorplanScale } from "../types/floorplan";

interface ScaleCalibrationProps {
  canCalibrate: boolean;
  isCalibrationMode: boolean;
  measurementPointsCount: number;
  pixelDistance: number | null;
  scale: FloorplanScale | null;
  onStartCalibration: () => void;
  onResetCalibration: () => void;
}

const measurementStatusText = (count: number, isCalibrationMode: boolean) => {
  if (!isCalibrationMode) return "目前未在校正模式。";
  if (count === 0) return "請點擊第一個量測點。";
  if (count === 1) return "請點擊第二個量測點。";
  return "已取得兩點，請輸入真實距離。";
};

export function ScaleCalibration({
  canCalibrate,
  isCalibrationMode,
  measurementPointsCount,
  pixelDistance,
  scale,
  onStartCalibration,
  onResetCalibration,
}: ScaleCalibrationProps) {
  return (
    <section className="panel">
      <h2>1.5 比例尺校正</h2>
      <p>先點兩個已知距離的點，再輸入該距離的真實公尺數。</p>

      <div className="calibration-actions">
        <button
          type="button"
          className="btn"
          onClick={onStartCalibration}
          disabled={!canCalibrate}
        >
          {isCalibrationMode ? "重新開始量測" : "開始校正"}
        </button>
        <button type="button" className="btn btn-link" onClick={onResetCalibration}>
          清除校正
        </button>
      </div>

      <p className="calibration-status">
        {canCalibrate ? measurementStatusText(measurementPointsCount, isCalibrationMode) : "請先上傳圖片。"}
      </p>

      {pixelDistance !== null && (
        <p className="calibration-status">目前量測：{pixelDistance.toFixed(2)} px</p>
      )}

      {scale && (
        <div className="calibration-result">
          <strong>目前比例：</strong>1px = {scale.pixelsPerMeter.toFixed(4)}m
          <br />
          參考：{scale.referencePixels.toFixed(2)}px = {scale.referenceDistance.toFixed(2)}m
        </div>
      )}
    </section>
  );
}
