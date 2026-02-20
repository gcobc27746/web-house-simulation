# 1.6 執行任務：牆線繪製功能

> **前置需求**：必須完成 **1.5 比例尺校正功能** 的實作

## 任務目標

實作牆線繪製工具，讓使用者在平面圖上手動標註牆壁邊緣線段，並自動檢測封閉的多邊形。

---

## 執行步驟

### Step 1：建立牆線繪製組件

**檔案**：`src/components/WallDrawing.tsx`

**必須實作的功能**：

1. **繪製模式切換**
   - 提供「繪製模式」按鈕
   - 在繪製模式下，Canvas 進入牆線繪製狀態

2. **單段繪製**
   - 點擊起點 → 記錄座標（轉換為公尺）
   - 滑鼠移動 → 顯示預覽線段
   - 點擊終點 → 建立牆段物件

3. **連續繪製**
   - 啟用連續繪製模式
   - 前一段的終點自動成為下一段的起點

---

### Step 2：實作座標轉換工具

**檔案**：`src/utils/coordinateConverter.ts`

**必須實作**：

```typescript
// 像素座標轉換為公尺座標
export const pixelToMeter = (
  pixelX: number,
  pixelY: number,
  pixelsPerMeter: number
): { x: number; y: number } => {
  return {
    x: pixelX * pixelsPerMeter,
    y: pixelY * pixelsPerMeter
  };
};

// 公尺座標轉換為像素座標
export const meterToPixel = (
  meterX: number,
  meterY: number,
  pixelsPerMeter: number
): { x: number; y: number } => {
  return {
    x: meterX / pixelsPerMeter,
    y: meterY / pixelsPerMeter
  };
};
```

---

### Step 3：實作吸附功能（Snap）

**檔案**：`src/utils/snapHelper.ts`

**必須實作**：

1. **吸附到端點**
   - 檢查滑鼠位置是否靠近其他牆段的端點
   - 吸附距離閾值：5-10 像素
   - 自動吸附到最近的端點

2. **水平/垂直對齊**
   - 按住 Shift 鍵時，強制水平或垂直對齊
   - 根據起點位置判斷對齊方向

**實作範例**：

```typescript
export const findSnapPoint = (
  currentPoint: { x: number; y: number },
  existingWalls: Array<{ start: { x: number; y: number }, end: { x: number; y: number } }>,
  threshold: number = 10,
  isShiftPressed: boolean = false
): { x: number; y: number } | null => {
  // 檢查是否靠近端點
  for (const wall of existingWalls) {
    const distToStart = Math.sqrt(
      Math.pow(currentPoint.x - wall.start.x, 2) + 
      Math.pow(currentPoint.y - wall.start.y, 2)
    );
    const distToEnd = Math.sqrt(
      Math.pow(currentPoint.x - wall.end.x, 2) + 
      Math.pow(currentPoint.y - wall.end.y, 2)
    );
    
    if (distToStart < threshold) {
      return wall.start;
    }
    if (distToEnd < threshold) {
      return wall.end;
    }
  }
  
  // Shift 鍵強制對齊
  if (isShiftPressed && existingWalls.length > 0) {
    const lastWall = existingWalls[existingWalls.length - 1];
    const dx = Math.abs(currentPoint.x - lastWall.end.x);
    const dy = Math.abs(currentPoint.y - lastWall.end.y);
    
    if (dx < dy) {
      // 水平對齊
      return { x: currentPoint.x, y: lastWall.end.y };
    } else {
      // 垂直對齊
      return { x: lastWall.end.x, y: currentPoint.y };
    }
  }
  
  return null;
};
```

---

### Step 4：建立牆線管理 Hook

**檔案**：`src/hooks/useWallDrawing.ts`

**必須實作**：

1. **狀態管理**
   - `walls`: 牆段陣列
   - `isDrawingMode`: 是否處於繪製模式
   - `currentWall`: 當前正在繪製的牆段
   - `selectedWallId`: 選取的牆段 ID

2. **方法**
   - `startDrawing()`: 開始繪製模式
   - `addWall(start, end)`: 添加牆段
   - `selectWall(id)`: 選取牆段
   - `moveWallEndpoint(wallId, endpoint, newPosition)`: 移動端點
   - `deleteWall(id)`: 刪除牆段
   - `undo()`: 還原操作
   - `redo()`: 重做操作

