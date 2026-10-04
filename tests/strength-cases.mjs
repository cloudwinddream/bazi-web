// 强弱引擎对测：28 真实盘 TS 移植 vs Python tianzhi 基线（strength-expected.json = real-test/results.json）
// 强弱侧：ratio>=0.48 强侧，<=0.35 弱侧，其余中和。普通盘 = exp_side 为 strong/weak/balanced 的 20 例
import { readFileSync } from 'node:fs'
import { analyzeStrength } from './.build/strength.js'

const rows = JSON.parse(readFileSync(new URL('./strength-expected.json', import.meta.url), 'utf8'))
const quad = (gz) => ({ year: [gz[0], gz[1]], month: [gz[2], gz[3]], day: [gz[4], gz[5]], hour: [gz[6], gz[7]] })
const side = (r) => (r >= 0.48 ? 'strong' : r <= 0.35 ? 'weak' : 'balanced')

let ratioOk = 0, labelOk = 0, sideOkOrd = 0, ord = 0
const flips = []
for (const r of rows) {
  const s = analyzeStrength(quad(r.gz))
  // 基础 ratio 对 Python 基线（不计关系）；修正后 ratio 单独看强弱侧一致率
  const dRatio = Math.abs(s.baseRatio - r.ratio)
  if (dRatio <= 0.002) ratioOk++
  if (s.baseGrade === r.label) labelOk++
  const isOrd = ['strong', 'weak', 'balanced'].includes(r.exp_side)
  if (isOrd) {
    ord++
    if (side(s.ratio) === r.exp_side) sideOkOrd++
    else flips.push(`${r.name} ${r.gz} 期望${r.exp_side} 得修正后 ratio=${s.ratio} ${s.grade}（基础 ${s.baseRatio} ${s.baseGrade}）`)
  }
  console.log(`${dRatio <= 0.002 && s.baseGrade === r.label ? 'PASS' : 'DIFF'} ${r.name} 基础 py=${r.ratio} ts=${s.baseRatio} 修正后=${s.ratio} label py=${r.label} ts基础=${s.baseGrade}/修正=${s.grade} root=${s.hasRoot}`)
}
console.log(`\n基础ratio一致 ${ratioOk}/${rows.length}，基础档位一致 ${labelOk}/${rows.length}`)
console.log(`普通盘强弱侧 ${sideOkOrd}/${ord}（Python 基线 16/20）`)
if (flips.length) console.log('侧翻转：\n' + flips.join('\n'))
// 夹具：胡适偏弱 / 南怀瑾身旺方向
const hu = analyzeStrength(quad('辛卯庚子丁丑丁未'))
const nan = analyzeStrength(quad('戊午乙卯甲子乙亥'))
console.log(`夹具 胡适 ratio=${hu.ratio} ${hu.grade}（期望偏弱）；南怀瑾 ratio=${nan.ratio} ${nan.grade}（期望身旺）`)
const ok = ratioOk === rows.length && sideOkOrd >= 16 && hu.grade === '偏弱' && nan.grade === '身旺' && rows.every((r) => { const x = analyzeStrength(quad(r.gz)); return Math.abs(x.deltaSupport) + Math.abs(x.deltaDrain) < 60 })
process.exit(ok ? 0 : 1)
