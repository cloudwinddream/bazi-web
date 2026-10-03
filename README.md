# 云八字 · Bazi Web

纯前端八字排盘工具：输入生辰，浏览器本地完成四柱排盘、藏干十神、五行加权与大运流年展示。**无后端、无数据库，生辰数据不上传。**

- 线上：https://bazi.cloudwind.ccwu.cc
- 引擎：[lunar-javascript](https://github.com/6tail/lunar-javascript) 1.7.7（6tail，MIT）
- 技术栈：Vite 6 + Vue 3 + TypeScript，移动端优先中文界面

## 功能

- 公历 / 农历输入（农历支持闰月），性别、出生地经度（内置常用城市）
- 真太阳时开关：经度差（相对东经 120°）+ 均时差修正，结果回显修正分钟数
- 子时流派开关：sect=1 晚子时换日 / sect=2 子时不换日，结果回显口径
- 四柱命盘表：干支、十神、藏干（含藏干十神）、纳音、地势，日柱高亮
- 五行分布：天干计 1.0，藏干按本气 1.0 / 中气 0.5 / 余气 0.3 加权；附日主强弱粗判
- 大运：起运信息 + 十步大运，点选查看各步流年（自动高亮当前年）

## 本地运行

```bash
npm install
npm run dev        # 开发
npm run test:cases # 10 个固定命例回归（立春/子时/闰月/清明/真太阳时临界等）
npm run build      # 产物 dist/
```

## 部署

Cloudflare Pages 直连本仓库：构建命令 `npm run build`，输出目录 `dist`，生产分支 `main`。push 到 main 自动部署；自定义域 `bazi.cloudwind.ccwu.cc` 在 Pages 项目绑定（CNAME 指向项目 pages.dev 子域）。

## 口径与免责

年柱以立春、月柱以节令为界，日柱查万年历，时柱用五鼠遁（引擎口径）；起运为库默认三天折一年口径。流派差异客观存在，页面会回显本次计算所用口径。

仅供传统文化研究与娱乐参考，不构成任何决策依据。
