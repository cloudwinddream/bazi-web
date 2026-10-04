// 大运 / 交运 / 流年分析（五层，口径定版 2026-10-04）
// 蓝本调研：dayun-analysis-research.md。实现分层：
// L1 喜忌底色：运干支查本命最终用神五分（主用神+喜为喜用，忌为忌神）+《金不换大运》120 格调候运喜忌地支
// L2 运局引动：关系引擎换输入（运干支 vs 命局四柱），合化三值（化/不化/待定），引动月令/日支加重标注
// L3 干支分期：运干管前五年 / 运支管后五年——一家之言·分期说法，只作标注，不写成定论
// L4 交运节点：新旧运关系差集（新运带来的合冲变化），只作关系事实提示
// L5 流年评分：tianzhi-core score.py 权重口径移植（基准 50、0–100、本盘内相对、不可跨盘比）；
// 是否展示由《滴天髓阐微》行运断例回归集方向命中率决定（见 YEAR_SCORE_ENABLED 与回归报告），不为过关调权重
// 用神由本命定死、不随运改变；大运只论用神得力/受损。神煞不入分（沿 tianzhi score 口径）。
import { GAN_WX, ZHI_WX, HIDDEN, relation, tenGod, type Quad, type Wx, WX_ORDER} from './strength.js'
import { JINBUHUAN_TABLE} from './jinbuhuan-data.js'
import type { TiaoHouResult, YongShenResult} from './stages.js'

export interface DaYunItemLike {
index: number; startYear: number; endYear: number; startDate: string; endDate: string
ganZhi: string; gan: string; zhi: string
liuNian: { year: number; age: number; ganZhi: string; gan: string; zhi: string}[]
}

export type FavTag = '喜用' | '忌神' | '闲神'
export interface RelationHit {
kind: string; pillar: string; pillarCn: string; target: string; zhi: string
into?: string; transform?: '化' | '不化' | '待定'; transformNote?: string; heavy: boolean
}
export interface GanRelationHit { kind: string; pillar: string; pillarCn: string; target: string; gan: string; into?: string; transform?: '化' | '不化' | '待定'; transformNote?: string}
export interface YearScoreTerm { source: string; detail: string; delta: number}
export interface YearScore { year: number; age: number; ganZhi: string; score: number; stance: string; tenGod: string; terms: YearScoreTerm[]; jiaoyunTag: string | null}
export interface DaYunAnalysis {
index: number; ganZhi: string
l1: { ganTag: FavTag; zhiTag: FavTag; stance: string; jinbuhuan: string; climateNotes: string[]; text: string}
l2: { zhiRelations: RelationHit[]; ganRelations: GanRelationHit[]; groups: string[]; text: string}
l3: { ganPeriod: string; zhiPeriod: string; note: string}
l4: { jiaoyunDate: string; added: string[]; removed: string[]; text: string}
years: YearScore[]
}

const POS = ['year', 'month', 'day', 'hour'] as const
const POS_CN: Record<string, string> = { year: '年', month: '月', day: '日', hour: '时'}
const SHENG: Record<Wx, Wx> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木'}
const KE: Record<Wx, Wx> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木'}

// ---------- L5 展示开关（回归证据定版，见 tests/dayun-regression 与 dayun-implementation-report.md） ----------
// 回归集：《滴天髓阐微》行运断例（原文大运定论 → 方向），用 tianzhi score 权重口径的大运方向分判定。
// 命中率达标线 ≥70%。2026-10-04 实测 15/45 = 33.3%（tests/dayun-regression.mjs），未达标——定版不展示逐年总分，只展示 L1–L4 事实层。
// 不为过关调权重：权重原样保留在 SCORE_WEIGHTS，scoreYear 函数可算但 UI 不展示总分。
export const YEAR_SCORE_ENABLED = false

