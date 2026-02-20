# 1.4 執行任務：圖片上傳功能

> **前置需求**：必須先閱讀並理解「先備知識」資料夾中的所有文件

## 任務目標

實作圖片上傳功能，讓使用者可以上傳平面圖圖片（JPG/PNG），並在 Canvas 畫布中顯示。

---

## 執行步驟

### Step 1：建立專案結構

1. **建立 React 專案**（如果尚未建立）
   ```bash
   npx create-react-app floorplan-editor
   cd floorplan-editor
   ```

2. **安裝依賴**（根據技術規格選擇繪圖庫）
   ```bash
   # 如果選擇 Konva.js
   npm install konva react-konva
   
   # 或選擇 Fabric.js
   npm install fabric
   ```

3. **建立檔案結構**
   ```
   src/
   ├── components/
   │   ├── ImageUpload.tsx        # 圖片上傳組件
   │   └── Canvas.tsx             # Canvas 畫布組件
   ├── hooks/
   │   └── useImageUpload.ts      # 圖片上傳邏輯 Hook
   ├── types/
   │   └── floorplan.ts           # 資料型別定義
   └── App.tsx
   ```

---

### Step 2：定義資料型別

**檔案**：`src/types/floorplan.ts`

```typescript
// 根據先備知識/03_DataFormat.md 定義
export interface FloorplanData {
  meta: {
    version: string;
    createdAt: string;
    updatedAt: string;
  };
  scale?: {
    pixelsPerMeter: number;
    referenceDistance: number;
    referencePixels: number;
  };
  image?: {
    width: number;
    height: number;
    filename: string;
  };
  walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
  }>;
  polygons: Array<{
    id: string;
    vertices: Array<{ x: number; y: number }>;
    closed: boolean;
  }>;
}
```

---

### Step 3：實作圖片上傳組件

**檔案**：`src/components/ImageUpload.tsx`

**必須實作的功能**：

1. **檔案選擇器**
   - 使用 `<input type="file" accept="image/jpeg,image/png" />`
   - 支援拖放上傳（Drag & Drop）

2. **檔案驗證**
   - 檢查檔案格式（只接受 JPG/PNG）
   - 檢查檔案大小（建議限制 10MB）
   - 顯示錯誤訊息

3. **圖片載入**
   - 使用 `URL.createObjectURL()` 或 `FileReader` 載入圖片
   - 建立 Image 物件並等待載入完成

4. **圖片資訊提取**
   - 取得圖片寬度、高度
   - 取得檔案名稱
   - 儲存至資料結構的 `image` 欄位

**實作範例結構**：

```typescript
import React, { useState } from 'react';

interface ImageUploadProps {
  onImageLoad: (image: HTMLImageElement, filename: string) => void;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImageLoad }) => {
  // TODO: 實作檔案選擇器
  // TODO: 實作拖放上傳
  // TODO: 實作檔案驗證
  // TODO: 實作圖片載入
  // TODO: 呼叫 onImageLoad 回調
  
  return (
    <div>
      {/* TODO: 實作 UI */}
    </div>
  );
};
```

---

### Step 4：實作 Canvas 畫布組件

**檔案**：`src/components/Canvas.tsx`

**必須實作的功能**：

1. **Canvas 初始化**
   - 使用 useRef 取得 Canvas 引用
   - 設定 Canvas 尺寸（適應圖片尺寸）

2. **圖片顯示**
   - 將上傳的圖片繪製到 Canvas
   - 保持原始寬高比
   - 圖片應完整顯示在可見區域內

3. **圖片操作**
   - 支援圖片拖曳定位（mousedown, mousemove, mouseup）
   - 支援圖片縮放（滑鼠滾輪或縮放控制）
   - 記錄圖片位置與縮放比例

**實作範例結構**：

```typescript
import React, { useRef, useEffect } from 'react';

interface CanvasProps {
  image: HTMLImageElement | null;
}

export const Canvas: React.FC<CanvasProps> = ({ image }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    // TODO: 繪製圖片到 Canvas
  }, [image]);
  
  // TODO: 實作拖曳功能
  // TODO: 實作縮放功能
  
  return <canvas ref={canvasRef} />;
};
```

---

### Step 5：整合到主應用程式

**檔案**：`src/App.tsx`

**必須實作**：

1. 整合 ImageUpload 和 Canvas 組件
2. 管理圖片狀態
3. 更新資料結構的 `image` 欄位

---

## 完成標準

完成本任務後，必須達成以下標準：

- [ ] 使用者可以透過檔案選擇器上傳圖片
- [ ] 使用者可以透過拖放上傳圖片
- [ ] 上傳的圖片正確顯示在 Canvas 中
- [ ] 圖片保持原始寬高比
- [ ] 支援圖片拖曳定位
- [ ] 支援圖片縮放
- [ ] 檔案格式驗證正常運作
- [ ] 錯誤訊息正確顯示
- [ ] 圖片資訊（width, height, filename）正確儲存

---

## 測試檢查清單

- [ ] 上傳 JPG 格式圖片 → 成功顯示
- [ ] 上傳 PNG 格式圖片 → 成功顯示
- [ ] 上傳非圖片檔案 → 顯示錯誤訊息
- [ ] 上傳過大檔案 → 顯示錯誤訊息
- [ ] 拖放圖片到上傳區域 → 成功上傳
- [ ] 拖曳圖片 → 圖片位置改變
- [ ] 滾輪縮放 → 圖片大小改變
- [ ] 重新載入頁面 → 圖片資訊正確恢復（如果已實作 LocalStorage）

---

## 下一步

完成本任務後，繼續執行：

**1.5** [比例尺校正功能](../執行階段/05_ScaleCalibration.md)

---

## 相關文件

* **先備知識**：[資料格式規範](../先備知識/03_DataFormat.md)
* **先備知識**：[技術規格](../先備知識/02_TechnicalSpec.md)
