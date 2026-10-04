// 日主强弱引擎（量化打分派）
// 蓝本：zaoxu001/tianzhi-core（MIT）strength.py 成分连乘模型，前端 TS 等价移植
// 成分 = 4 天干 + 4 地支藏干展开；权重 = 基础分 × 根气 × 纯气 × 月令 × 司令 × 贴身 × 虚透
// ratio = 同党/(同党+异党)，五档阈值 0.26/0.35/0.48/0.61（3000 随机盘分位数标定，原样保留）
// 专旺/从格走双轨：ratio 硬闸只作极端提示，结构闸另判「疑似」，不自动反转喜忌
// month_siling 默认 null（不加司令权），与真实盘测试口径一致；司令仅在得令展开中展示
// 动态关系修正（L3，本站口径，工程取值非典籍定数）：关系不另发明分数，只对受影响成分的
//   现有加权分做系数修正——化气成立时化气成分增力、非化气成分减力；未化只增力或合绊减力；
//   冲定向削日主根+本气（月支根最重），刑害只削本气，中/余气不动。每条逐条算 delta，单条 |delta| 合计封顶 18 分、
//   总修正封顶为基础总分 20%（18–32 分），单成分累计系数夹在 0.45–1.45，杜绝整盘翻转。
//   化气从严：须月令同气/生气 + 化神透干 + 无有根克星破 + 局支无冲，缺一即合而不化。
//   基础 ratio（不计关系）与修正后 ratio 双值并存，档位以修正后为准，基础值保留可查。
export type Wx = '木' | '火' | '土' | '金' | '水'
export const WX_ORDER: Wx[] = ['木', '火', '土', '金', '水']

export const GAN_WX: Record<string, Wx> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }
export const ZHI_WX: Record<string, Wx> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }
export const GAN_YANG = new Set('甲丙戊庚壬')
export const HIDDEN: Record<string, [string, string][]> = {
  子: [['癸', '本']], 丑: [['己', '本'], ['癸', '中'], ['辛', '余']],
  寅: [['甲', '本'], ['丙', '中'], ['戊', '余']], 卯: [['乙', '本']],
  辰: [['戊', '本'], ['乙', '中'], ['癸', '余']], 巳: [['丙', '本'], ['庚', '中'], ['戊', '余']],
  午: [['丁', '本'], ['己', '中']], 未: [['己', '本'], ['丁', '中'], ['乙', '余']],
  申: [['庚', '本'], ['壬', '中'], ['戊', '余']], 酉: [['辛', '本']],
  戌: [['戊', '本'], ['辛', '中'], ['丁', '余']], 亥: [['壬', '本'], ['甲', '中']],
}
const PURE_ZHI = new Set('子卯酉')
const SHENG: Record<Wx, Wx> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
const KE: Record<Wx, Wx> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
const SHENG_ME = Object.fromEntries(Object.entries(SHENG).map(([k, v]) => [v, k])) as Record<Wx, Wx>
const KE_ME = Object.fromEntries(Object.entries(KE).map(([k, v]) => [v, k])) as Record<Wx, Wx>

export const GAN_BASE = 10, ZHI_BASE = 12
export const ROOT_COEF: Record<string, number> = { 本: 1.0, 中: 0.5, 余: 0.3 }
export const PURE_ZHI_COEF = 1.6, MONTH_WEIGHT = 2.0, SILING_BOOST = 1.1, ATTACH_FACTOR = 1.2, VIRTUAL_FLOAT_FACTOR = 0.5
export const RATIO_BANDS = [0.26, 0.35, 0.48, 0.61]
const ROOT_DISHI = new Set(['长生', '临官', '帝旺'])
const CHANGSHENG = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']
const ZHI_LIST = '子丑寅卯辰巳午未申酉戌亥'.split('')
const CS_START: Record<string, string> = { 甲: '亥', 丙: '寅', 戊: '寅', 庚: '巳', 壬: '申' }
const CS_START_YIN: Record<string, string> = { 乙: '午', 丁: '酉', 己: '酉', 辛: '子', 癸: '卯' }
export function dishi(gan: string, zhi: string): string {
  let start: string, step: number
  if (gan in CS_START) { start = CS_START[gan]; step = 1 } else { start = CS_START_YIN[gan]; step = -1 }
  const d = (((ZHI_LIST.indexOf(zhi) - ZHI_LIST.indexOf(start)) * step) % 12 + 12) % 12
  return CHANGSHENG[d]
}
/** 旺相休囚死：当令旺、我生相、生我休、克我囚、我克死（四季土按月令本气） */
export function wangxiang(target: Wx, monthZhi: string): string {
  const ruler = ZHI_WX[monthZhi]
  if (target === ruler) return '旺'
  if (SHENG[ruler] === target) return '相'
  if (SHENG[target] === ruler) return '休'
  if (KE[target] === ruler) return '囚'
  return '死'
}
// 人元司令分日表（tianzhi-core data/siling.json，通行表）
const SILING: Record<string, [number, string][]> = {
  丑: [[9, '癸'], [3, '辛'], [18, '己']], 亥: [[7, '戊'], [5, '甲'], [18, '壬']],
  午: [[10, '丙'], [9, '己'], [11, '丁']], 卯: [[10, '甲'], [20, '乙']],
  子: [[10, '壬'], [20, '癸']], 寅: [[7, '戊'], [7, '丙'], [16, '甲']],
  巳: [[5, '戊'], [9, '庚'], [16, '丙']], 戌: [[9, '辛'], [3, '丁'], [18, '戊']],
  未: [[9, '丁'], [3, '乙'], [18, '己']], 申: [[10, '己'], [3, '壬'], [17, '庚']],
  辰: [[9, '乙'], [3, '癸'], [18, '戊']], 酉: [[10, '庚'], [20, '辛']],
}
export function silingGan(monthZhi: string, daysAfterJie: number): string {
  let acc = 0
  const table = SILING[monthZhi] || []
  for (const [days, gan] of table) { acc += days; if (daysAfterJie < acc) return gan }
  return table.length ? table[table.length - 1][1] : HIDDEN[monthZhi][0][0]
}

