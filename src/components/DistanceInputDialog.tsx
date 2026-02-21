import { FormEvent, useEffect, useState } from "react";

interface DistanceInputDialogProps {
  isOpen: boolean;
  pixelDistance: number | null;
  onConfirm: (distance: number) => boolean;
  onCancel: () => void;
}

export function DistanceInputDialog({
  isOpen,
  pixelDistance,
  onConfirm,
  onCancel,
}: DistanceInputDialogProps) {
  const [value, setValue] = useState("0.9");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue("0.9");
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const distance = Number.parseFloat(value);
    if (!Number.isFinite(distance) || distance <= 0) {
      setError("請輸入大於 0 的距離（公尺）。");
      return;
    }

    const success = onConfirm(distance);
    if (!success) {
      setError("比例計算失敗，請重新選擇兩個不同的量測點。");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true">
        <h3>輸入真實距離</h3>
        <p>請輸入剛剛量測線段的真實長度（單位：公尺）。</p>
        {pixelDistance !== null && (
          <p className="dialog-hint">量測像素距離：{pixelDistance.toFixed(2)} px</p>
        )}

        <form onSubmit={handleSubmit} className="dialog-form">
          <label htmlFor="realDistance">真實距離（m）</label>
          <input
            id="realDistance"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />

          {error && <div className="error-box">{error}</div>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-link" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn">
              確認
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
