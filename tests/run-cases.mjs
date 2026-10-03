// 30 个边界命例回归：前端 JS 引擎 vs lunar-python 金标准（tests/expected-python.json）逐字段比对
// 金标准由 tests/cross_check.py 独立生成；不一致先查口径，不许改预期凑数
import { readFileSync } from 'node:fs'
import { calcBazi } from './.build/bazi.js'

const { cases } = JSON.parse(readFileSync(new URL('./cases30.json', import.meta.url), 'utf8'))
const expected = JSON.parse(readFileSync(new URL('./expected-python.json', import.meta.url), 'utf8'))

let pass = 0
cases.forEach((c, idx) => {
  const exp = expected[idx]
  const r = calcBazi(c.input)
  const diffs = []
  r.pillars.forEach((p, i) => {
    const e = exp.pillars[i]
    for (const k of ['ganZhi', 'hideGan', 'shiShenGan', 'shiShenZhi', 'naYin', 'diShi', 'xunKong']) {
      if (JSON.stringify(p[k]) !== JSON.stringify(e[k])) diffs.push(`柱${i}.${k}`)
    }
  })
  if (r.correctedText !== exp.correctedText) diffs.push('correctedText')
  if (r.taiYuan !== exp.taiYuan || r.mingGong !== exp.mingGong || r.shenGong !== exp.shenGong) diffs.push('胎元命宫身宫')
  if (r.prevJieQi !== exp.prevJieQi || r.nextJieQi !== exp.nextJieQi) diffs.push('节气时刻')
  const got = r.pillars.map((p) => p.ganZhi).join(' ')
  const ok = diffs.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  -> ${got}${ok ? '' : '  DIFF: ' + diffs.join(', ')}`)
  if (ok) pass++
})
console.log(`\n${pass}/${cases.length} passed（金标准：lunar-python，另经 sxtwl 节气校验）`)
process.exit(pass === cases.length ? 0 : 1)
