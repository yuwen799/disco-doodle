# 来蹦迪 DISCO DOODLE

画个小人，丢进 90 年代舞池。灵感来自 drawafish.com（代码为全新实现）。

## 跑起来

```bash
node server.js        # 默认 http://localhost:3090 ，零依赖，Node 16+
```

同一个 Wi-Fi 下的朋友打开 `http://<你的电脑IP>:3090` 就能一起蹦。

## 部署上线（还没发布）

两种形态：

- **联网版**（多人一起玩）：需要常驻的 `node server.js`，负责存小人和实时推送。仓库带了 `render.yaml`，可以部署到 Render 这类能跑 Node 的平台。免费档会休眠，磁盘不持久（重启后小人清空）。
- **单机版**（纯静态，适合 GitHub Pages）：页面连不上后端时自动进入单机模式，照样能画、能跳、能上大屏，但数据只存在各自浏览器里，互相看不到。本地加 `?solo` 可以强制进入单机模式测试。

想让 GitHub Pages 上的页面也能多人玩：把后端地址填进 `public/js/config.js` 的 `api`（服务端已开 CORS）。

发布到 Pages（把 `public/` 推成 `gh-pages` 分支）：

```bash
git subtree push --prefix public origin gh-pages
```

## 玩法

- **画**：默认一个穿背心短裤的人偶，用铅笔 / 喷枪 / 油漆桶在上面随便画（128×192 像素画布）。右侧实时“试跳预览”。
- **跳**：画完的图会按最近的骨骼自动拆成 10 个部件（头、躯干、四肢），变成纸偶跟着节拍跳。10 种舞步可选。
- **看**：点舞池里任何人放大；“定住看细节”能看清衣服上写了什么；可以打 call、复制 TA 的链接（`/#d=<id>`）。
- **找**：按昵称“找人”，“找我”一键定位自己。
- **大屏**：点舞池中央的大屏幕免费霸屏 12 秒，全场实时可见；点别人还能“大屏喊话”。

## 结构

| 文件 | 作用 |
| --- | --- |
| `server.js` | HTTP + SSE 实时推送，数据存 `data/`（`dancers.json`、`screen.json`、`img/*.png`） |
| `public/js/rig.js` | 骨骼拆分、舞步关键帧、默认人偶和 NPC 气氛组 |
| `public/js/editor.js` | 复古画板 |
| `public/js/floor.js` | 舞池、灯光、大屏渲染和交互 |
| `public/js/audio.js` | 全局节拍时钟 + WebAudio 合成的迪斯科循环 |
| `public/js/main.js` | 联网、放大卡片、上大屏、HUD |

## 环境变量

- `PORT`（默认 3090）、`HOST`、`DATA_DIR`
- `ADMIN_TOKEN`：设置后可用 `DELETE /api/dancers/:id`，body `{"admin":"<token>"}` 删除任意小人
- `TRUST_PROXY=1`：部署在反向代理后面时按 `X-Forwarded-For` 限流

内置的防刷：按 IP 限流、图片必须是 128×192 PNG、3 人举报自动下场。真要公开上线，还需要加内容审核。
