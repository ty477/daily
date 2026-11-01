# 日子，也在熠熠生辉 · 日常相册

一个记录平日生活点滴的相册：一条记录 = 几张照片 + AI 写的「生活注脚」+ 你的「我只想说」。
时间流首页、一天可发多条、手机上也能用。

## 网址
https://ty477.github.io/daily/

## 日常使用

- **发一条**：`#/admin` → 选日期/时间（默认现在）→ 一句话（可选）→ 选照片 → 发布。AI 约 1 分钟后写好注脚
- **写感受**：条目页 → 「✍️ 写两句」→ 保存
- **看照片**：列表或条目页点照片 → 灯箱放大（原图）

## 首次配置（每个浏览器一次）

1. 令牌：`#/admin` 粘贴 fine-grained PAT（需勾选本仓库 `daily` 的 Contents 读写；与旅行相册共用同一个令牌也可以，只要它同时授权两个仓库）
2. AI 密钥：仓库 `Settings → Secrets and variables → Actions` 添加：
   - Secret `AI_API_KEY`：智谱/DeepSeek 等任意 OpenAI 兼容服务的 Key
   - Variables（可选）`AI_BASE_URL`、`AI_MODEL`

## 结构

```
content/site.json     站点文案
content/years.json    有数据的年份列表
content/<year>.json   该年全部条目（一条 = 日期/时间/照片/注脚/感受/状态）
photos/<id>/NN.jpg    照片主图（最长边 2560）
photos/<id>/NNs.jpg   缩略图（列表用，加载快）
.github/workflows/generate-notes.yml   AI 注脚工作流
```