// 日主强弱引擎（量化打分派）
// 蓝本：zaoxu001/tianzhi-core（MIT）strength.py 成分连乘模型，前端 TS 等价移植
// 成分 = 4 天干 + 4 地支藏干展开；权重 = 基础分 × 根气 × 纯气 × 月令 × 司令 × 贴身 × 虚透
// ratio = 同党/(同党+异党)，五档阈值 0.26/0.35/0.48/0.61（3000 随机盘分位数标定，原样保留）
// 专旺/从格走双轨：ratio 硬闸只作极端提示，结构闸另判「疑似」，不自动反转喜忌
// month_siling 默认 null（不加司令权），与真实盘测试口径一致；司令仅在得令展开中展示
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
}
export interface Adjustment { relation: string; type: string; participants: string[]; delta: number; applied: boolean; note: string }
export interface MonthStateRow {
  wuxing: Wx; status: string; relationToDM: string; weighted: number; share: number
  counts: { main: number; hidden: number }; tenGodPair: [string, number, string, number]
}
export interface StrengthResult {
  grade: string; ratio: number; support: number; drain: number; hasRoot: boolean; rootNotes: string[]
  contributions: Contribution[]
  factors: { key: string; name: string; ally: number; enemy: number; text: string; items: string[] }[]
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
      contribs.push({ id: `${pos}.stem`, pillar: POS_CN[pos], pos, source: `${POS_CN[pos]}干${gan}`, char: gan, gan, kind: '干', level: '透', wuxing: wx, tenGod: tenGod(gan, dayGan), relation: rel, camp: rel === '比劫' || rel === '印' ? '同党' : '异党', base: GAN_BASE, multipliers: mults, weighted: w })
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
      contribs.push({ id: `${pos}.branch.${hg}`, pillar: POS_CN[pos], pos, source: `${POS_CN[pos]}支${zhi}藏${hg}`, char: zhi, gan: hg, kind: '支', level, wuxing: wx, tenGod: tenGod(hg, dayGan), relation: rel, camp: rel === '比劫' || rel === '印' ? '同党' : '异党', base: ZHI_BASE, multipliers: mults, weighted: w })
    }
  }
  const support = contribs.filter((c) => c.camp === '同党').reduce((a, c) => a + c.weighted, 0)
  const drain = contribs.filter((c) => c.camp === '异党').reduce((a, c) => a + c.weighted, 0)
  const ratio = support + drain > 0 ? support / (support + drain) : 0.5
  const grade = ratio >= RATIO_BANDS[3] ? '身旺' : ratio >= RATIO_BANDS[2] ? '偏旺' : ratio <= RATIO_BANDS[0] ? '身弱' : ratio <= RATIO_BANDS[1] ? '偏弱' : '中和'
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
  // 五因子（印/比劫/克泄耗为阵营划分，得令/得地为视角子集，分别注明）
  const byRel = (r: string) => contribs.filter((c) => c.relation === r)
  const sum = (list: Contribution[]) => list.reduce((a, c) => a + c.weighted, 0)
  const monthItems = contribs.filter((c) => c.pos === 'month' && c.kind === '支')
  const rootItems = contribs.filter((c) => c.kind === '支' && c.camp === '同党' && c.pos !== 'month')
  const dmStatus = wangxiang(dayWx, monthZhi)
  const siling = opts?.daysAfterJie != null ? silingGan(monthZhi, opts.daysAfterJie) : null
  const factors = [
    { key: 'deling', name: '得令（月令）', ally: Math.round(sum(monthItems.filter((c) => c.camp === '同党')) * 10) / 10, enemy: Math.round(sum(monthItems.filter((c) => c.camp === '异党')) * 10) / 10, text: `${monthZhi}月，日主${dayWx}处「${dmStatus}」地；月支成分同党 ${sum(monthItems.filter((c) => c.camp === '同党')).toFixed(1)} / 异党 ${sum(monthItems.filter((c) => c.camp === '异党')).toFixed(1)}（视角子集，含月令×2.0）`, items: monthItems.map((c) => c.id) },
    { key: 'dedi', name: '得地（通根）', ally: Math.round(sum(rootItems) * 10) / 10, enemy: 0, text: hasRoot ? `强根闸过：${rootNotes.join('、')}` : '无长生/临官/帝旺强根，同五行根亦未过阈', items: rootItems.map((c) => c.id) },
    { key: 'yin', name: '印（生我）', ally: Math.round(sum(byRel('印')) * 10) / 10, enemy: 0, text: `印成分 ${byRel('印').length} 个，合计 ${sum(byRel('印')).toFixed(1)} 分`, items: byRel('印').map((c) => c.id) },
    { key: 'bijie', name: '比劫（同我）', ally: Math.round(sum(byRel('比劫')) * 10) / 10, enemy: 0, text: `比劫成分 ${byRel('比劫').length} 个，合计 ${sum(byRel('比劫')).toFixed(1)} 分`, items: byRel('比劫').map((c) => c.id) },
    { key: 'kexie', name: '克泄耗（异党）', ally: 0, enemy: Math.round(sum(contribs.filter((c) => c.camp === '异党')) * 10) / 10, text: `食伤/财/官杀合计 ${sum(contribs.filter((c) => c.camp === '异党')).toFixed(1)} 分`, items: contribs.filter((c) => c.camp === '异党').map((c) => c.id) },
  ]
  // L3 关系（逐条提示，不计分）
  const adjustments: Adjustment[] = []
  const zhis = POS.map((p) => quad[p][1])
  const LIUHE: Record<string, string> = { 子丑: '土', 丑子: '土', 寅亥: '木', 亥寅: '木', 卯戌: '火', 戌卯: '火', 辰酉: '金', 酉辰: '金', 巳申: '水', 申巳: '水', 午未: '土', 未午: '土' }
  const CHONG = new Set(['子午', '午子', '丑未', '未丑', '寅申', '申寅', '卯酉', '酉卯', '辰戌', '戌辰', '巳亥', '亥巳'])
  const HAI = new Set(['子未', '未子', '丑午', '午丑', '寅巳', '巳寅', '卯辰', '辰卯', '申亥', '亥申', '酉戌', '戌酉'])
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = zhis[i], b = zhis[j], key = a + b
    if (LIUHE[key]) adjustments.push({ relation: `${a}${b}六合化${LIUHE[key]}`, type: '合', participants: [`${POS_CN[POS[i]]}支${a}`, `${POS_CN[POS[j]]}支${b}`], delta: 0, applied: false, note: '合化不计入旺衰分（tianzhi 原口径），仅提示' })
    if (CHONG.has(key)) adjustments.push({ relation: `${a}${b}六冲`, type: '冲', participants: [`${POS_CN[POS[i]]}支${a}`, `${POS_CN[POS[j]]}支${b}`], delta: 0, applied: false, note: '冲不削根计分，仅提示' })
    if (HAI.has(key)) adjustments.push({ relation: `${a}${b}六害`, type: '害', participants: [`${POS_CN[POS[i]]}支${a}`, `${POS_CN[POS[j]]}支${b}`], delta: 0, applied: false, note: '仅提示，不计分' })
    if ((['寅巳', '巳申', '申寅', '丑戌', '戌未', '未丑'].includes(key) || key === '子卯' || key === '卯子')) adjustments.push({ relation: `${a}${b}相刑`, type: '刑', participants: [`${POS_CN[POS[i]]}支${a}`, `${POS_CN[POS[j]]}支${b}`], delta: 0, applied: false, note: '仅提示，不计分' })
    if (a === b && '辰午酉亥'.includes(a)) adjustments.push({ relation: `${a}${b}自刑`, type: '自刑', participants: [`${POS_CN[POS[i]]}支${a}`, `${POS_CN[POS[j]]}支${b}`], delta: 0, applied: false, note: '仅提示，不计分' })
  }
  const SANHE: [string[], Wx][] = [[['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'], [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金']]
  const SANHUI: [string[], Wx][] = [[['寅', '卯', '辰'], '木'], [['巳', '午', '未'], '火'], [['申', '酉', '戌'], '金'], [['亥', '子', '丑'], '水']]
  for (const [trio, wx] of SANHE) if (trio.every((z) => zhis.includes(z))) adjustments.push({ relation: `${trio.join('')}三合${wx}局`, type: '合局', participants: trio, delta: 0, applied: false, note: '合局不计入旺衰分，仅提示（结构闸另看）' })
  for (const [trio, wx] of SANHUI) if (trio.every((z) => zhis.includes(z))) adjustments.push({ relation: `${trio.join('')}三会${wx}方`, type: '会局', participants: trio, delta: 0, applied: false, note: '会局不计入旺衰分，仅提示（结构闸另看）' })
  // 双轨闸
  const ratioWeak = ratio <= 0.12 && !hasRoot
  const ratioStrong = ratio >= 0.88 && hasRoot
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
    trace: `口径：量化打分派（tianzhi-core 连乘权重，MIT 复用）；同党=比劫+印，异党=食伤+财+官杀；ratio 五档 0.26/0.35/0.48/0.61（3000 随机盘分位数标定）；合化/合局不计入旺衰分，关系层仅提示；司令${monthSiling ? '已加权×1.1' : '仅展示未加权（与真实盘测试口径一致）'}；专旺/从格为结构闸疑似标注，不自动反转喜忌。`,
  }
}