// ---------- 关系表（与 strength.ts 动态修正同一套通行表） ----------
const CHONG_SET = new Set(['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'])
const LIUHE: Record<string, Wx> = { 子丑: '土', 寅亥: '木', 卯戌: '火', 辰酉: '金', 巳申: '水', 午未: '土'}
const HAI_PAIRS = new Set(['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'])
const XING_PAIRS: [string, string][] = [['寅', '巳'], ['巳', '申'], ['寅', '申'], ['丑', '戌'], ['戌', '未'], ['丑', '未'], ['子', '卯']]
const GANHE: Record<string, Wx> = { 甲己: '土', 己甲: '土', 乙庚: '金', 庚乙: '金', 丙辛: '水', 辛丙: '水', 丁壬: '木', 壬丁: '木', 戊癸: '火', 癸戊: '火'}
const GANCHONG = new Set(['甲庚', '庚甲', '乙辛', '辛乙', '丙壬', '壬丙', '丁癸', '癸丁'])
const SANHE: [string[], Wx][] = [[['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'], [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金']]
const SANHUI: [string[], Wx][] = [[['寅', '卯', '辰'], '木'], [['巳', '午', '未'], '火'], [['申', '酉', '戌'], '金'], [['亥', '子', '丑'], '水']]
const KIND_ORDER: Record<string, number> = { 冲: 0, 刑: 1, 自刑: 2, 害: 3, 合: 4}

function elementWeights(quad: Quad): Record<Wx, number> {
const out = Object.fromEntries(WX_ORDER.map((w) => [w, 0])) as Record<Wx, number>
const hw: Record<string, number> = { 本: 1.0, 中: 0.4, 余: 0.2}
for (const p of POS) {
const [g, z] = quad[p]
out[GAN_WX[g]] += 1.0
for (const [hg, lv] of HIDDEN[z]) out[GAN_WX[hg]] += hw[lv]?? 0.2
}
return out
}
/** 合化三值：化神月令帮扶且占比≥0.28 才「化」；月令不帮且（月令克或占比≤0.10）才「不化」；其余「待定」不武断（tianzhi interact 口径） */
function transformVerdict(into: Wx, quad: Quad): { verdict: '化' | '不化' | '待定'; note: string} {
const monthZhi = quad.month[1]
const monthWx = ZHI_WX[monthZhi]
const supports = monthWx === into || SHENG[monthWx] === into
const restrains = KE[monthWx] === into
const weights = elementWeights(quad)
const total = WX_ORDER.reduce((a, w) => a + weights[w], 0)
const share = total? weights[into] / total: 0
if (supports && share >= 0.28) return { verdict: '化', note: `月令${monthZhi}（${monthWx}）帮化神${into}，且${into}占盘 ${(share * 100).toFixed(0)}%≥28%`}
if (!supports && (restrains || share <= 0.10)) return { verdict: '不化', note: `月令不帮化神${into}${restrains? `（${monthWx}克${into}）`: ''}，${into}占盘 ${(share * 100).toFixed(0)}%`}
return { verdict: '待定', note: `化神${into}占盘 ${(share * 100).toFixed(0)}%，月令${supports? '帮': '不帮'}，未达严条件，只列依据不断化成`}
}

export function zhiRelationsOf(targetZhi: string, quad: Quad): RelationHit[] {
const out: RelationHit[] = []
for (const p of POS) {
const zhi = quad[p][1]
const pair = targetZhi + zhi, rpair = zhi + targetZhi
const rels: RelationHit[] = []
const heavy = p === 'month' || p === 'day'
if (CHONG_SET.has(pair) || CHONG_SET.has(rpair)) rels.push({ kind: '冲', pillar: p, pillarCn: POS_CN[p], target: targetZhi, zhi, heavy})
// 刑：三刑对与子卯刑；寅申已在冲内仍按通行并列（score 口径逐条计，展示亦逐条）
if (XING_PAIRS.some(([a, b]) => (a === targetZhi && b === zhi) || (a === zhi && b === targetZhi))) rels.push({ kind: '刑', pillar: p, pillarCn: POS_CN[p], target: targetZhi, zhi, heavy})
if (targetZhi === zhi && '辰午酉亥'.includes(targetZhi)) rels.push({ kind: '自刑', pillar: p, pillarCn: POS_CN[p], target: targetZhi, zhi, heavy})
const haiKey = [targetZhi, zhi].sort().join('')
if ([...HAI_PAIRS].some((h) => h.split('').sort().join('') === haiKey)) rels.push({ kind: '害', pillar: p, pillarCn: POS_CN[p], target: targetZhi, zhi, heavy})
const into = LIUHE[pair] || LIUHE[rpair]
if (into) {
const tv = transformVerdict(into, quad)
rels.push({ kind: '合', pillar: p, pillarCn: POS_CN[p], target: targetZhi, zhi, into, transform: tv.verdict, transformNote: tv.note, heavy})
}
out.push(...rels)
}
out.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (POS.indexOf(a.pillar as any) - POS.indexOf(b.pillar as any)))
return out
}
export function ganRelationsOf(targetGan: string, quad: Quad): GanRelationHit[] {
const out: GanRelationHit[] = []
for (const p of POS) {
const gan = quad[p][0]
if (GANCHONG.has(targetGan + gan)) out.push({ kind: '冲', pillar: p, pillarCn: POS_CN[p], target: targetGan, gan})
const into = GANHE[targetGan + gan]
if (into) {
const tv = transformVerdict(into, quad)
out.push({ kind: '合', pillar: p, pillarCn: POS_CN[p], target: targetGan, gan, into, transform: tv.verdict, transformNote: tv.note})
}
}
out.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (POS.indexOf(a.pillar as any) - POS.indexOf(b.pillar as any)))
return out
}
function groupsWith(targetZhi: string, quad: Quad): string[] {
const base = POS.map((p) => quad[p][1])
const out: string[] = []
for (const [kind, table] of [['三合', SANHE], ['三会', SANHUI]] as const) {
for (const [trio, wx] of table) {
if (!trio.includes(targetZhi)) continue
if (trio.every((z) => [...base, targetZhi].includes(z)) &&!trio.every((z) => base.includes(z))) out.push(`${trio.join('')}${kind}${wx}局`)
}
}
return out
}

// ---------- tianzhi score.py 权重（原样移植，本包取值可调，不为本站回归调参） ----------
export const SCORE_WEIGHTS = {
BASE: 50, WX_HIT: 8,
SLOT: { year_gan: 1.0, year_zhi: 1.2, dayun_gan: 0.5, dayun_zhi: 0.6},
GOD_BIAS: { 正财: 6, 偏财: 5, 正官: 6, 正印: 5, 食神: 5, 偏印: 1, 比肩: 0, 劫财: -4, 伤官: -4, 七杀: -5} as Record<string, number>,
GOD_WEIGHT: 0.8,
REL_DELTA: { 冲: -9, 刑: -5, 自刑: -4, 害: -3, 合: 2} as Record<string, number>,
PILLAR_WEIGHT: { month: 1.4, day: 1.3, year: 0.8, hour: 0.8} as Record<string, number>,
DAY_GAN_CHONG: -5, DAY_GAN_HE: -1, SUIYUN_BINGLIN: -6, SUIYUN_CHONG: -6, GROUP_DELTA: 5,
}
function stanceOf(score: number): string { return score >= 65? '顺': score >= 55? '偏顺': score > 45? '平': score > 35? '偏逆': '逆'}
export function scoreYear(quad: Quad, yearGz: string, dayunGz: string | null, favorable: string[], unfavorable: string[]): { score: number; stance: string; tenGod: string; terms: YearScoreTerm[]} {
const dayGan = quad.day[0]
const yGan = yearGz.charAt(0), yZhi = yearGz.charAt(1)
const terms: YearScoreTerm[] = [{ source: 'base', detail: '基准', delta: SCORE_WEIGHTS.BASE}]
const wxDelta = (wx: Wx) => favorable.includes(wx)? SCORE_WEIGHTS.WX_HIT: unfavorable.includes(wx)? -SCORE_WEIGHTS.WX_HIT: 0
const tagOf = (wx: Wx) => favorable.includes(wx)? '喜用': unfavorable.includes(wx)? '忌神': '闲神'
const addWx = (slot: keyof typeof SCORE_WEIGHTS.SLOT, ch: string, wx: Wx) => { const raw = wxDelta(wx); if (raw) terms.push({ source: slot, detail: `${ch}(${wx})${tagOf(wx)}`, delta: raw * SCORE_WEIGHTS.SLOT[slot]})}
addWx('year_gan', yGan, GAN_WX[yGan]); addWx('year_zhi', yZhi, ZHI_WX[yZhi])
if (dayunGz) { addWx('dayun_gan', dayunGz.charAt(0), GAN_WX[dayunGz.charAt(0)]); addWx('dayun_zhi', dayunGz.charAt(1), ZHI_WX[dayunGz.charAt(1)])}
const tg = tenGod(yGan, dayGan)
const bias = SCORE_WEIGHTS.GOD_BIAS[tg] || 0
if (bias) terms.push({ source: 'ten_god', detail: `${yGan}对${dayGan}为${tg}`, delta: bias * SCORE_WEIGHTS.GOD_WEIGHT})
for (const rel of zhiRelationsOf(yZhi, quad)) {
const base = SCORE_WEIGHTS.REL_DELTA[rel.kind] || 0
if (base) terms.push({ source: `zhi.${rel.kind}.${rel.pillar}`, detail: `${rel.target}${rel.kind}${rel.pillarCn}支${rel.zhi}`, delta: base * (SCORE_WEIGHTS.PILLAR_WEIGHT[rel.pillar]?? 1)})
}
for (const rel of ganRelationsOf(yGan, quad)) {
if (rel.pillar!== 'day') continue
if (rel.kind === '冲') terms.push({ source: 'gan.冲.day', detail: `${yGan}冲日主${dayGan}`, delta: SCORE_WEIGHTS.DAY_GAN_CHONG})
if (rel.kind === '合') terms.push({ source: 'gan.合.day', detail: `${yGan}合日主${dayGan}`, delta: SCORE_WEIGHTS.DAY_GAN_HE})
}
if (dayunGz) {
if (yearGz === dayunGz) terms.push({ source: 'suiyun.并临', detail: `流年与大运同为${yearGz}`, delta: SCORE_WEIGHTS.SUIYUN_BINGLIN})
const dZhi = dayunGz.charAt(1)
if (CHONG_SET.has(yZhi + dZhi) || CHONG_SET.has(dZhi + yZhi)) terms.push({ source: 'suiyun.冲', detail: `${yZhi}冲大运支${dZhi}`, delta: SCORE_WEIGHTS.SUIYUN_CHONG})
}
for (const g of groupsWith(yZhi, quad)) {
const into = g.slice(-2, -1) as Wx
const raw = wxDelta(into)
if (raw) terms.push({ source: 'group', detail: `${g}(${tagOf(into)})`, delta: SCORE_WEIGHTS.GROUP_DELTA * Math.sign(raw)})
}
const total = Math.max(0, Math.min(100, terms.reduce((a, t) => a + t.delta, 0)))
return { score: Math.round(total * 10) / 10, stance: stanceOf(total), tenGod: tg, terms: terms.map((t) => ({...t, delta: Math.round(t.delta * 100) / 100}))}
}
/** 大运步方向分（回归专用）：同一权重表，只计大运干支喜忌（运干0.5/运支0.6槽）+ 运支关系 + 运干十神，基准 50 */
export function scoreDaYunDirection(quad: Quad, dayunGz: string, favorable: string[], unfavorable: string[]): number {
const dayGan = quad.day[0]
const gan = dayunGz.charAt(0), zhi = dayunGz.charAt(1)
let s = SCORE_WEIGHTS.BASE
const wxDelta = (wx: Wx) => favorable.includes(wx)? SCORE_WEIGHTS.WX_HIT: unfavorable.includes(wx)? -SCORE_WEIGHTS.WX_HIT: 0
s += wxDelta(GAN_WX[gan]) * SCORE_WEIGHTS.SLOT.dayun_gan
s += wxDelta(ZHI_WX[zhi]) * SCORE_WEIGHTS.SLOT.dayun_zhi
s += (SCORE_WEIGHTS.GOD_BIAS[tenGod(gan, dayGan)] || 0) * SCORE_WEIGHTS.GOD_WEIGHT
for (const rel of zhiRelationsOf(zhi, quad)) s += (SCORE_WEIGHTS.REL_DELTA[rel.kind] || 0) * (SCORE_WEIGHTS.PILLAR_WEIGHT[rel.pillar]?? 1)
return Math.round(s * 10) / 10
}

function favTag(wx: Wx, favorable: string[], unfavorable: string[]): FavTag { return favorable.includes(wx)? '喜用': unfavorable.includes(wx)? '忌神': '闲神'}
function relSummary(rels: RelationHit[], grels: GanRelationHit[]): string[] {
const out: string[] = []
for (const r of rels) out.push(`${r.target}${r.kind}${r.pillarCn}支${r.zhi}${r.into? `（六合化${r.into}·${r.transform}）`: ''}${r.heavy? '': ''}`)
for (const r of grels) out.push(`${r.target}${r.kind}${r.pillarCn}干${r.gan}${r.into? `（合化${r.into}·${r.transform}）`: ''}`)
return out
}

export function analyzeDaYun(quad: Quad, yongshen: YongShenResult, tiaohou: TiaoHouResult, daYun: DaYunItemLike[], showScore: boolean = YEAR_SCORE_ENABLED): DaYunAnalysis[] {
const favorable = [yongshen.primary.wuxing,...yongshen.xi]
const unfavorable = [...yongshen.ji]
const dayGan = quad.day[0]
const monthZhi = quad.month[1]
const jb = (JINBUHUAN_TABLE[dayGan] || {})[monthZhi]
const needGans = tiaohou.gods || []
const keptElems = (tiaohou.kept || []) as Wx[]
const stems = POS.map((p) => quad[p][0])
const zhis = POS.map((p) => quad[p][1])
// 原局调候药状态：透干的药、藏根的药
const touYao = needGans.filter((g) => stems.includes(g))
const cangYao = needGans.filter((g) =>!stems.includes(g) && zhis.some((z) => HIDDEN[z].some(([hg]) => hg === g)))

const perStep = daYun.filter((d) => d.index > 0).map((dy) => {
const ganWx = GAN_WX[dy.gan], zhiWx = ZHI_WX[dy.zhi]
const ganTag = favTag(ganWx, favorable, unfavorable), zhiTag = favTag(zhiWx, favorable, unfavorable)
const stance = ganTag === '喜用' && zhiTag === '喜用'? '顺': ganTag === '忌神' && zhiTag === '忌神'? '逆': (ganTag === '喜用' && zhiTag === '忌神') || (ganTag === '忌神' && zhiTag === '喜用')? '混': ganTag === '喜用' || zhiTag === '喜用'? '偏顺': ganTag === '忌神' || zhiTag === '忌神'? '偏逆': '平'
// 金不换调候运
let jinbuhuan = '金不换无此格记录'
if (jb) {
const xiHit = jb.dayun_xi.includes(dy.zhi), jiHit = jb.dayun_ji.includes(dy.zhi)
jinbuhuan = `金不换：运支${dy.zhi}${xiHit? '在调候喜运地支': jiHit? '在调候忌运地支': '不在调候喜忌地支表'}（${dayGan}日${monthZhi}月喜[${jb.dayun_xi.join('') || '—'}]/忌[${jb.dayun_ji.join('') || '—'}]）`
if (xiHit && zhiTag === '忌神') jinbuhuan += '；与扶抑/格局侧喜忌冲突，双标保留不合并'
if (jiHit && zhiTag === '喜用') jinbuhuan += '；与扶抑/格局侧喜忌冲突，双标保留不合并'
}
// 调候药逢运提示
const climateNotes: string[] = []
for (const g of cangYao) if (dy.gan === g) climateNotes.push(`调候药${g}（${GAN_WX[g]}）原局藏而不透，此运天干${dy.gan}透出——药得地（注家通则：用神待发）`)
for (const g of needGans) if (!stems.includes(g) &&!cangYao.includes(g) && dy.gan === g) climateNotes.push(`调候药${g}（${GAN_WX[g]}）原局缺如，此运天干透出补药`)
for (const g of touYao) {
if (GANHE[dy.gan + g] || GANHE[g + dy.gan]) climateNotes.push(`原局已透调候药${g}被运干${dy.gan}合（${dy.gan}${g}合${GANHE[dy.gan + g] || GANHE[g + dy.gan]}）——药被合走提示（合化三值见 L2，不断化成）`)
const keWx = (Object.entries(KE).find(([, v]) => v === GAN_WX[g]) || [])[0]
if (keWx && ganWx === keWx) climateNotes.push(`运干${dy.gan}（${ganWx}）克调候药${g}（${GAN_WX[g]}）——药被克破提示`)
}
if (keptElems.includes(zhiWx)) climateNotes.push(`运支${dy.zhi}（${zhiWx}）属剔病后调候喜行${keptElems.join('')}，气候侧顺`)
const zhiRels = zhiRelationsOf(dy.zhi, quad)
const ganRels = ganRelationsOf(dy.gan, quad)
const groups = groupsWith(dy.zhi, quad)
const l2text = [...relSummary(zhiRels, ganRels),...groups.map((g) => `运支引动成局：${g}`)]
// L3 干支分期（一家之言）
const ganPeriod = `前五年偏运干${dy.gan}（${ganWx}·${tenGod(dy.gan, dayGan)}·${ganTag}）${ganRels.length? '；运干引动：' + ganRels.map((r) => `${r.target}${r.kind}${r.pillarCn}干${r.gan}`).join('、'): '；运干与原局干无合冲'}`
const zhiPeriod = `后五年偏运支${dy.zhi}（${zhiWx}·${zhiTag}）${zhiRels.length? '；运支引动：' + zhiRels.map((r) => `${r.target}${r.kind}${r.pillarCn}支${r.zhi}`).join('、'): '；运支与原局支无冲合刑害'}`
const years: YearScore[] = dy.liuNian.map((ln) => {
const sc = showScore? scoreYear(quad, ln.ganZhi, dy.ganZhi, favorable, unfavorable): { score: NaN, stance: '', tenGod: tenGod(ln.gan, dayGan), terms: [] as YearScoreTerm[]}
// 交运年标签（L4 附带）：流年冲大运=新事倾向，冲原局=旧事倾向（梁说提示层）
let jiaoyunTag: string | null = null
const isJiaoyunYear = ln.year === dy.startYear
if (isJiaoyunYear) {
const chongDy = CHONG_SET.has(ln.zhi + dy.zhi) || CHONG_SET.has(dy.zhi + ln.zhi)
const chongOrig = zhiRelationsOf(ln.zhi, quad).some((r) => r.kind === '冲')
jiaoyunTag = `交运年${chongDy? '；流年支冲大运（新事/转型倾向·提示）': ''}${chongOrig? '；流年支冲原局（旧事倾向·提示）': ''}`
}
return { year: ln.year, age: ln.age, ganZhi: ln.ganZhi, score: sc.score, stance: sc.stance, tenGod: sc.tenGod, terms: sc.terms, jiaoyunTag}
})
return {
index: dy.index, ganZhi: dy.ganZhi,
l1: { ganTag, zhiTag, stance, jinbuhuan, climateNotes, text: `运干${dy.gan}（${ganWx}）${ganTag} · 运支${dy.zhi}（${zhiWx}）${zhiTag} → 底色${stance}；主用神${yongshen.primary.text}本命定死，运只论得力受损`},
l2: { zhiRelations: zhiRels, ganRelations: ganRels, groups, text: l2text.length? l2text.join('；'): '运干支与原局无冲合刑害引动'},
l3: { ganPeriod, zhiPeriod, note: '天干管前五年、地支管后五年为一家之言·分期说法（通行说法之一），干支同气或相生时分期意义弱，只作展示标注，不作定论'},
l4: { jiaoyunDate: dy.startDate, added: [], removed: [], text: ''},
years,
} as DaYunAnalysis
})
// L4 差集：相邻两步 L2 关系集合差
for (let i = 0; i < perStep.length; i++) {
const cur = new Set([...relSummary(perStep[i].l2.zhiRelations, perStep[i].l2.ganRelations),...perStep[i].l2.groups])
if (i === 0) { perStep[i].l4.text = `首步大运，${perStep[i].l4.jiaoyunDate} 交运（起运）；无旧运可比，关系全集见 L2`; perStep[i].l4.added = [...cur]; continue}
const prev = new Set([...relSummary(perStep[i - 1].l2.zhiRelations, perStep[i - 1].l2.ganRelations),...perStep[i - 1].l2.groups])
const added = [...cur].filter((x) =>!prev.has(x))
const removed = [...prev].filter((x) =>!cur.has(x))
perStep[i].l4.added = added; perStep[i].l4.removed = removed
perStep[i].l4.text = `${perStep[i].l4.jiaoyunDate} 交运：新运新增引动 ${added.length? added.join('；'): '无'}；旧运退出引动 ${removed.length? removed.join('；'): '无'}。交运前后注意事项只作关系事实提示，过渡期长短（如所谓百日）属经验谈，不给精确起止断语`
}
return perStep
}

export function favorableSets(yongshen: YongShenResult): { favorable: string[]; unfavorable: string[]} {
return { favorable: [yongshen.primary.wuxing,...yongshen.xi], unfavorable: [...yongshen.ji]}
}
