# 1.5 執行任務：比例尺校正功能

> **前置需求**：必須完成 **1.4 圖片上傳功能** 的實作

## 任務目標

實作比例尺校正工具，讓使用者透過量測已知距離（例如門寬 90cm）來建立像素與公尺的轉換比例。

---

## 執行步驟

### Step 1：建立比例尺校正組件

**檔案**：`src/components/ScaleCalibration.tsx`

**必須實作的功能**：

1. **校正工具模式切換**
   - 提供按鈕切換「校正模式」
   - 在校正模式下，Canvas 進入量測狀態

2. **兩點量測**
   - 使用者點擊第一點 → 記錄座標
   - 使用者點擊第二點 → 記錄座標
   - 顯示量測線（視覺回饋）
   - 計算兩點之間的像素距離

3. **輸入真實距離**
   - 彈出輸入框讓使用者輸入真實距離（公尺）
   - 驗證輸入格式（必須為正數）

4. **計算比例**
   - 使用公式：`pixelsPerMeter = referenceDistance / referencePixels`
   - 更新資料結構的 `scale` 欄位

5. **顯示比例資訊**
   - 顯示目前縮放比例（例如：`1px = 0.0032m`）
   - 顯示量測線長度（px 與 m 同時顯示）

---

### Step 2：實作量測線繪製

**在 Canvas 組件中新增功能**：

1. **量測線繪製**
   - 當處於校正模式時，繪製量測線
   - 顯示起點、終點標記
   - 顯示距離標籤（px 和 m）

2. **視覺回饋**
   - 量測線顏色：建議使用明顯的顏色（例如紅色）
   - 線條粗細：2-3px
   - 端點標記：圓形或方形

**實作範例**：

```typescript
// 在 Canvas 組件中
const drawMeasurementLine = (
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  pixelsPerMeter?: number
) => {
  // 繪製線段
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  
  // 繪製端點
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
  ctx.fill();
  
  // 計算距離並顯示
  const pixelDistance = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );
  
  if (pixelsPerMeter) {
    const meterDistance = pixelDistance * pixelsPerMeter;
    // 顯示標籤：`${pixelDistance.toFixed(0)}px = ${meterDistance.toFixed(2)}m`
  }
};
```

---

### Step 3：建立比例尺 Hook

**檔案**：`src/hooks/useScaleCalibration.ts`

**必須實作**：

1. **狀態管理**
   - `isCalibrationMode`: 是否處於校正模式
   - `measurementPoints`: 量測點陣列（最多 2 個）
   - `scale`: 比例尺資訊

2. **方法**
   - `startCalibration()`: 開始校正模式
   - `addMeasurementPoint(point)`: 添加量測點
   - `calculateScale(realDistance)`: 計算比例
   - `resetCalibration()`: 重置校正

**實作範例**：

```typescript
import { useState } from 'react';

export const useScaleCalibration = () => {
  const [isCalibrationMode, setIsCalibrationMode] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<Array<{x: number, y: number}>>([]);
  const [scale, setScale] = useState<{
    pixelsPerMeter: number;
    referenceDistance: number;
    referencePixels: number;
  } | null>(null);
  
  const startCalibration = () => {
    setIsCalibrationMode(true);
    setMeasurementPoints([]);
  };
  
  const addMeasurementPoint = (point: { x: number; y: number }) => {
    if (measurementPoints.length < 2) {
      setMeasurementPoints([...measurementPoints, point]);
    }
  };
  
  const calculateScale = (realDistance: number) => {
    if (measurementPoints.length === 2) {
      const [start, end] = measurementPoints;
      const pixelDistance = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
      
      const pixelsPerMeter = realDistance / pixelDistance;
      
      setScale({
        pixelsPerMeter,
        referenceDistance: realDistance,
        referencePixels: pixelDistance
      });
      
      setIsCalibrationMode(false);
    }
  };
  
  return {
    isCalibrationMode,
    measurementPoints,
    scale,
    startCalibration,
    addMeasurementPoint,
    calculateScale,
    resetCalibration: () => {
      setIsCalibrationMode(false);
      setMeasurementPoints([]);
      setScale(null);
    }
  };
};
```

---

### Step 4：整合到 Canvas 組件

**在 Canvas 組件中整合比例尺校正**：

1. **點擊事件處理**
   - 當處於校正模式時，點擊 Canvas 添加量測點
   - 當有 2 個點時，顯示輸入框

2. **繪製量測線**
   - 當有量測點時，繪製量測線
   - 顯示距離資訊

---

### Step 5：建立輸入對話框組件

**檔案**：`src/components/DistanceInputDialog.tsx`

**必須實作**：

1. 輸入框（數字輸入，單位：公尺）
2. 確認按鈕
3. 取消按鈕
4. 輸入驗證（必須 > 0）

---

## 完成標準

完成本任務後，必須達成以下標準：

- [ ] 可以切換校正模式
- [ ] 在校正模式下點擊兩點進行量測
- [ ] 量測線正確顯示
- [ ] 可以輸入真實距離
- [ ] 比例正確計算
- [ ] 比例資訊正確顯示
- [ ] 比例資訊正確儲存至資料結構
- [ ] 支援多次校正（重新計算比例）
- [ ] 可以清除校正結果

---

## 測試檢查清單

- [ ] 點擊「開始校正」→ 進入校正模式
- [ ] 點擊第一點 → 顯示端點標記
- [ ] 點擊第二點 → 顯示量測線
- [ ] 輸入 0.9（公尺）→ 比例正確計算
- [ ] 顯示比例資訊 → `1px = X.XXXXm` 格式正確
- [ ] 再次量測其他距離 → 誤差 < 2-3cm
- [ ] 清除校正 → 比例資訊重置

---

## 下一步

完成本任務後，繼續執行：

**1.6** [牆線繪製功能](../執行階段/06_WallDrawing.md)

---

## 相關文件

* **先備知識**：[資料格式規範](../先備知識/03_DataFormat.md)
* **驗收標準**：[驗收標準](../執行階段/08_AcceptanceCriteria.md)
