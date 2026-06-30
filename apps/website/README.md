# 雅速雅思主站

雅速雅思门户离线页，与 `@yasu/essay-grading` 批改模块同服部署。

## 试用流程

1. 启动服务：`npm run dev`（根目录）或 `npm run dev -w @yasu/essay-grading`
2. 访问 `http://localhost:3101/` — 雅速门户首页
3. 滚动至 **智能工具 / AI TOOLS** 区块，点击 **上传作文 →**
4. 跳转至 `http://localhost:3101/grading` 使用作文批改

Mock 批改：`http://localhost:3101/grading?mock=1`

## 门户源文件

门户 HTML 由 `scripts/prepare-portal.mjs` 从离线包生成并写入 `public/index.html`（链接已指向 `/grading`）。

```bash
node scripts/prepare-portal.mjs
# 或指定源文件
PORTAL_SOURCE="path/to/雅速雅思门户-离线版.html" node scripts/prepare-portal.mjs
```

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 门户首页 |
| `/grading` | 作文批改 UI |
| `/api/*` | 批改 API |