export type Quad = { year: [string, string]; month: [string, string]; day: [string, string]; hour: [string, string] }
const POS = ['year', 'month', 'day', 'hour'] as const
const POS_CN: Record<string, string> = { year: '年', month: '月', day: '日', hour: '时' }

export function relation(target: Wx, me: Wx): '比劫' | '印' | '食伤' | '财' | '官杀' {
  if (target === me) return '比劫'
  if (SHENG[target] === me) return '印'
  if (SHENG[me] === target) return '食伤'
  if (KE[me] === target) return '财'
  return '官杀'
}
const TEN_TABLE: Record<string, string> = {
  '比劫|1': '比肩', '比劫|0': '劫财', '食伤|1': '食神', '食伤|0': '伤官',
  '财|1': '偏财', '财|0': '正财', '官杀|1': '七杀', '官杀|0': '正官', '印|1': '偏印', '印|0': '正印',
}
export function tenGod(targetGan: string, dayGan: string): string {
  const rel = relation(GAN_WX[targetGan], GAN_WX[dayGan])
  const same = GAN_YANG.has(targetGan) === GAN_YANG.has(dayGan)
  return TEN_TABLE[`${rel}|${same ? 1 : 0}`]
}

export interface Contribution {
  id: string; pillar: string; pos: string; source: string; char: string; gan: string
  kind: '干' | '支'; level: string; wuxing: Wx; tenGod: string; relation: string
  camp: '同党' | '异党'; base: number
  multipliers: { label: string; value: number }[]
  weighted: number
  adjustedWeighted: number
}
export interface AdjAffect { contribId: string; source: string; before: number; after: number; delta: number }
export interface Adjustment {
  relation: string; type: string; category: string; participants: string[]
  delta: number; deltaSupport: number; deltaDrain: number
  applied: boolean; capped: boolean; crossGrade: boolean
  verdict: string; conditions: { label: string; met: boolean }[]
  affects: AdjAffect[]; note: string
}
export interface MonthStateRow {
  wuxing: Wx; status: string; relationToDM: string; weighted: number; share: number
  counts: { main: number; hidden: number }; tenGodPair: [string, number, string, number]
}
export interface StrengthResult {
  grade: string; ratio: number; support: number; drain: number; hasRoot: boolean; rootNotes: string[]
  baseGrade: string; baseRatio: number; baseSupport: number; baseDrain: number
  deltaSupport: number; deltaDrain: number; crossGrade: boolean; crossNote: string | null
  contributions: Contribution[]
  factors: { key: string; name: string; ally: number; enemy: number; allyBase: number; enemyBase: number; text: string; items: string[] }[]
  elementPower: { wuxing: Wx; weighted: number }[]
  monthState: MonthStateRow[]
  deling: { badge: string; monthZhi: string; silingGan: string | null; silingTenGod: string | null; daysAfterJie: number | null; dmChangSheng: string; jieqiFromPrev: string | null }
  gates: {
    ratioWeak: boolean; ratioStrong: boolean
    cong: { suspect: boolean; kind: string | null; conditions: { label: string; met: boolean }[] }
    zhuan: { suspect: boolean; conditions: { label: string; met: boolean }[] }
  }
  adjustments: Adjustment[]
  trace: string
}

function hasRootOf(gan: string, quad: Quad): boolean {
  const wx = GAN_WX[gan]
  return POS.some((p) => HIDDEN[quad[p][1]].some(([hg]) => GAN_WX[hg] === wx))
}

