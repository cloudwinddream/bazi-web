// 把 TS 引擎编译成可被 node 直接 import 的 ESM，供命例回归
import { execSync } from 'node:child_process'
execSync(
  'npx tsc src/engine/bazi.ts --outDir tests/.build --module esnext --target es2020 --moduleResolution bundler --skipLibCheck',
  { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname },
)
console.log('engine compiled to tests/.build/bazi.js')
