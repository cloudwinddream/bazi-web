// 用前端同一引擎批量排盘，输出 JSON 供 Python 金标准逐字段 diff
import { readFileSync, writeFileSync } from 'node:fs'
import { calcBazi } from './.build/bazi.js'

const { cases } = JSON.parse(readFileSync(new URL('./cases30.json', import.meta.url), 'utf8'))
const out = cases.map((c) => {
  const r = calcBazi(c.input)
  return {
    name: c.name,
    pillars: r.pillars,
    taiYuan: r.taiYuan, mingGong: r.mingGong, shenGong: r.shenGong,
    prevJieQi: r.prevJieQi, nextJieQi: r.nextJieQi,
    qiYunStartSolar: r.qiYunStartSolar,
    correctedText: r.correctedText,
    trueSolarOffsetSeconds: r.trueSolarOffsetSeconds,
    daYun: r.daYun.map((d) => ({ index: d.index, ganZhi: d.ganZhi, startYear: d.startYear, endYear: d.endYear, startAge: d.startAge, endAge: d.endAge })),
  }
})
writeFileSync(new URL('./js-results.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(`JS 引擎已输出 ${out.length} 例 -> tests/js-results.json`)
