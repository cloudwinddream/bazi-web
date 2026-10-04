// L5 回归：《滴天髓阐微》行运断例（大运步方向） vs tianzhi score 权重口径大运方向分
// 方向：分 ≥55 顺、≤45 逆、其间平（平记未命中，不剔除分母）；达标线 ≥70% 才允许站上展示逐年相对分
// 喜忌取本站最终用神五分（analyzeStages），不为过关调权重——本脚本只读权重
import { analyzeStrength } from './.build/strength.js'
import { analyzeStages } from './.build/stages.js'
import { scoreDaYunDirection, favorableSets } from './.build/dayun.js'
import { DAYUN_REGRESSION_CASES } from './dayun-regression-cases.mjs'

const quadOf = (gz) => ({ year: [gz[0], gz[1]], month: [gz[2], gz[3]], day: [gz[4], gz[5]], hour: [gz[6], gz[7]] })
let hit = 0
const rows = []
for (const c of DAYUN_REGRESSION_CASES) {
  const quad = quadOf(c.quad)
  const stages = analyzeStages(quad, analyzeStrength(quad))
  const { favorable, unfavorable } = favorableSets(stages.yongshen)
  const s = scoreDaYunDirection(quad, c.dayun, favorable, unfavorable)
  const dir = s >= 55 ? 'good' : s <= 45 ? 'bad' : 'flat'
  const ok = dir === c.expect
  if (ok) hit++
  rows.push({ ...c, score: s, dir, ok, primary: stages.yongshen.primary.text, fav: favorable.join(''), unf: unfavorable.join('') })
  console.log(`${ok ? 'HIT ' : 'MISS'} ${c.quad} 运${c.dayun} 期望${c.expect} 模型分${s}→${dir} 主用${stages.yongshen.primary.text} 喜[${favorable.join('')}] 忌[${unfavorable.join('')}] | ${c.verdict}`)
}
const rate = rows.length ? hit / rows.length : 0
console.log(`\n行运断例回归：${hit}/${rows.length} = ${(rate * 100).toFixed(1)}%（达标线 70%，平局记未命中）`)
console.log(JSON.stringify({ total: rows.length, hit, rate: Math.round(rate * 1000) / 1000, pass: rate >= 0.7, misses: rows.filter((r) => !r.ok).map((r) => `${r.quad}/${r.dayun}/期望${r.expect}/分${r.score}`) }, null, 2))
process.exit(0)
