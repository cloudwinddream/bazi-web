// 神煞自建查表（lunar-javascript 1.7.7 EightChar 无神煞接口，本表据通行口诀自建，逐项注明起法）
// 来源口径：天乙「甲戊庚牛羊…」、文昌、禄、羊刃、三合桃花/驿马/华盖/将星/劫煞/亡神/灾煞、
//   天德月德、红鸾天喜、孤辰寡宿、金舆、学堂词馆等均为《三命通会》通行查表（公开口诀核对 2026-10-04）
// 神煞只展示+释义，默认不计入强弱分（本站口径声明）
export interface ShenShaHit { name: string; meaning: string; now: string; method: string; basis: string }
export type Quad2 = { year: [string, string]; month: [string, string]; day: [string, string]; hour: [string, string] }
const POS = ['year', 'month', 'day', 'hour'] as const

const MEANINGS: Record<string, [string, string]> = {
  天乙贵人: ['遇难有助、逢凶化吉之星', '今义提示：关键时刻易得人援手，仅作传统说法参考'],
  文昌贵人: ['主聪明文才、利学业考试', '今义提示：传统上与学习表达相关'],
  禄神: ['临官禄位，主自立与俸禄根基', '今义提示：传统上象征事业根基与收入来源'],
  羊刃: ['帝旺刃地，性刚力猛', '今义提示：传统上主决断力强，过旺则宜收敛，不作凶断'],
  桃花: ['咸池桃花，主人缘与情感吸引', '今义提示：传统上与人缘魅力相关，不等于感情结论'],
  驿马: ['主走动、迁移、出行变动', '今义提示：传统上多动多变、异地发展之象'],
  华盖: ['主孤高、艺术宗教之趣', '今义提示：传统上偏内省、专长型气质'],
  将星: ['主统御、组织领导之位', '今义提示：传统上与担当、主导角色相关'],
  亡神: ['主机变、谋略，亦主耗失', '今义提示：传统说法主意多变，需结合全盘看'],
  劫煞: ['主突发竞争与损耗之象', '今义提示：传统上提醒防意外损耗，不作恐吓断语'],
  灾煞: ['将星受冲之煞，主突发波动', '今义提示：传统上主变动冲击，宜谨慎行事'],
  天德贵人: ['主福德、逢凶化吉', '今义提示：传统吉星，主仁厚得助'],
  月德贵人: ['主福德与人和', '今义提示：传统吉星，主得助与缓冲'],
  魁罡: ['日柱魁罡，主刚毅果决', '今义提示：传统上性格刚强，吉凶看配合'],
  金舆: ['金车之象，主富贵安泰', '今义提示：传统上与生活品质、配偶助力相关'],
  红鸾: ['主婚恋喜庆之动', '今义提示：传统上与感情、喜庆话题相关'],
  天喜: ['与红鸾相对，主喜庆', '今义提示：传统上主喜事、人缘'],
  孤辰: ['主孤独独立之象', '今义提示：传统上偏独立自主，不作婚姻断语'],
  寡宿: ['主清静寡合之象', '今义提示：传统上偏喜静、慢热'],
  学堂: ['主学业、进修之星', '今义提示：传统上利读书考证'],
  词馆: ['主文章词采之星', '今义提示：传统上利写作表达'],
  空亡: ['旬中空位，主虚浮不实之位', '今义提示：传统上该位力量打折看，不作凶断'],
}

