# 1.3 Step 1 資料格式規範

## JSON 資料結構定義

```json
{
  "meta": {
    "version": "1.0.0",
    "createdAt": "2026-02-20T10:30:00Z",
    "updatedAt": "2026-02-20T11:45:00Z"
  },
  "scale": {
    "pixelsPerMeter": 0.0032,
    "referenceDistance": 0.9,
    "referencePixels": 281
  },
  "image": {
    "width": 1920,
    "height": 1080,
    "filename": "floorplan.jpg"
  },
  "walls": [
    {
      "id": "wall-1",
      "start": {
        "x": 2.5,
        "y": 1.2
      },
      "end": {
        "x": 5.8,
        "y": 1.2
      }
    },
    {
      "id": "wall-2",
      "start": {
        "x": 5.8,
        "y": 1.2
      },
      "end": {
        "x": 5.8,
        "y": 4.5
      }
    }
  ],
  "polygons": [
    {
      "id": "room-1",
      "vertices": [
        { "x": 2.5, "y": 1.2 },
        { "x": 5.8, "y": 1.2 },
        { "x": 5.8, "y": 4.5 },
        { "x": 2.5, "y": 4.5 }
      ],
      "closed": true
    }
  ]
}
```

---

## 欄位說明

### meta（中繼資料）

* `version`：JSON 格式版本號（語義化版本，例如 "1.0.0"）
* `createdAt`：建立時間（ISO 8601 格式，UTC 時區）
* `updatedAt`：最後更新時間（ISO 8601 格式，UTC 時區）

### scale（比例尺資訊）

* `pixelsPerMeter`：像素到公尺的轉換比例（px/m），計算公式：`referenceDistance / referencePixels`
* `referenceDistance`：校正時使用的參考距離（公尺）
* `referencePixels`：校正時量測的像素距離

### image（圖片資訊）

* `width`：圖片寬度（像素）
* `height`：圖片高度（像素）
* `filename`：原始檔名

### walls（牆壁邊緣線段陣列）

每個牆段物件包含：

* `id`：唯一識別碼（字串）
* `start`：線段起點座標
  * `x`：X 座標（公尺）
  * `y`：Y 座標（公尺）
* `end`：線段終點座標
  * `x`：X 座標（公尺）
  * `y`：Y 座標（公尺）

### polygons（封閉的多邊形區域）

每個多邊形物件包含：

* `id`：唯一識別碼（字串）
* `vertices`：頂點陣列（公尺單位）
  * 每個頂點包含 `x` 和 `y` 座標
* `closed`：是否為封閉多邊形（布林值）

---

## 座標系統

### 定義

* **原點**：圖片左上角為 (0, 0)
* **X 軸**：向右為正
* **Y 軸**：向下為正
* **單位**：所有座標值均為公尺（m）

### 座標轉換

從像素座標轉換為公尺座標：

```
meterX = pixelX * pixelsPerMeter
meterY = pixelY * pixelsPerMeter
```

從公尺座標轉換為像素座標：

```
pixelX = meterX / pixelsPerMeter
pixelY = meterY / pixelsPerMeter
```

---

## 資料驗證規則

1. `meta.version` 必須符合語義化版本格式（例如 "1.0.0"）
2. `meta.createdAt` 和 `meta.updatedAt` 必須為有效的 ISO 8601 格式
3. `scale.pixelsPerMeter` 必須大於 0
4. `walls` 陣列中的每個牆段必須有唯一的 `id`
5. `polygons` 陣列中的每個多邊形必須有唯一的 `id`
6. 多邊形的 `vertices` 陣列至少需要 3 個頂點
7. 所有座標值必須為有效的數字

---

## 相關文件

* **1.1** [概述](./01_Overview.md)
* **1.2** [技術規格](./02_TechnicalSpec.md)