3. **Polygon 檢測**
   - `detectPolygons()`: 檢測封閉的多邊形
   - `validatePolygon(polygon)`: 驗證多邊形合法性（不自交叉）

**實作範例結構**：

```typescript
import { useState, useCallback } from 'react';

export const useWallDrawing = () => {
  const [walls, setWalls] = useState<Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
  }>>([]);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [history, setHistory] = useState<Array<any>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const addWall = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    const newWall = {
      id: `wall-${Date.now()}`,
      start,
      end
    };
    
    setWalls([...walls, newWall]);
    // 更新歷史記錄
    // 檢測 polygon
  }, [walls]);
  
  const detectPolygons = useCallback(() => {
    // TODO: 實作 polygon 檢測邏輯
    // 1. 找出所有封閉的路徑
    // 2. 提取頂點
    // 3. 驗證不自交叉
  }, [walls]);
  
  return {
    walls,
    isDrawingMode,
    startDrawing: () => setIsDrawingMode(true),
    stopDrawing: () => setIsDrawingMode(false),
    addWall,
    deleteWall: (id: string) => {
      setWalls(walls.filter(w => w.id !== id));
    },
    undo: () => {
      // TODO: 實作 undo
    },
    redo: () => {
      // TODO: 實作 redo
    }
  };
};
```

---

### Step 5：實作 Polygon 檢測算法

**檔案**：`src/utils/polygonDetector.ts`

**必須實作**：

1. **路徑追蹤**
   - 從任意牆段開始，追蹤連接的牆段
   - 找出所有封閉的路徑

2. **頂點提取**
   - 從封閉路徑中提取頂點座標

3. **自交叉檢測**
   - 檢查多邊形是否自交叉
   - 使用線段相交算法

**實作範例**：

```typescript
export const detectClosedPaths = (
  walls: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } }>
): Array<Array<{ x: number; y: number }>> => {
  // TODO: 實作路徑追蹤算法
  // 1. 建立端點到牆段的映射
  // 2. 從任意端點開始追蹤
  // 3. 找出所有封閉路徑
};

export const checkSelfIntersection = (
  vertices: Array<{ x: number; y: number }>
): boolean => {
  // TODO: 實作自交叉檢測
  // 檢查所有邊是否相交
};
```

---

### Step 6：整合到 Canvas 組件

**在 Canvas 組件中整合牆線繪製**：

1. **繪製牆段**
   - 繪製所有牆段
   - 繪製預覽線段（正在繪製中）
   - 高亮選取的牆段

2. **事件處理**
   - 點擊事件：添加牆段端點
   - 滑鼠移動：更新預覽線段
   - 拖曳事件：移動端點

3. **視覺回饋**
   - 端點顯示可拖曳的控制點
   - 封閉 polygon 視覺提示

---

## 完成標準

完成本任務後，必須達成以下標準：

- [ ] 可以切換繪製模式
- [ ] 可以繪製單段牆線
- [ ] 可以連續繪製牆線
- [ ] 吸附功能正常運作（吸附到端點）
- [ ] Shift 鍵強制對齊正常運作
- [ ] 可以選取牆段
- [ ] 可以移動端點
- [ ] 可以刪除牆段
- [ ] Undo/Redo 功能正常
- [ ] 自動檢測封閉 polygon
- [ ] 檢測 polygon 自交叉
- [ ] 所有座標正確轉換為公尺單位

---

## 測試檢查清單

- [ ] 點擊「開始繪製」→ 進入繪製模式
- [ ] 點擊起點和終點 → 牆段正確建立
- [ ] 連續繪製 → 牆段自動連接
- [ ] 靠近端點 → 自動吸附
- [ ] 按住 Shift → 強制水平/垂直對齊
- [ ] 點擊牆段 → 正確選取
- [ ] 拖曳端點 → 牆段位置更新
- [ ] 按 Delete → 牆段刪除
- [ ] 形成封閉路徑 → Polygon 自動生成
- [ ] 自交叉檢測 → 正確提示錯誤

---

## 下一步

完成本任務後，繼續執行：

**1.7** [資料儲存功能](../執行階段/07_Storage.md)

---

## 相關文件

* **先備知識**：[資料格式規範](../先備知識/03_DataFormat.md)
* **驗收標準**：[驗收標準](../執行階段/08_AcceptanceCriteria.md)
