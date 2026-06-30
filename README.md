# 雅速雅思（YASU IELTS）

面向未来雅速主站的 monorepo 工作区，当前包含雅思作文批改模块。

## 结构

```
yasu-ielts/
├── apps/website/          # 雅速门户（离线首页）
├── modules/
│   └── essay-grading/     # @yasu/essay-grading 批改模块
├── scripts/               # prepare-portal 等工具脚本
└── package.json           # npm workspaces 根
```

## 快速开始

```bash
npm install
npm run prepare:portal   # 首次或更新门户离线包时执行
npm run dev
```

**试用流程：**

1. 打开 `http://localhost:3101/` — 雅速门户首页
2. 在 **智能工具 / AI TOOLS** 区块点击 **上传作文 →**
3. 进入 `http://localhost:3101/grading` 使用作文批改

Mock 批改：`http://localhost:3101/grading?mock=1`

## 模块文档

详见 [modules/essay-grading/README.md](modules/essay-grading/README.md)。

## 生产构建

```bash
npm run build -w @yasu/essay-grading
npm run start -w @yasu/essay-grading
```

## 注意

- 若工作区中仍存在旧的 `LLED_bot_MVP/` 目录，请在本 IDE 关闭相关进程后**手动删除**（内容已迁移至 `modules/essay-grading/`）。
- 建议将工作区文件夹 `IELTS grading` 重命名为 `yasu-ielts`，并在 Cursor 中重新打开。