export function analyzeStrength(quad: Quad, opts?: { monthSiling?: string | null; daysAfterJie?: number | null; jieqiFromPrev?: string | null }): StrengthResult {
  const monthSiling = opts?.monthSiling ?? null
  const dayGan = quad.day[0]
  const dayWx = GAN_WX[dayGan]
  const contribs: Contribution[] = []
  // 天干成分（不含日干本身，与 Python include_day_gan=False 一致）
  for (const pos of POS) {
    const [gan, zhi] = quad[pos]
    if (pos !== 'day') {
      let w = GAN_BASE
      const mults: { label: string; value: number }[] = [{ label: '基础分', value: GAN_BASE }]
      if (!hasRootOf(gan, quad)) { w *= VIRTUAL_FLOAT_FACTOR; mults.push({ label: '虚透×0.5', value: VIRTUAL_FLOAT_FACTOR }) }
      if (pos === 'month') { w *= ATTACH_FACTOR; mults.push({ label: '贴身×1.2', value: ATTACH_FACTOR }) }
      const wx = GAN_WX[gan]; const rel = relation(wx, dayWx)
      contribs.push({ id: `${pos}.stem`, pillar: POS_CN[pos], pos, source: `${POS_CN[pos]}干${gan}`, char: gan, gan, kind: '干', level: '透', wuxing: wx, tenGod: tenGod(gan, dayGan), relation: rel, camp: rel === '比劫' || rel === '印' ? '同党' : '异党', base: GAN_BASE, multipliers: mults, weighted: w, adjustedWeighted: w })
    }
    const isMonth = pos === 'month'
    const pure = PURE_ZHI.has(zhi)
    for (const [hg, level] of HIDDEN[zhi]) {
      let w = ZHI_BASE * ROOT_COEF[level]
      const mults: { label: string; value: number }[] = [{ label: '基础分', value: ZHI_BASE }, { label: `根气${level}×${ROOT_COEF[level]}`, value: ROOT_COEF[level] }]
      if (pure) { w *= PURE_ZHI_COEF; mults.push({ label: '纯气×1.6', value: PURE_ZHI_COEF }) }
      if (isMonth) {
        w *= MONTH_WEIGHT; mults.push({ label: '月令×2.0', value: MONTH_WEIGHT })
        if (monthSiling && hg === monthSiling) { w *= SILING_BOOST; mults.push({ label: '司令×1.1', value: SILING_BOOST }) }
      }
      if (pos === 'day') { w *= ATTACH_FACTOR; mults.push({ label: '贴身×1.2', value: ATTACH_FACTOR }) }
      const wx = GAN_WX[hg]; const rel = relation(wx, dayWx)
      contribs.push({ id: `${pos}.branch.${hg}`, pillar: POS_CN[pos], pos, source: `${POS_CN[pos]}支${zhi}藏${hg}`, char: zhi, gan: hg, kind: '支', level, wuxing: wx, tenGod: tenGod(hg, dayGan), relation: rel, camp: rel === '比劫' || rel === '印' ? '同党' : '异党', base: ZHI_BASE, multipliers: mults, weighted: w, adjustedWeighted: w })
    }
  }
  const baseSupport = contribs.filter((c) => c.camp === '同党').reduce((a, c) => a + c.weighted, 0)
  const baseDrain = contribs.filter((c) => c.camp === '异党').reduce((a, c) => a + c.weighted, 0)
  const gradeOf = (r: number) => r >= RATIO_BANDS[3] ? '身旺' : r >= RATIO_BANDS[2] ? '偏旺' : r <= RATIO_BANDS[0] ? '身弱' : r <= RATIO_BANDS[1] ? '偏弱' : '中和'
  const baseRatio = baseSupport + baseDrain > 0 ? baseSupport / (baseSupport + baseDrain) : 0.5
  const baseGrade = gradeOf(baseRatio)
  // 强根闸
  const rootNotes: string[] = []
  let hasRoot = false
  for (const pos of POS) {
    const d = dishi(dayGan, quad[pos][1])
    if (ROOT_DISHI.has(d)) { hasRoot = true; rootNotes.push(`${POS_CN[pos]}支${quad[pos][1]}·${d}`) }
  }
  const sameCnt = POS.reduce((n, p) => n + HIDDEN[quad[p][1]].filter(([hg]) => GAN_WX[hg] === dayWx).length, 0)
  if (sameCnt > 2) { hasRoot = true; rootNotes.push(`同五行藏干根×${sameCnt}`) }
  // 五行力量（含日干，与 element_power 口径一致，供步骤三图）
  const elemMap = new Map<Wx, number>(WX_ORDER.map((w) => [w, 0]))
  elemMap.set(dayWx, (elemMap.get(dayWx) || 0) + GAN_BASE * (hasRootOf(dayGan, quad) ? 1 : VIRTUAL_FLOAT_FACTOR))
  // 注：日干虚透判定与 Python element_power 一致（components 含日干且走同一虚透逻辑）
  for (const c of contribs) elemMap.set(c.wuxing, (elemMap.get(c.wuxing) || 0) + c.weighted)
  const elementPower = WX_ORDER.map((w) => ({ wuxing: w, weighted: Math.round((elemMap.get(w) || 0) * 1000) / 1000 }))
  const totalElem = elementPower.reduce((a, e) => a + e.weighted, 0)
  // 步骤三：月令状态行
  const monthZhi = quad.month[1]
  const relText: Record<string, string> = { 比劫: '同', 印: '生我', 食伤: '我生', 财: '我克', 官杀: '克我' }
  const monthState: MonthStateRow[] = WX_ORDER.map((wx) => {
    const counts = { main: 0, hidden: 0 }
    for (const pos of POS) {
      const [g, z] = quad[pos]
      if (GAN_WX[g] === wx) counts.main++
      HIDDEN[z].forEach(([hg, lv]) => { if (GAN_WX[hg] === wx) { if (lv === '本') counts.main++; else counts.hidden++ } })
    }
    const pairNames: Record<string, [string, string]> = { 比劫: ['正·比肩', '偏·劫财'], 印: ['正印', '偏印'], 食伤: ['正·食神', '偏·伤官'], 财: ['正财', '偏财'], 官杀: ['正官', '七杀'] }
    const rel = relation(wx, dayWx)
    // 十神对计数：按该五行两个十神在全盘成分（含天干）中的出现次数
    const gods = wx === dayWx ? ['比肩', '劫财'] : rel === '印' ? ['正印', '偏印'] : rel === '食伤' ? ['食神', '伤官'] : rel === '财' ? ['偏财', '正财'] : ['七杀', '正官']
    const cnt = (tg: string) => contribs.filter((c) => c.tenGod === tg).length + (POS.filter((p) => p !== 'day' && tenGod(quad[p][0], dayGan) === tg).length ? 0 : 0)
    // 天干成分已在 contribs 中（kind=干），直接数 contribs 即可
    const c1 = contribs.filter((c) => c.tenGod === gods[0]).length
    const c2 = contribs.filter((c) => c.tenGod === gods[1]).length
    void pairNames; void cnt
    return {
      wuxing: wx, status: wangxiang(wx, monthZhi), relationToDM: `${relText[rel]}（${rel}）`,
      weighted: Math.round((elemMap.get(wx) || 0) * 1000) / 1000,
      share: totalElem ? (elemMap.get(wx) || 0) / totalElem : 0,
      counts, tenGodPair: [gods[0], c1, gods[1], c2] as [string, number, string, number],
    }
  })
  // ===== 动态关系修正（L3）：逐条量化，不另发明分数，只修正受影响成分的现有加权分 =====
  const zhis = POS.map((p) => quad[p][1])
  const stems = POS.map((p) => quad[p][0])
  const SANHE: [string[], Wx][] = [[['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'], [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金']]
  const SANHUI: [string[], Wx][] = [[['寅', '卯', '辰'], '木'], [['巳', '午', '未'], '火'], [['申', '酉', '戌'], '金'], [['亥', '子', '丑'], '水']]
  const adjW = new Map<string, number>(contribs.map((c) => [c.id, c.weighted]))
  const adjCamp = new Map<string, '同党' | '异党'>(contribs.map((c) => [c.id, c.camp]))
  const cumFactor = new Map<string, number>(contribs.map((c) => [c.id, 1]))
  const contribById = new Map(contribs.map((c) => [c.id, c]))
  const PER_REL_CAP = 18
  const TOTAL_CAP = Math.min(32, Math.max(18, (baseSupport + baseDrain) * 0.20))
  let cumAbsUsed = 0
  const adjustments: Adjustment[] = []
  const chongPairs: [number, number][] = []
  const CHONG_SET = new Set(['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'])
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    if (CHONG_SET.has(zhis[i] + zhis[j]) || CHONG_SET.has(zhis[j] + zhis[i])) chongPairs.push([i, j])
  }
  const inChong = new Set<number>(chongPairs.flat())
  const posOfZhi = (z: string) => POS.filter((pp) => quad[pp][1] === z)
  function huaConditions(wx: Wx, partPos: string[]): { label: string; met: boolean }[] {
    const monthWx = ZHI_WX[monthZhi]
    const keZhe = (Object.entries(KE).find(([, v]) => v === wx) || [])[0] as Wx | undefined
    const strongBreakStem = POS.some((pp) => GAN_WX[quad[pp][0]] === keZhe && hasRootOf(quad[pp][0], quad))
    return [
      { label: `月令支持化气（月支${monthZhi}属${monthWx}，同气或生${wx}）`, met: monthWx === wx || SHENG[monthWx] === wx },
      { label: `化神${wx}透干（不含日干）`, met: stems.some((g, idx) => idx !== 2 && GAN_WX[g] === wx) },
      { label: `无有根克星破局（克${wx}者${keZhe || ''}透干有根则破）`, met: !strongBreakStem },
      { label: '局支无冲破', met: !partPos.some((pp) => inChong.has(POS.indexOf(pp as any))) },
    ]
  }
  function curTotals() {
    let sup = 0, dr = 0
    for (const c of contribs) { const w = adjW.get(c.id) || 0; if (adjCamp.get(c.id) === '同党') sup += w; else dr += w }
    return { sup, dr, ratio: sup + dr > 0 ? sup / (sup + dr) : 0.5 }
  }
  let crossMarked = false
  function applyAdj(adj: Omit<Adjustment, 'delta' | 'deltaSupport' | 'deltaDrain' | 'affects' | 'capped' | 'crossGrade' | 'applied'>, specs: { c: Contribution; factor: number }[], transfer?: { c: Contribution; toWx: Wx }) {
    const affects: AdjAffect[] = []
    let dSup = 0, dDr = 0, moveAbs = 0
    if (transfer) {
      const c = transfer.c
      const before = adjW.get(c.id) || 0
      const oldCamp = adjCamp.get(c.id) || c.camp
      const newRel = relation(transfer.toWx, dayWx)
      const newCamp: '同党' | '异党' = newRel === '比劫' || newRel === '印' ? '同党' : '异党'
      if (newCamp !== oldCamp) {
        if (newCamp === '同党') { dSup += before; dDr -= before } else { dSup -= before; dDr += before }
        moveAbs = before
        adjCamp.set(c.id, newCamp)
        affects.push({ contribId: c.id, source: `${c.source}（阵营 ${oldCamp}→${newCamp}，化${transfer.toWx}）`, before, after: before, delta: 0 })
      }
    }
    for (const { c, factor } of specs) {
      const before = adjW.get(c.id) || 0
      const cum = cumFactor.get(c.id) || 1
      const clampedCum = Math.min(1.45, Math.max(0.45, cum * factor))
      const eff = cum > 0 ? clampedCum / cum : factor
      let after = before * eff
      let delta = after - before
      if (Math.abs(delta) < 0.005) continue
      affects.push({ contribId: c.id, source: c.source, before: Math.round(before * 1000) / 1000, after: Math.round(after * 1000) / 1000, delta: Math.round(delta * 1000) / 1000 })
      if (adjCamp.get(c.id) === '同党') dSup += delta; else dDr += delta
      moveAbs += Math.abs(delta)
      adjW.set(c.id, after); cumFactor.set(c.id, clampedCum)
    }
    // 封顶：单条与总修正
    let capped = false
    const allowance = Math.max(0, TOTAL_CAP - cumAbsUsed)
    const realScale = moveAbs > 0 ? Math.min(1, PER_REL_CAP / moveAbs, allowance / moveAbs) : 1
    if (realScale < 1 && affects.length) {
      capped = true
      // 回滚已写 adjW/adjCamp 后按比例重算（transfer 的阵营转移不缩放分值，只缩放 moveAbs 记账）
      for (const af of affects) {
        if (af.delta === 0) continue
        const nd = af.delta * realScale
        const nw = af.before + nd
        adjW.set(af.contribId, nw)
        const dc = nd - af.delta
        if (adjCamp.get(af.contribId) === '同党') dSup += dc; else dDr += dc
        af.after = Math.round(nw * 1000) / 1000; af.delta = Math.round(nd * 1000) / 1000
      }
      moveAbs *= realScale
    }
    cumAbsUsed += moveAbs
    const applied = affects.length > 0 && (Math.abs(dSup) > 0.01 || Math.abs(dDr) > 0.01 || affects.some((a) => a.source.includes('阵营')))
    let cross = false
    if (applied && !crossMarked) { const t = curTotals(); if (gradeOf(t.ratio) !== baseGrade) { cross = true; crossMarked = true } }
    adjustments.push({ ...adj, delta: Math.round((dSup + dDr) * 1000) / 1000, deltaSupport: Math.round(dSup * 1000) / 1000, deltaDrain: Math.round(dDr * 1000) / 1000, affects, capped, crossGrade: cross, applied })
  }
  const branchSpecs = (poss: string[], wx: Wx | null, bureauFactor: number, nonFactor: number) => {
    const specs: { c: Contribution; factor: number }[] = []
    for (const c of contribs) if (c.kind === '支' && poss.includes(c.pos)) specs.push({ c, factor: wx && c.wuxing === wx ? bureauFactor : nonFactor })
    return specs
  }
  const usedBureauPos = new Set<string>()
  // 1) 三会 / 三合（完整局）
  for (const [kind, table] of [['三会', SANHUI], ['三合', SANHE]] as const) {
    for (const [trio, wx] of table) {
      if (!trio.every((z) => zhis.includes(z))) continue
      const poss = trio.map((z) => posOfZhi(z)[0])
      if (poss.some((pp) => usedBureauPos.has(pp))) continue
      poss.forEach((pp) => usedBureauPos.add(pp))
      const conds = huaConditions(wx, poss)
      const isHua = conds.every((c) => c.met)
      applyAdj({
        relation: `${trio.join('')}${kind}${wx}${kind === '三会' ? '方' : '局'}`, type: kind, category: isHua ? '化气' : '合局增力',
        participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp as keyof Quad][1]}`),
        verdict: isHua ? '化气成立' : '合而不化·增力', conditions: conds,
        note: isHua ? `${wx}成分增力、局内非${wx}成分按化气减力（系数为本站工程取值）` : '化气条件未全齐，只按成局增力，不改五行归属',
      }, branchSpecs(poss, wx, kind === '三会' ? 1.25 : 1.20, isHua ? 0.85 : 1.0))
    }
  }
  // 2) 半合（未被完整局占用者）
  const BANHE: { pair: [string, string]; wx: Wx; strong: boolean }[] = []
  for (const [trio, wx] of SANHE) {
    const [sheng, wang, mu] = trio
    BANHE.push({ pair: [sheng, wang], wx, strong: true }, { pair: [wang, mu], wx, strong: true }, { pair: [sheng, mu], wx, strong: false })
  }
  const usedBanhePos = new Set<string>()
  for (const bh of BANHE) {
    if (!bh.pair.every((z) => zhis.includes(z))) continue
    const poss = bh.pair.map((z) => posOfZhi(z)[0])
    if (poss.some((pp) => usedBureauPos.has(pp) || usedBanhePos.has(pp))) continue
    poss.forEach((pp) => usedBanhePos.add(pp))
    applyAdj({
      relation: `${bh.pair.join('')}半合${bh.wx}`, type: '半合', category: '合局增力',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp as keyof Quad][1]}`),
      verdict: bh.strong ? '半合（含旺支）增力' : '拱合（无旺支）弱增力',
      conditions: [{ label: '旺支在局', met: bh.strong }, { label: '完整三合未齐', met: true }],
      note: '半合不作化气，只增力',
    }, branchSpecs(poss, bh.wx, bh.strong ? 1.06 : 1.03, 1.0))
  }
  // 3) 六合
  const LIUHE: Record<string, Wx> = { 子丑: '土', 寅亥: '木', 卯戌: '火', 辰酉: '金', 巳申: '水', 午未: '土' }
  const liuheOf = (a: string, b: string) => LIUHE[a + b] || LIUHE[b + a]
  const usedLiuhe = new Set<number>()
  const liuheCand: [number, number][] = []
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (liuheOf(zhis[i], zhis[j])) liuheCand.push([i, j])
  liuheCand.sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]))
  for (const [i, j] of liuheCand) {
    if (usedLiuhe.has(i) || usedLiuhe.has(j)) continue
    usedLiuhe.add(i); usedLiuhe.add(j)
    const huaWx = liuheOf(zhis[i], zhis[j])!
    const poss = [POS[i], POS[j]]
    const conds = huaConditions(huaWx, poss)
    const isHua = conds.every((c) => c.met) // 六合化气同严：月令+透干（不含日干）+无破+无冲全齐才化
    applyAdj({
      relation: `${zhis[i]}${zhis[j]}六合化${huaWx}`, type: '六合', category: isHua ? '化气' : '合绊',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp][1]}`),
      verdict: isHua ? '化气成立' : '合绊（未化）', conditions: conds,
      note: isHua ? '六合化气：化气成分增力、非化气成分减力' : '合而不化按合绊：两支成分活动受绊，小幅减力，不改归属',
    }, isHua ? branchSpecs(poss, huaWx, 1.12, 0.90) : poss.flatMap((pp) => contribs.filter((c) => c.kind === '支' && c.pos === pp && c.level === '本').map((c) => ({ c, factor: 0.95 }))))
  }
  // 4) 天干五合
  const GANHE: Record<string, Wx> = { 甲己: '土', 己甲: '土', 乙庚: '金', 庚乙: '金', 丙辛: '水', 辛丙: '水', 丁壬: '木', 壬丁: '木', 戊癸: '火', 癸戊: '火' }
  const usedGanHe = new Set<number>()
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    if (usedGanHe.has(i) || usedGanHe.has(j)) continue
    const wx = GANHE[stems[i] + stems[j]]
    if (!wx) continue
    usedGanHe.add(i); usedGanHe.add(j)
    const adjacent = Math.abs(i - j) === 1
    const conds = [
      { label: '两干相邻（贴合）', met: adjacent },
      { label: `月令支持化${wx}`, met: ZHI_WX[monthZhi] === wx || SHENG[ZHI_WX[monthZhi]] === wx },
      { label: '无争合/妒合（同合干不重复出现）', met: stems.filter((g) => g === stems[i]).length === 1 && stems.filter((g) => g === stems[j]).length === 1 },
    ]
    const isHua = conds.every((c) => c.met)
    // 取可修正的天干成分（日干不在 contribs 中，日干参与合化时只记另一干，日干本身不计分）
    const targets = [POS[i], POS[j]].map((pp) => contribs.find((c) => c.id === `${pp}.stem`)).filter(Boolean) as Contribution[]
    if (isHua && targets.length) {
      // 化气：第一个目标干按化气五行转移阵营（两干同化，逐干处理会重复转移同一分，故逐干各转各的）
      for (const t of targets) {
        applyAdj({
          relation: `${stems[i]}${stems[j]}天干合化${wx}`, type: '天干合', category: '化气',
          participants: [`${POS_CN[POS[i]]}干${stems[i]}`, `${POS_CN[POS[j]]}干${stems[j]}`],
          verdict: '化气成立·阵营转移', conditions: conds,
          note: `合化${wx}：该干按${wx}与日主关系重新归营，分值不变、阵营可变`,
        }, [], { c: t, toWx: wx })
      }
    } else if (targets.length) {
      applyAdj({
        relation: `${stems[i]}${stems[j]}天干五合`, type: '天干合', category: '合绊',
        participants: [`${POS_CN[POS[i]]}干${stems[i]}`, `${POS_CN[POS[j]]}干${stems[j]}`],
        verdict: '合绊（未化）', conditions: conds,
        note: '合而不化：两干受绊减力（×0.85），不改五行归属',
      }, targets.map((c) => ({ c, factor: 0.85 })))
    }
  }
  // 5) 六冲（削根：月支被冲最重，日支次之；同对重复支只取一组不重叠配对）
  const usedChong = new Set<number>()
  for (const [i, j] of [...chongPairs].sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]))) {
    if (usedChong.has(i) || usedChong.has(j)) continue
    usedChong.add(i); usedChong.add(j)
    const poss = [POS[i], POS[j]]
    const specs: { c: Contribution; factor: number }[] = []
    for (const pp of poss) {
      const rootF = pp === 'month' ? 0.70 : 0.75
      for (const c of contribs) {
        if (c.kind !== '支' || c.pos !== pp) continue
        if (GAN_WX[c.gan] === dayWx) specs.push({ c, factor: rootF })
        else if (c.level === '本') specs.push({ c, factor: 0.85 })
      }
    }
    const rootHit = specs.some(({ c }) => GAN_WX[c.gan] === dayWx)
    applyAdj({
      relation: `${zhis[i]}${zhis[j]}六冲`, type: '冲', category: '冲',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp][1]}`),
      verdict: '冲·削根', conditions: [{ label: '月支在冲', met: poss.includes('month') }, { label: '日主根在被冲支', met: rootHit }],
      note: `冲削：日主根 月支×0.70/他支×0.75，本气×0.85，余藏干不动${rootHit ? '；被冲支含日主根，根气同步受削（不清空）' : ''}`,
    }, specs)
  }
  // 6) 刑（全三刑 > 对刑 > 自刑；与冲重叠的寅申对不在对刑重复计）
  const XING_TRIO: string[][] = [['寅', '巳', '申'], ['丑', '戌', '未']]
  const xingDone = new Set<string>()
  for (const trio of XING_TRIO) {
    if (!trio.every((z) => zhis.includes(z))) continue
    const poss = trio.map((z) => posOfZhi(z)[0]); poss.forEach((pp) => xingDone.add(pp))
    applyAdj({
      relation: `${trio.join('')}三刑全`, type: '刑', category: '刑',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp as keyof Quad][1]}`),
      verdict: '三刑全·损伤', conditions: [{ label: '三支齐全', met: true }],
      note: '三刑全：三支本气 ×0.92（损伤提示性修正，不清零）',
    }, poss.flatMap((pp) => contribs.filter((c) => c.kind === '支' && c.pos === pp).map((c) => ({ c, factor: 0.95 }))))
  }
  const XING_PAIRS: [string, string][] = [['寅', '巳'], ['巳', '申'], ['丑', '戌'], ['戌', '未'], ['子', '卯']]
  const usedXingPair = new Set<string>()
  for (const [a, b] of XING_PAIRS) {
    if (!zhis.includes(a) || !zhis.includes(b)) continue
    const poss = [posOfZhi(a)[0], posOfZhi(b)[0]]
    if (poss.some((pp) => xingDone.has(pp) || usedXingPair.has(pp))) continue
    poss.forEach((pp) => usedXingPair.add(pp))
    applyAdj({
      relation: `${a}${b}相刑`, type: '刑', category: '刑',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp as keyof Quad][1]}`),
      verdict: '对刑·小损伤', conditions: [{ label: '三刑未全，对刑成立', met: true }],
      note: '对刑：两支成分 ×0.95',
    }, poss.flatMap((pp) => contribs.filter((c) => c.kind === '支' && c.pos === pp && c.level === '本').map((c) => ({ c, factor: 0.95 }))))
  }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    if (zhis[i] === zhis[j] && '辰午酉亥'.includes(zhis[i])) {
      const poss = [POS[i], POS[j]]
      applyAdj({
        relation: `${zhis[i]}${zhis[j]}自刑`, type: '自刑', category: '刑',
        participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp][1]}`),
        verdict: '自刑·小损伤', conditions: [{ label: '自刑支重见', met: true }],
        note: '自刑：两支成分 ×0.95',
      }, poss.flatMap((pp) => contribs.filter((c) => c.kind === '支' && c.pos === pp).map((c) => ({ c, factor: 0.95 }))))
    }
  }
  // 7) 六害
  const HAI_PAIRS = new Set(['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'])
  const usedHai = new Set<number>()
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    if (usedHai.has(i) || usedHai.has(j)) continue
    const k = [zhis[i], zhis[j]].sort().join('')
    const hit = [...HAI_PAIRS].some((h) => h.split('').sort().join('') === k)
    if (!hit) continue
    usedHai.add(i); usedHai.add(j)
    const poss = [POS[i], POS[j]]
    // 寅巳已作对刑时不重复（同对只计更重者：刑 0.92 < 害 0.93，已计刑则害只提示）
    const alreadyXing = (zhis[i] === '寅' && zhis[j] === '巳') || (zhis[i] === '巳' && zhis[j] === '寅')
    applyAdj({
      relation: `${zhis[i]}${zhis[j]}六害`, type: '害', category: '害',
      participants: poss.map((pp) => `${POS_CN[pp]}支${quad[pp][1]}`),
      verdict: alreadyXing ? '六害（与对刑重叠，只计刑）' : '六害·小损伤',
      conditions: [{ label: '害对成立', met: true }],
      note: alreadyXing ? '与寅巳对刑重叠，避免重复削分，本条不重复计' : '六害：两支成分 ×0.96',
    }, alreadyXing ? [] : poss.flatMap((pp) => contribs.filter((c) => c.kind === '支' && c.pos === pp && c.level === '本').map((c) => ({ c, factor: 0.96 }))))
  }
  // 汇总修正后
  for (const c of contribs) c.adjustedWeighted = Math.round((adjW.get(c.id) || 0) * 1000) / 1000
  const adjTotals = curTotals()
  const support = adjTotals.sup, drain = adjTotals.dr
  const ratio = adjTotals.ratio
  const grade = gradeOf(ratio)
  const deltaSupport = support - baseSupport, deltaDrain = drain - baseDrain
  const crossGrade = grade !== baseGrade
  const crossNote = crossGrade ? `关系修正使档位由「${baseGrade}」跨至「${grade}」，主因见 L3 标★条目` : null
  // 五因子（基础分与修正分并行：ally/enemy 为修正后，allyBase/enemyBase 为基础）
  const byRel = (r: string) => contribs.filter((c) => c.relation === r)
  const sum = (list: Contribution[]) => list.reduce((a, c) => a + c.weighted, 0)
  const sumAdj = (list: Contribution[]) => list.reduce((a, c) => a + (adjW.get(c.id) || 0), 0)
  const sumAdjCamp = (list: Contribution[], camp: string) => list.filter((c) => adjCamp.get(c.id) === camp).reduce((a, c) => a + (adjW.get(c.id) || 0), 0)
  const monthItems = contribs.filter((c) => c.pos === 'month' && c.kind === '支')
  const rootItems = contribs.filter((c) => c.kind === '支' && c.camp === '同党' && c.pos !== 'month')
  const dmStatus = wangxiang(dayWx, monthZhi)
  const siling = opts?.daysAfterJie != null ? silingGan(monthZhi, opts.daysAfterJie) : null
  const adjTag = (base: number, adj: number) => Math.abs(adj - base) > 0.05 ? `（修正 ${adj - base >= 0 ? '+' : ''}${(adj - base).toFixed(1)}）` : ''
  const factors = [
    { key: 'deling', name: '得令（月令）', ally: Math.round(sumAdjCamp(monthItems, '同党') * 10) / 10, enemy: Math.round(sumAdjCamp(monthItems, '异党') * 10) / 10, allyBase: Math.round(sum(monthItems.filter((c) => c.camp === '同党')) * 10) / 10, enemyBase: Math.round(sum(monthItems.filter((c) => c.camp === '异党')) * 10) / 10, text: `${monthZhi}月，日主${dayWx}处「${dmStatus}」地；月支成分同党 ${sumAdjCamp(monthItems, '同党').toFixed(1)} / 异党 ${sumAdjCamp(monthItems, '异党').toFixed(1)}（修正后，含月令×2.0）`, items: monthItems.map((c) => c.id) },
    { key: 'dedi', name: '得地（通根）', ally: Math.round(sumAdj(rootItems) * 10) / 10, enemy: 0, allyBase: Math.round(sum(rootItems) * 10) / 10, enemyBase: 0, text: hasRoot ? `强根闸过：${rootNotes.join('、')}${adjTag(sum(rootItems), sumAdj(rootItems))}` : '无长生/临官/帝旺强根，同五行根亦未过阈', items: rootItems.map((c) => c.id) },
    { key: 'yin', name: '印（生我）', ally: Math.round(sumAdj(byRel('印')) * 10) / 10, enemy: 0, allyBase: Math.round(sum(byRel('印')) * 10) / 10, enemyBase: 0, text: `印成分 ${byRel('印').length} 个，基础 ${sum(byRel('印')).toFixed(1)} 分${adjTag(sum(byRel('印')), sumAdj(byRel('印')))}`, items: byRel('印').map((c) => c.id) },
    { key: 'bijie', name: '比劫（同我）', ally: Math.round(sumAdj(byRel('比劫')) * 10) / 10, enemy: 0, allyBase: Math.round(sum(byRel('比劫')) * 10) / 10, enemyBase: 0, text: `比劫成分 ${byRel('比劫').length} 个，基础 ${sum(byRel('比劫')).toFixed(1)} 分${adjTag(sum(byRel('比劫')), sumAdj(byRel('比劫')))}`, items: byRel('比劫').map((c) => c.id) },
    { key: 'kexie', name: '克泄耗（异党）', ally: 0, enemy: Math.round(sumAdjCamp(contribs.filter((c) => c.camp === '异党' || adjCamp.get(c.id) === '异党'), '异党') * 10) / 10, allyBase: 0, enemyBase: Math.round(sum(contribs.filter((c) => c.camp === '异党')) * 10) / 10, text: `食伤/财/官杀基础 ${sum(contribs.filter((c) => c.camp === '异党')).toFixed(1)} 分，修正后异党合计 ${drain.toFixed(1)}`, items: contribs.filter((c) => c.camp === '异党').map((c) => c.id) },
  ]
  // 双轨闸
  const ratioWeak = baseRatio <= 0.12 && !hasRoot
  const ratioStrong = baseRatio >= 0.88 && hasRoot
  const supportStemsRootless = POS.filter((p) => p !== 'day').every((p) => {
    const g = quad[p][0]
    return !(relation(GAN_WX[g], dayWx) === '比劫' || relation(GAN_WX[g], dayWx) === '印') || !hasRootOf(g, quad)
  })
  const congConditions = [
    { label: `月令异党当令（${monthZhi}本气${HIDDEN[monthZhi][0][0]}为${relation(GAN_WX[HIDDEN[monthZhi][0][0]], dayWx)}）`, met: relation(GAN_WX[HIDDEN[monthZhi][0][0]], dayWx) === '财' || relation(GAN_WX[HIDDEN[monthZhi][0][0]], dayWx) === '官杀' || relation(GAN_WX[HIDDEN[monthZhi][0][0]], dayWx) === '食伤' },
    { label: '日主无强根', met: !hasRoot },
    { label: '同党天干均无根', met: supportStemsRootless },
  ]
  const keWx = KE_ME[dayWx]
  const keStemBreak = POS.filter((p) => p !== 'day').some((p) => GAN_WX[quad[p][0]] === keWx && hasRootOf(quad[p][0], quad))
  const bureau = SANHE.concat(SANHUI).some(([trio, wx]) => wx === dayWx && trio.every((z) => zhis.includes(z)))
  const zhuanConditions = [
    { label: `月令同气（${monthZhi}属${ZHI_WX[monthZhi]}，日主${dayWx}）`, met: ZHI_WX[monthZhi] === dayWx },
    { label: '地支三合/三会成日主局', met: bureau },
    { label: '无透干克星破格（克星无根亦可）', met: !keStemBreak },
  ]
  const congSuspect = congConditions.every((c) => c.met)
  const zhuanSuspect = zhuanConditions.every((c) => c.met)
  let congKind: string | null = null
  if (congSuspect) {
    const drainElems = elementPower.filter((e) => ['食伤', '财', '官杀'].includes(relation(e.wuxing, dayWx))).sort((a, b) => b.weighted - a.weighted)
    congKind = drainElems.length ? `从${relation(drainElems[0].wuxing, dayWx)}` : '从格'
  }
  return {
    grade, ratio: Math.round(ratio * 10000) / 10000,
    support: Math.round(support * 1000) / 1000, drain: Math.round(drain * 1000) / 1000,
    baseGrade, baseRatio: Math.round(baseRatio * 10000) / 10000,
    baseSupport: Math.round(baseSupport * 1000) / 1000, baseDrain: Math.round(baseDrain * 1000) / 1000,
    deltaSupport: Math.round(deltaSupport * 1000) / 1000, deltaDrain: Math.round(deltaDrain * 1000) / 1000,
    crossGrade, crossNote,
    hasRoot, rootNotes, contributions: contribs, factors, elementPower, monthState,
    deling: {
      badge: dmStatus === '旺' || dmStatus === '相' ? '得令' : dmStatus === '休' ? '半得令' : '失令',
      monthZhi, silingGan: siling, silingTenGod: siling ? tenGod(siling, dayGan) : null,
      daysAfterJie: opts?.daysAfterJie ?? null, dmChangSheng: dishi(dayGan, monthZhi), jieqiFromPrev: opts?.jieqiFromPrev ?? null,
    },
    gates: {
      ratioWeak, ratioStrong,
      cong: { suspect: congSuspect, kind: congKind, conditions: congConditions },
      zhuan: { suspect: zhuanSuspect, conditions: zhuanConditions },
    },
    adjustments,
    trace: `口径：量化打分派（tianzhi-core 连乘权重，MIT 复用）；同党=比劫+印，异党=食伤+财+官杀；ratio 五档 0.26/0.35/0.48/0.61（3000 随机盘分位数标定）；动态关系修正已逐条计入（化气/合绊/冲刑害系数与封顶见 L3，本站工程取值）；基础与修正后双值并存，档位以修正后为准；司令${monthSiling ? '已加权×1.1' : '仅展示未加权（与真实盘测试口径一致）'}；专旺/从格为结构闸疑似标注，不自动反转喜忌。`,
  }
}
