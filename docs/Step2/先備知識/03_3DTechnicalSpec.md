# 2.3 Step 2 3D 技術規格

## 建議技術

- 3D 引擎：Three.js（或 React Three Fiber）
- 控制器：Pointer Lock + WASD
- 碰撞：先做簡化 AABB / 平面區域阻擋（MVP）

---

## 座標與單位

- 全部使用公尺（m）
- 地板位於 `y = 0`
- 牆體沿 `y` 軸向上拉伸（高度 = `ceilingHeight`)

---

## 生成策略（MVP）

1. 由 `polygons` 生成地板 mesh
2. 由 `walls` + `wallThickness` 生成牆體 mesh
3. 相機高度固定預設 `1.7m`，允許調整

---

## 渲染與互動要求

- 目標 60fps（一般場景）
- WASD 移動 + 滑鼠視角
- 避免穿牆（至少阻擋牆體）

---

## 非目標（MVP 不做）

- 自動辨識門窗
- 光影擬真與材質系統
- 複雜物理引擎
