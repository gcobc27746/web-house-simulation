# 2.2 Step 2 輸入資料契約

## 目的

定義 Step 2 讀取 Step 1 JSON 時的最低必備欄位，確保 3D 生成可預期。

---

## 必備欄位

1. `scale`
   - `pixelsPerMeter`
   - `referenceDistance`
   - `referencePixels`
2. `walls`
   - 每段包含 `id`, `start(x,y)`, `end(x,y)`
3. `polygons`
   - 每個 polygon 包含 `id`, `vertices[]`, `closed`
4. `meta`
   - `version`, `createdAt`, `updatedAt`

---

## Step 2 內部補充參數（非 Step 1 必須輸入）

- `ceilingHeight`（預設建議 2.8m）
- `wallThickness`（預設建議 0.12m）
- `cameraHeight`（預設 1.7m）

以上可由 Step 2 UI 讓使用者輸入，或以 preset 給定。

---

## 驗證規則

- 所有點座標需為數字，且單位為公尺
- `polygons[].vertices.length >= 3`
- `polygons[].closed = true` 才可用於地板生成
- `pixelsPerMeter > 0`

---

## 失敗處理

- 欄位缺失：阻擋生成並顯示缺失欄位
- 幾何非法（自交、未封閉）：阻擋生成並標示原因
- 版本不相容：提示支援版本範圍
