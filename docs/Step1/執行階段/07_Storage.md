# 1.7 執行任務：資料儲存功能

> **前置需求**：必須完成 **1.4 圖片上傳**、**1.5 比例尺校正**、**1.6 牆線繪製** 的實作

## 任務目標

實作兩種資料儲存機制：本地自動儲存（LocalStorage）與 JSON 匯出/匯入功能。

---

## 執行步驟

### Step 1：建立資料儲存 Hook

**檔案**：`src/hooks/useFloorplanStorage.ts`

**必須實作的功能**：

1. **LocalStorage 自動儲存**
   - 每次資料變更時自動儲存
   - 使用防抖（debounce）避免過度儲存
   - 儲存鍵值：`floorplan-editor-data`

2. **資料載入**
   - 頁面載入時自動從 LocalStorage 讀取
   - 驗證資料格式
   - 恢復編輯狀態

3. **JSON 匯出**
   - 產生完整的 JSON 資料結構
   - 包含 `meta` 資訊（version, createdAt, updatedAt）
   - 觸發下載

4. **JSON 匯入**
   - 讀取 JSON 檔案
   - 驗證資料格式
   - 載入資料

**實作範例**：

```typescript
import { useEffect, useCallback } from 'react';
import { FloorplanData } from '../types/floorplan';

const STORAGE_KEY = 'floorplan-editor-data';

export const useFloorplanStorage = (
  data: FloorplanData,
  setData: (data: FloorplanData) => void
) => {
  // LocalStorage 自動儲存
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        const jsonData = JSON.stringify({
          ...data,
          meta: {
            ...data.meta,
            updatedAt: new Date().toISOString()
          }
        });
        localStorage.setItem(STORAGE_KEY, jsonData);
      } catch (error) {
        console.error('儲存失敗:', error);
        // TODO: 顯示錯誤訊息給使用者
      }
    }, 500); // 防抖 500ms
    
    return () => clearTimeout(timeoutId);
  }, [data]);
  
  // 頁面載入時讀取
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        // TODO: 驗證資料格式
        setData(parsed);
      }
    } catch (error) {
      console.error('讀取失敗:', error);
    }
  }, [setData]);
  
  // JSON 匯出
  const exportJSON = useCallback(() => {
    const exportData = {
      ...data,
      meta: {
        ...data.meta,
        updatedAt: new Date().toISOString()
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floorplan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);
  
  // JSON 匯入
  const importJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        // TODO: 驗證資料格式
        // TODO: 檢查版本相容性
        setData(imported);
      } catch (error) {
        console.error('匯入失敗:', error);
        // TODO: 顯示錯誤訊息
      }
    };
    reader.readAsText(file);
  }, [setData]);
  
  return {
    exportJSON,
    importJSON
  };
};
```

---

### Step 2：建立資料驗證工具

**檔案**：`src/utils/dataValidator.ts`

**必須實作**：

```typescript
import { FloorplanData } from '../types/floorplan';

export const validateFloorplanData = (data: any): data is FloorplanData => {
  // 1. 檢查必要欄位
  if (!data.meta || !data.meta.version) {
    return false;
  }
  
  // 2. 檢查版本格式
  if (!/^\d+\.\d+\.\d+$/.test(data.meta.version)) {
    return false;
  }
  
  // 3. 檢查時間格式
  if (!data.meta.createdAt || !data.meta.updatedAt) {
    return false;
  }
  
  // 4. 檢查 scale（如果存在）
  if (data.scale) {
    if (data.scale.pixelsPerMeter <= 0) {
      return false;
    }
  }
  
  // 5. 檢查 walls 陣列
  if (!Array.isArray(data.walls)) {
    return false;
  }
  
  // 6. 檢查每個牆段的格式
  for (const wall of data.walls) {
    if (!wall.id || !wall.start || !wall.end) {
      return false;
    }
    if (typeof wall.start.x !== 'number' || typeof wall.start.y !== 'number') {
      return false;
    }
    if (typeof wall.end.x !== 'number' || typeof wall.end.y !== 'number') {
      return false;
    }
  }
  
  // 7. 檢查 polygons 陣列
  if (!Array.isArray(data.polygons)) {
    return false;
  }
  
  // 8. 檢查每個 polygon 的格式
  for (const polygon of data.polygons) {
    if (!polygon.id || !Array.isArray(polygon.vertices)) {
      return false;
    }
    if (polygon.vertices.length < 3) {
      return false;
    }
  }
  
  return true;
};
```

---

### Step 3：建立匯出/匯入 UI 組件

**檔案**：`src/components/StorageControls.tsx`

**必須實作**：

1. **匯出按鈕**
   - 點擊後觸發 JSON 匯出
   - 顯示成功訊息

2. **匯入按鈕**
   - 點擊後開啟檔案選擇器
   - 選擇 JSON 檔案後觸發匯入
   - 顯示驗證結果

3. **清除資料按鈕**
   - 清除 LocalStorage 中的資料
   - 確認對話框

**實作範例**：

```typescript
import React, { useRef } from 'react';

interface StorageControlsProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}

export const StorageControls: React.FC<StorageControlsProps> = ({
  onExport,
  onImport,
  onClear
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
  };
  
  return (
    <div>
      <button onClick={onExport}>匯出 JSON</button>
      <button onClick={handleImportClick}>匯入 JSON</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button onClick={onClear}>清除資料</button>
    </div>
  );
};
```

---

### Step 4：整合到主應用程式

**在 App.tsx 中整合**：

1. 使用 `useFloorplanStorage` Hook
2. 整合 `StorageControls` 組件
3. 處理錯誤訊息顯示

---

## 完成標準

完成本任務後，必須達成以下標準：

- [ ] 編輯操作後自動儲存至 LocalStorage
- [ ] 重新載入頁面時自動恢復資料
- [ ] 可以匯出 JSON 檔案
- [ ] 匯出的 JSON 格式正確
- [ ] 可以匯入 JSON 檔案
- [ ] 匯入時驗證資料格式
- [ ] 版本不相容時顯示錯誤訊息
- [ ] 可以清除本地資料
- [ ] 錯誤處理正確運作

---

## 測試檢查清單

- [ ] 上傳圖片後 → LocalStorage 有資料
- [ ] 校正比例後 → LocalStorage 更新
- [ ] 繪製牆線後 → LocalStorage 更新
- [ ] 重新載入頁面 → 資料正確恢復
- [ ] 點擊「匯出 JSON」→ 檔案下載
- [ ] 檢查匯出的 JSON → 格式正確
- [ ] 匯入 JSON 檔案 → 資料正確載入
- [ ] 匯入格式錯誤的 JSON → 顯示錯誤訊息
- [ ] 清除資料 → LocalStorage 清空

---

## 下一步

完成本任務後，繼續執行：

**1.8** [驗收標準](../執行階段/08_AcceptanceCriteria.md)

---

## 相關文件

* **先備知識**：[資料格式規範](../先備知識/03_DataFormat.md)
* **驗收標準**：[驗收標準](../執行階段/08_AcceptanceCriteria.md)
