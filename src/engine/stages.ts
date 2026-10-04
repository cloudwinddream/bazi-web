// 后续推导阶段：调候 → 格局 → 命局多寡 → 最终用神（均为候选层，不混进强弱分）
// 口径声明：
// - 调候：按《穷通宝鉴》十干×十二月 120 格逐格查表（tianzhi-core 核对版数据，MIT，见 tiaohou-data.ts）
//   + 病药剔除（全盘最旺五行为病，古表用神正为病者剔除，全剔时保留首用兜底）；气候定性仅作季节标签展示
// - 格局：按《子平真诠》月令取格——月支本气十神为格，透干为引线；建禄/羊刃另列。成破只列判定条件，不硬断
// - 用神：三路汇合（扶抑/调候/格局顺逆），冲突时优先级：气候极端时调候优先，否则格局为主、扶抑校验；从格疑似不自动反转
import { GAN_WX, ZHI_WX, HIDDEN, relation, tenGod, type Quad, type StrengthResult, type Wx, WX_ORDER } from './strength.js'
import { TIAOHOU_TABLE } from './tiaohou-data.js'

export interface StageCheck { label: string; met: boolean; note?: string }
export interface TiaoHouResult {
  climate: string; season: string; need: string[]; needText: string; present: boolean; presentText: string; checks: StageCheck[]; extreme: boolean
  gods: string[]; primaryGod: string; kept: string[]; dropped: string[]; bing: string; fallback: boolean; tableText: string
}
export interface GeJuResult { name: string; basis: string; touText: string; yongfa: string; checks: StageCheck[]; suspectNote: string | null }
export interface DuoGuaRow { wuxing: Wx; weighted: number; share: number; count: number; level: string; relation: string }
export interface YongShenResult {
  /** 主用神（唯一收敛结果）：五行 + 与日主关系（十神类） */
  primary: { wuxing: string; relation: string; text: string }
  /** 喜神（辅助）：除主用神外的高票候选，降为辅助层 */
  xi: string[]; ji: string[]
  routes: { name: string; xi: string[]; ji: string[]; text: string }[]
  priorityText: string; conflictText: string | null; finalText: string
  /** 三路冲突裁决过程（逐条可追溯） */
  adjudication: string[]
  votes: { wuxing: string; score: number; routes: string[] }[]
  controversial: boolean
}

const wxByRelation = (dm: Wx, rel: string): Wx => WX_ORDER.find((w) => relation(w, dm) === rel) as Wx

