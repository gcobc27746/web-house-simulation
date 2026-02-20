# 1.2 Step 1 技術規格

## 技術棧

* **前端框架**：React
* **繪圖技術**：Canvas API 或繪圖庫（如 Fabric.js、Konva.js）
* **資料格式**：JSON
* **本地儲存**：LocalStorage API

---

## 技術選型建議

### 繪圖庫選擇

建議使用以下其中一種：

* **Konva.js**：2D Canvas 庫，適合 React 整合（react-konva）
* **Fabric.js**：功能豐富的 Canvas 庫，適合複雜的繪圖操作
* **原生 Canvas API**：輕量級，但需要自行實作更多功能

### React 整合

* 使用 React Hooks 管理狀態
* 考慮使用 Context API 管理全域編輯狀態
* 使用 useRef 管理 Canvas 引用

---

## 瀏覽器支援

* Chrome/Edge（最新版本）
* Firefox（最新版本）
* Safari（最新版本）

---

## 性能要求

* Canvas 渲染應保持 60fps
* 大量牆段（>100 條）時仍保持流暢操作
* LocalStorage 操作不應阻塞 UI

---

## 相關文件

* **1.1** [概述](./01_Overview.md)
* **1.3** [資料格式規範](./03_DataFormat.md)