const DAY_GAN_BRANCH: Record<string, Record<string, string[]>> = {
  // name -> dayGan -> target branches
  天乙贵人: { 甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'], 辛: ['寅', '午'] },
  文昌贵人: { 甲: ['巳'], 乙: ['午'], 丙: ['申'], 丁: ['酉'], 戊: ['申'], 己: ['酉'], 庚: ['亥'], 辛: ['子'], 壬: ['寅'], 癸: ['卯'] },
  禄神: { 甲: ['寅'], 乙: ['卯'], 丙: ['巳'], 丁: ['午'], 戊: ['巳'], 己: ['午'], 庚: ['申'], 辛: ['酉'], 壬: ['亥'], 癸: ['子'] },
  羊刃: { 甲: ['卯'], 丙: ['午'], 戊: ['午'], 庚: ['酉'], 壬: ['子'] }, // 阳干帝旺（通行主表）
  金舆: { 甲: ['辰'], 乙: ['巳'], 丙: ['未'], 丁: ['申'], 戊: ['未'], 己: ['申'], 庚: ['戌'], 辛: ['亥'], 壬: ['丑'], 癸: ['寅'] },
  学堂: { 甲: ['亥'], 乙: ['午'], 丙: ['寅'], 丁: ['酉'], 戊: ['寅'], 己: ['酉'], 庚: ['巳'], 辛: ['子'], 壬: ['申'], 癸: ['卯'] }, // 日干长生位
}
// 词馆：干支对（日干起，柱干支全对才算）
const CIGUAN: Record<string, string> = { 甲: '庚寅', 乙: '辛卯', 丙: '乙巳', 丁: '戊午', 戊: '丁巳', 己: '庚午', 庚: '壬申', 辛: '癸酉', 壬: '癸亥', 癸: '壬戌' }
// 三合局表：局成员 -> {桃花,驿马,华盖,将星,劫煞,亡神,灾煞}
const SANHE_GROUP: Record<string, string> = { 申: '申子辰', 子: '申子辰', 辰: '申子辰', 寅: '寅午戌', 午: '寅午戌', 戌: '寅午戌', 巳: '巳酉丑', 酉: '巳酉丑', 丑: '巳酉丑', 亥: '亥卯未', 卯: '亥卯未', 未: '亥卯未' }
const GROUP_SHA: Record<string, Record<string, string>> = {
  申子辰: { 桃花: '酉', 驿马: '寅', 华盖: '辰', 将星: '子', 劫煞: '巳', 亡神: '亥', 灾煞: '午' },
  寅午戌: { 桃花: '卯', 驿马: '申', 华盖: '戌', 将星: '午', 劫煞: '亥', 亡神: '巳', 灾煞: '子' },
  巳酉丑: { 桃花: '午', 驿马: '亥', 华盖: '丑', 将星: '酉', 劫煞: '寅', 亡神: '申', 灾煞: '卯' },
  亥卯未: { 桃花: '子', 驿马: '巳', 华盖: '未', 将星: '卯', 劫煞: '申', 亡神: '寅', 灾煞: '酉' },
}
// 天德（按月支）：值可为干或支
const TIANDE: Record<string, string> = { 寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲', 申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚' }
const YUEDE: Record<string, string> = { 寅: '丙', 午: '丙', 戌: '丙', 申: '壬', 子: '壬', 辰: '壬', 亥: '甲', 卯: '甲', 未: '甲', 巳: '庚', 酉: '庚', 丑: '庚' }
const HONGLUAN: Record<string, string> = { 子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌', 午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰' }
const TIANXI: Record<string, string> = { 子: '酉', 丑: '申', 寅: '未', 卯: '午', 辰: '巳', 巳: '辰', 午: '卯', 未: '寅', 申: '丑', 酉: '子', 戌: '亥', 亥: '戌' }
const GUCHEN: Record<string, string> = { 亥: '寅', 子: '寅', 丑: '寅', 寅: '巳', 卯: '巳', 辰: '巳', 巳: '申', 午: '申', 未: '申', 申: '亥', 酉: '亥', 戌: '亥' }
const GUASU: Record<string, string> = { 亥: '戌', 子: '戌', 丑: '戌', 寅: '丑', 卯: '丑', 辰: '丑', 巳: '辰', 午: '辰', 未: '辰', 申: '未', 酉: '未', 戌: '未' }
const KUIGANG = new Set(['庚辰', '庚戌', '壬辰', '戊戌'])

export function calcShenSha(quad: Quad2): { perPillar: Record<string, ShenShaHit[]>; all: { pillar: string; hit: ShenShaHit }[] } {
  const dayGan = quad.day[0]
  const yearZhi = quad.year[1], dayZhi = quad.day[1], monthZhi = quad.month[1]
  const perPillar: Record<string, ShenShaHit[]> = { year: [], month: [], day: [], hour: [] }
  const POS_CN: Record<string, string> = { year: '年', month: '月', day: '日', hour: '时' }
  const add = (pos: string, name: string, method: string, basis?: string) => {
    const m = MEANINGS[name]; if (!m) return
    const b = basis || method
    const existing = perPillar[pos].find((h) => h.name === name)
    if (existing) {
      // 同一神煞同柱由两条起法（如年支/日支三合）同时命中时合并依据，不重复列条
      if (!existing.basis.includes(b)) { existing.basis += `；另：${b}`; existing.method = existing.basis }
      return
    }
    perPillar[pos].push({ name, meaning: m[0], now: m[1], method: b, basis: b })
  }
  for (const pos of POS) {
    const [gan, zhi] = quad[pos]
    // 日干起（支见）
    for (const name of ['天乙贵人', '文昌贵人', '禄神', '羊刃', '金舆', '学堂']) {
      const targets = DAY_GAN_BRANCH[name]?.[dayGan] || []
      if (targets.includes(zhi)) add(pos, name, '', `以日干${dayGan}查「${name}」表得${targets.join('、')}，${POS_CN[pos]}支见${zhi}在表中，故${POS_CN[pos]}柱命中`)
    }
    if (CIGUAN[dayGan] === gan + zhi) add(pos, '词馆', '', `以日干${dayGan}查词馆干支对表得${CIGUAN[dayGan]}，${POS_CN[pos]}柱干支正是${gan}${zhi}全对，故${POS_CN[pos]}柱命中`)
    // 三合局起（按年支与日支各查，结果并集并注明）
    for (const [baseName, baseZhi] of [['年支', yearZhi], ['日支', dayZhi]] as const) {
      const grpName = SANHE_GROUP[baseZhi] || ''
      const grp = GROUP_SHA[grpName]
      if (!grp) continue
      for (const [shaName, target] of Object.entries(grp)) if (zhi === target) add(pos, shaName, '', `以${baseName}${baseZhi}定${grpName}局，查该局「${shaName}」位得${target}，${POS_CN[pos]}支见${target}，故${POS_CN[pos]}柱命中`)
    }
    // 天德/月德（按月支）
    const td = TIANDE[monthZhi]
    if (td && (gan === td || zhi === td)) add(pos, '天德贵人', '', `以月支${monthZhi}查天德表得${td}，${POS_CN[pos]}柱${gan === td ? `干${gan}` : `支${zhi}`}见${td}，故${POS_CN[pos]}柱命中`)
    if (gan === YUEDE[monthZhi]) add(pos, '月德贵人', '', `以月支${monthZhi}查月德表得${YUEDE[monthZhi]}，${POS_CN[pos]}柱干见${gan}，故${POS_CN[pos]}柱命中`)
    // 红鸾天喜（按年支）
    if (zhi === HONGLUAN[yearZhi]) add(pos, '红鸾', '', `以年支${yearZhi}查红鸾表得${HONGLUAN[yearZhi]}，${POS_CN[pos]}支见${zhi}，故${POS_CN[pos]}柱命中`)
    if (zhi === TIANXI[yearZhi]) add(pos, '天喜', '', `以年支${yearZhi}查天喜表得${TIANXI[yearZhi]}，${POS_CN[pos]}支见${zhi}，故${POS_CN[pos]}柱命中`)
    // 孤辰寡宿（按年支）
    if (zhi === GUCHEN[yearZhi]) add(pos, '孤辰', '', `以年支${yearZhi}查孤辰表得${GUCHEN[yearZhi]}，${POS_CN[pos]}支见${zhi}，故${POS_CN[pos]}柱命中`)
    if (zhi === GUASU[yearZhi]) add(pos, '寡宿', '', `以年支${yearZhi}查寡宿表得${GUASU[yearZhi]}，${POS_CN[pos]}支见${zhi}，故${POS_CN[pos]}柱命中`)
    // 魁罡（日柱）
    if (pos === 'day' && KUIGANG.has(gan + zhi)) add(pos, '魁罡', '', `日柱干支${gan}${zhi}在魁罡日表（庚辰、庚戌、壬辰、戊戌）内，故日柱命中`)
  }
  const all: { pillar: string; hit: ShenShaHit }[] = []
  for (const pos of POS) for (const hit of perPillar[pos]) all.push({ pillar: pos, hit })
  return { perPillar, all }
}
export const SHENSHA_NOTE = '神煞据《三命通会》通行口诀自建查表（天乙/文昌/禄/羊刃/金舆/学堂按日干起，三合桃花驿马等按年支·日支起，天德月德按月支起，红鸾孤辰按年支起，词馆魁罡按干支对），只展示释义，不计入强弱分。'
