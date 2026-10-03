# 部署记录

- 首次部署：2026-10-03，Cloudflare Pages 项目 `bazi-web`（连 GitHub 仓库 `cloudwinddream/bazi-web`，push 自动部署）
- Pages 子域：https://bazi-web-553.pages.dev
- 自定义域：https://bazi.cloudwind.ccwu.cc（CNAME → bazi-web-553.pages.dev，proxied，证书由 Cloudflare 自动签发）
- 构建：`npm run build` → `dist`，生产分支 `main`
- 发布前自测：`npm run test:cases` 10/10 通过（立春交界、子时 sect1/2、闰二月、清明交界、千禧、真太阳时临界等）
