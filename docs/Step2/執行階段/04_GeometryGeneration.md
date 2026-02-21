# 2.4 執行任務：2D → 3D 幾何生成

> 前置：完成 `2.1`、`2.2`、`2.3`

## 任務目標

從 Step 1 JSON 生成可渲染的 3D 地板與牆體幾何。

---

## 輸入

- Step 1 JSON（`meta/scale/walls/polygons`）
- `ceilingHeight`
- `wallThickness`

## 輸出

- `floorMesh`
- `wallMeshes[]`
- 幾何錯誤清單（若有）

---

## 實作步驟

1. 讀取並驗證 JSON（欄位、封閉性、座標合法）
2. 以 `polygons` 生成地板 shape geometry
3. 以每段 `walls` 建立牆體（沿牆段方向 + 厚度 + 高度）
4. 將地板與牆體加入場景節點
5. 記錄 mesh 與原始 id 對應（便於偵錯）

---

## 完成標準

- [ ] 地板可正確生成，外框與 2D 一致
- [ ] 牆體厚度與高度符合輸入參數
- [ ] 非法資料可回傳明確錯誤
- [ ] 所有幾何皆基於公尺單位

---

## 交付建議

- `src/step2/geometry/buildFloor.ts`
- `src/step2/geometry/buildWalls.ts`
- `src/step2/geometry/validateInput.ts`