export function analyzeStages(quad: Quad, strength: StrengthResult): { tiaohou: TiaoHouResult; geju: GeJuResult; duogua: DuoGuaRow[]; yongshen: YongShenResult } {
  const dayGan = quad.day[0]; const dayWx = GAN_WX[dayGan]; const monthZhi = quad.month[1]
  const stems = [quad.year[0], quad.month[0], quad.day[0], quad.hour[0]]
  const zhis = [quad.year[1], quad.month[1], quad.day[1], quad.hour[1]]
  const elem = (wx: Wx) => strength.elementPower.find((e) => e.wuxing === wx)?.weighted || 0
  // ---- 调候（120 格查表 + 病药剔除） ----
  const season = '亥子丑'.includes(monthZhi) ? '冬' : '巳午未'.includes(monthZhi) ? '夏' : '寅卯辰'.includes(monthZhi) ? '春' : '秋'
  const fire = elem('火'), water = elem('水')
  const wetCnt = zhis.filter((z) => '亥子辰丑'.includes(z)).length
  const dryCnt = zhis.filter((z) => '巳午戌未'.includes(z)).length
  let climate = '气候中和'
  if (season === '冬') climate = '命局偏寒（冬生）'
  else if (season === '夏') climate = '命局偏暖燥（夏生）'
  else if (dryCnt >= 3 && water < 15) climate = '偏燥（燥支多、水弱）'
  else if (wetCnt >= 3 && fire < 15) climate = '偏湿寒（湿支多、火弱）'
  const gods: string[] = (TIAOHOU_TABLE[dayGan] || {})[monthZhi] || []
  const primaryGod = gods[0] || ''
  const godElems: Wx[] = []
  for (const g of gods) { const w = GAN_WX[g]; if (!godElems.includes(w)) godElems.push(w) }
  const bing = (strength.elementPower.reduce((a, e) => (e.weighted > a.weighted ? e : a), strength.elementPower[0])?.wuxing || '') as Wx
  const keptElems = godElems.filter((w) => w !== bing)
  const droppedElems = godElems.filter((w) => w === bing)
  const fallback = keptElems.length === 0 && godElems.length > 0
  const kept = fallback ? godElems.slice(0, 1) : keptElems
  const dropped = fallback ? [] as Wx[] : droppedElems
  const need: Wx[] = [...kept]
  const extreme = season === '冬' || season === '夏'
  const needGans = gods.filter((g) => kept.includes(GAN_WX[g]))
  const presentStem = stems.some((g) => needGans.includes(g))
  const presentRoot = zhis.some((z) => HIDDEN[z].some(([hg]) => needGans.includes(hg)))
  const present = presentStem || presentRoot
  const tiaohou: TiaoHouResult = {
    climate, season: `${season}生（${monthZhi}月）`, need, needText: need.length ? `调候取用（120格）：${gods.join('')}→剔病后喜${need.join('')}（${needGans.join('/') || primaryGod}）` : '120 格无取用记录',
    present, presentText: need.length ? (presentStem ? '调候之气已透干' : presentRoot ? '调候之气藏支有根、未透' : '调候之气局中缺如') : '—',
    extreme,
    gods, primaryGod, kept: kept.map(String), dropped: dropped.map(String), bing: String(bing), fallback,
    tableText: `${dayGan}日${monthZhi}月穷通取用：${gods.join('、') || '—'}（首用${primaryGod || '—'}）${dropped.length ? `；病（最旺）为${bing}，剔除${dropped.join('')}` : `；病为${bing}，无剔除`}${fallback ? '；全数犯病，保留首用兜底' : ''}`,
    checks: [
      { label: `查表：${dayGan}日生${monthZhi}月，穷通取用 ${gods.join('') || '—'}（首用${primaryGod}）`, met: gods.length > 0, note: '120 格逐格表，非季节粗判' },
      { label: `病药剔除：病为${bing}${dropped.length ? `，剔除${dropped.join('')}` : '，无剔除'}${fallback ? '（全剔，首用兜底）' : ''}`, met: true, note: `火 ${fire.toFixed(1)} / 水 ${water.toFixed(1)}，湿支 ${wetCnt}、燥支 ${dryCnt}` },
      { label: `气候定性：${climate}`, met: true },
      { label: '调候气透干', met: presentStem },
      { label: '调候气藏根', met: presentRoot },
    ],
  }
  // ---- 格局 ----
  const mainGan = HIDDEN[monthZhi][0][0]
  const mainTG = tenGod(mainGan, dayGan)
  const isYangDM = '甲丙戊庚壬'.includes(dayGan)
  let geName = `${mainTG}格`
  if (mainTG === '比肩') geName = '建禄格'
  if (mainTG === '劫财') { const renZhi: Record<string, string> = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' }; geName = isYangDM && renZhi[dayGan] === monthZhi ? '羊刃格（月刃）' : '月劫格（劫财当令）' }
  const touMain = stems.some((g, i) => i !== 2 && g === mainGan)
  const touSameWx = stems.some((g, i) => i !== 2 && GAN_WX[g] === GAN_WX[mainGan])
  const midTou = HIDDEN[monthZhi].slice(1).some(([hg]) => stems.some((g, i) => i !== 2 && g === hg))
  const stemTGs = stems.map((g, i) => (i === 2 ? '日主' : tenGod(g, dayGan)))
  const hasTG = (tg: string) => stemTGs.includes(tg)
  const shunyong = ['正官', '正财', '偏财', '正印', '偏印', '食神'].includes(mainTG)
  const geju: GeJuResult = {
    name: geName,
    basis: `月支${monthZhi}本气${mainGan}为${mainTG}（子平月令取格）`,
    touText: touMain ? `格神${mainGan}透干，格有引线` : touSameWx ? `格神同五行透干（${GAN_WX[mainGan]}气透）` : midTou ? '本气未透，中/余气有透干，格藏待引' : '格神未透，格藏支中',
    yongfa: shunyong ? '顺用（喜生扶格神之气）' : '逆用（喜制化格神之气）',
    checks: [
      { label: `月令本气定格：${mainTG}`, met: true },
      { label: '格神透干', met: touMain || touSameWx },
      { label: '官杀混杂（正官+七杀同透）', met: hasTG('正官') && hasTG('七杀'), note: '混杂为官格/杀格留意项' },
      { label: '伤官见官（伤官+正官同透）', met: hasTG('伤官') && hasTG('正官'), note: '正官格传统破格项之一' },
      { label: '格神有根（同五行藏根）', met: zhis.some((z) => HIDDEN[z].some(([hg]) => GAN_WX[hg] === GAN_WX[mainGan])) },
    ],
    suspectNote: strength.gates.cong.suspect ? `强弱结构闸疑似${strength.gates.cong.kind}，格局层承接为从格候选（不自动改判）` : strength.gates.zhuan.suspect ? '强弱结构闸专旺疑似，格局层承接为专旺候选（不自动改判）' : null,
  }
  if (geju.suspectNote) geName += '（含特殊格候选，见强弱门槛）'
  // ---- 多寡 ----
  const totalW = strength.elementPower.reduce((a, e) => a + e.weighted, 0)
  const duogua: DuoGuaRow[] = strength.monthState.map((row) => {
    const count = row.counts.main + row.counts.hidden
    const level = count === 0 ? '缺（无字）' : row.share < 0.12 ? '弱' : row.share > 0.34 ? '过旺' : row.share > 0.26 ? '旺' : '平'
    return { wuxing: row.wuxing, weighted: row.weighted, share: row.share, count, level, relation: relation(row.wuxing, dayWx) }
  }).sort((a, b) => b.weighted - a.weighted)
  // ---- 最终用神三路 ----
  const strongSide = ['身旺', '偏旺'].includes(strength.grade)
  const weakSide = ['身弱', '偏弱'].includes(strength.grade)
  const fuyiXi = strongSide ? [wxByRelation(dayWx, '食伤'), wxByRelation(dayWx, '财'), wxByRelation(dayWx, '官杀')] : weakSide ? [wxByRelation(dayWx, '印'), wxByRelation(dayWx, '比劫')] : [wxByRelation(dayWx, '印'), wxByRelation(dayWx, '官杀')]
  const fuyiJi = strongSide ? [wxByRelation(dayWx, '印'), wxByRelation(dayWx, '比劫')] : weakSide ? [wxByRelation(dayWx, '财'), wxByRelation(dayWx, '官杀'), wxByRelation(dayWx, '食伤')] : []
  const geXiMap: Record<string, string[]> = {
    正官: ['印', '财'], 七杀: ['食伤', '印'], 正财: ['食伤', '官杀'], 偏财: ['食伤', '官杀'],
    正印: ['官杀', '财'], 偏印: ['官杀', '财'], 食神: ['财', '比劫'], 伤官: ['印', '财'],
    比肩: ['官杀', '食伤'], 劫财: ['官杀', '食伤'],
  }
  const geXi = (geXiMap[mainTG] || []).map((r) => wxByRelation(dayWx, r))
  const routes = [
    { name: '扶抑（强弱）', xi: fuyiXi.map(String), ji: fuyiJi.map(String), text: `${strength.grade}（修正后 ratio ${strength.ratio.toFixed(3)}）→ ${strongSide ? '喜克泄耗' : weakSide ? '喜生扶' : '中和取平衡'}` },
    { name: '调候（气候）', xi: need.map(String), ji: [] as string[], text: tiaohou.needText + (need.length ? `；${tiaohou.presentText}` : '') },
    { name: '格局（顺逆）', xi: geXi.map(String), ji: [] as string[], text: `${geName} ${geju.yongfa}，格神${mainTG}` },
  ]
  const score = new Map<string, number>()
  const addScore = (list: string[], w: number) => list.forEach((x) => score.set(x, (score.get(x) || 0) + w))
  // 优先级（已声明口径不变）：气候极端且调候缺如时调候最高；否则格局与扶抑同权、调候为辅
  const extremePriority = tiaohou.extreme && !present
  const weights = extremePriority ? [1, 3, 2] : [2, 1, 2] // [扶抑, 调候, 格局]
  addScore(routes[0].xi, weights[0]); addScore(routes[1].xi, weights[1]); addScore(routes[2].xi, weights[2])
  // 票面与出处（每行的票来自哪几路）
  const ranked = [...score.entries()].map(([wuxing, s]) => ({
    wuxing, score: s,
    routes: routes.filter((r) => r.xi.includes(wuxing)).map((r) => r.name.replace(/（.*/, '')),
  })).sort((a, b) => b.score - a.score)
  const candidates = ranked.filter((v) => v.score >= 2)
  const jiSet = new Set(fuyiJi.map(String)); geXi.forEach((x) => jiSet.delete(String(x)))
  // —— 收敛为唯一主用神 ——
  // 裁决顺序：总票高者为主；同票按本盘优先级路序取先出者（极端时 调候>格局>扶抑，否则 格局>扶抑>调候）；
  // 无候选达 2 票时取扶抑首位兜底并标争议。被主用神落败者一律降为喜神（辅助），不并列冒充结论。
  const routeOrder = extremePriority ? ['调候', '格局', '扶抑'] : ['格局', '扶抑', '调候']
  const firstByRoute = (wuxing: string) => { const names = routes.filter((r) => r.xi.includes(wuxing)).map((r) => r.name.replace(/（.*/, '')); const idx = names.map((n) => routeOrder.indexOf(n)).filter((i) => i >= 0); return idx.length ? Math.min(...idx) : 99 }
  let primaryWx: string
  let usedFallback = false
  if (candidates.length) {
    const topScore = candidates[0].score
    const tied = candidates.filter((v) => v.score === topScore)
    tied.sort((a, b) => firstByRoute(a.wuxing) - firstByRoute(b.wuxing))
    primaryWx = tied[0].wuxing
  } else {
    primaryWx = String(fuyiXi[0] || wxByRelation(dayWx, '印'))
    usedFallback = true
  }
  const primaryRel = relation(primaryWx as Wx, dayWx)
  const auxXi = candidates.map((v) => v.wuxing).filter((w) => w !== primaryWx)
  const ji = [...jiSet].filter((x) => x !== primaryWx)
  const conflictWithJi = jiSet.has(primaryWx)
  const topTied = candidates.length > 1 && candidates[1].score === candidates[0].score
  const routeFirsts = routes.map((r) => r.xi[0]).filter(Boolean)
  const routesDisagree = new Set(routeFirsts).size > 1
  const controversial = usedFallback || conflictWithJi || (topTied && routesDisagree)
  const primaryRouteNames = routes.filter((r) => r.xi.includes(primaryWx)).map((r) => r.name.replace(/（.*/, ''))
  const adjudication: string[] = [
    extremePriority
      ? `优先级：本盘气候极端（${tiaohou.season}、${tiaohou.climate}）且调候之气缺如，按已声明口径调候路权重最高（调候3·格局2·扶抑1）`
      : '优先级：非极端缺候盘，格局与扶抑同权（各2）、调候为辅（1）；特殊格疑似不自动反转喜忌',
    `三路票面：${ranked.length ? ranked.map((v) => `${v.wuxing} ${v.score}票（${v.routes.join('、') || '—'}）`).join('；') : '无'}`,
    candidates.length
      ? `得票≥2 的候选共 ${candidates.length} 个：${candidates.map((v) => v.wuxing).join('、')}；取总票最高者为主用神${topTied ? `，同票时按本盘路序（${routeOrder.join('>')}）先出者胜` : ''}`
      : '无候选达 2 票，取扶抑路首位兜底为主用神，并标争议待复核',
    `裁定主用神为「${primaryWx}」（${primaryRel}）：出自${primaryRouteNames.join('、') || '扶抑兜底'}${primaryRouteNames.length > 1 ? '多路共识' : '单路支持、余路未反对到忌层之外'}`,
    auxXi.length ? `其余候选 ${auxXi.join('、')} 票次之，降为喜神（辅助层），不与主用神并列` : '无次级候选，喜神层空缺',
    conflictWithJi ? `注意：主用神 ${primaryWx} 同时落在扶抑忌层——三路冲突未消解，按优先级仍取之为主，标「争议」人工复核` : (ji.length ? `忌神层：${ji.join('、')}（扶抑忌、且未被格局喜抵销者）` : '忌神层无明确标的'),
  ]
  const conflict = candidates.map((v) => v.wuxing).filter((x) => jiSet.has(x))
  const yongshen: YongShenResult = {
    primary: { wuxing: primaryWx, relation: primaryRel, text: `${primaryWx}（${primaryRel}）` },
    xi: auxXi, ji,
    routes,
    priorityText: extremePriority ? '本盘气候偏极且调候缺如：调候优先，格局次之，扶抑校验（已声明口径）；裁决只定一个主用神' : '格局为主、扶抑同权校验、调候为辅；三路冲突按路序裁决出唯一主用神，余者降为喜神（已声明口径）',
    conflictText: controversial ? `争议·三路冲突：${conflictWithJi ? `主用神 ${primaryWx} 与扶抑忌层相撞` : usedFallback ? '三路无 2 票以上共识，扶抑兜底' : '多路首选不一致且票面同分'}，主用神仍只定一个（${primaryWx}），请结合大运流年人工复核` : (conflict.length ? `附注：${conflict.join('、')} 在扶抑为忌、在格局/调候为喜，已按优先级裁定（主用神 ${primaryWx}），未入选者降喜神层并在此注明` : null),
    finalText: `主用神：${primaryWx}（${primaryRel}）${controversial ? '·争议' : ''}；喜神（辅助）：${auxXi.join('、') || '—'}；忌神：${ji.join('、') || '—'}。主用神只定一个、本命定死不随运变，大运只论得力受损（见大运五层分析）${strength.gates.cong.suspect || strength.gates.zhuan.suspect ? '；特殊格疑似未自动反转喜忌' : ''}`,
    adjudication, votes: ranked, controversial,
  }
  return { tiaohou, geju, duogua, yongshen }
}
