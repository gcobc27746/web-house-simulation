# 2.5 執行任務：第一人稱相機與控制

> 前置：完成 `2.4`

## 任務目標

建立第一人稱相機，提供 WASD 移動與滑鼠視角控制。

---

## 輸入

- 已生成場景（地板/牆體）
- `cameraHeight`（預設 1.7）
- 移動速度、滑鼠靈敏度參數

## 輸出

- 可操作的第一人稱視角
- 控制器狀態（enabled/disabled）

---

## 實作步驟

1. 建立 PerspectiveCamera，初始 `y = cameraHeight`
2. 啟用 Pointer Lock（點擊畫面進入）
3. 實作鍵盤狀態機（WASD）
4. 每幀更新相機位置與朝向
5. 提供 UI 顯示控制提示與重置視角

---

## 完成標準

- [ ] WASD 可前後左右移動
- [ ] 滑鼠可改變視角
- [ ] 相機高度預設為 1.7m 且可調
- [ ] 可重置到初始位置與朝向

---

## 交付建議

- `src/step2/camera/useFirstPersonController.ts`
- `src/step2/camera/pointerLock.ts`
