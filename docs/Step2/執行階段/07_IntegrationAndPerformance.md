# 2.7 執行任務：整合與效能調校

> 前置：完成 `2.6`

## 任務目標

整合幾何、相機、碰撞流程，並達到可用效能與穩定體驗。

---

## 實作步驟

1. 串接資料流：`inputJson -> geometry -> camera -> collision`
2. 建立統一初始化流程與錯誤處理 UI
3. 加入基礎效能監測（FPS/幀時間）
4. 針對瓶頸做 MVP 優化：
   - 合併靜態 mesh
   - 降低不必要重算
   - 只在參數變更時重建幾何

---

## 完成標準

- [ ] 初始化流程可一次完成 3D 場景啟動
- [ ] 正常場景瀏覽流暢（目標 60fps）
- [ ] 錯誤資料可提示且不中斷 UI

---

## 交付建議

- `src/step2/viewer/createViewer.ts`
- `src/step2/viewer/useViewerState.ts`
