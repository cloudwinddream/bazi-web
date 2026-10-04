// 八字排盘引擎：历法层封装 + 排盘层（只出事实，不下判断）
// 引擎：lunar-javascript 1.7.7（6tail，MIT）—— 节气/朔望/干支全部走库天文历，不自写查表
//
// 精度整改（2026-10-03）：
// - 均时差改 NOAA/Meeus 天文公式逐日逐时计算（太阳平黄经/真黄经/倾角），精度秒级，不再用简化正弦近似
// - 真太阳时偏移保留到秒，不再四舍五入到分钟；出生秒数全程保留
// - 大运起运 sect 入参：1=日时法（三天折一年），2=分钟精算法（库 Yun 原生两法）
// - 输入时区入参：先按输入时区换算为北京时间再排盘（库 Solar 口径为北京时间），海外出生可正确对齐节气
// - 藏干/十神/纳音/地势/胎元/命宫/身宫全部取库原生表
import { Solar, Lunar, LunarUtil } from 'lunar-javascript'
import { analyzeStrength, type StrengthResult, type Quad } from './strength.js'
import { calcShenSha, type ShenShaHit } from './shensha.js'
import { analyzeStages, type TiaoHouResult, type GeJuResult, type DuoGuaRow, type YongShenResult } from './stages.js'
import { analyzeDaYun, type DaYunAnalysis } from './dayun.js'

export interface BirthInput {
  calendar: 'solar' | 'lunar'
  year: number
  month: number // 农历闰月时传负数（如 -2 表示闰二月），与 lunar-javascript 约定一致
  day: number
  hour: number
  minute: number
  second?: number
  gender: 'male' | 'female'
  longitude: number // 出生地经度，东经为正
  timeZoneOffset?: number // 输入时刻所在时区 UTC 偏移（小时），默认 8（北京时间）
  useTrueSolarTime: boolean
  ziSect: 1 | 2 // 子时流派：1=晚子时换日(23:00)，2=早晚子时均属当日（库 sect 定义）
  daYunSect?: 1 | 2 // 大运起运：1=日时法（三天折一年），2=分钟精算法
  placeName?: string // 出生地名称（仅展示用）
}

export interface Pillar {
  label: string
  ganZhi: string
  gan: string
  zhi: string
  ganWx: string
  zhiWx: string
  hideGan: string[]
  shiShenGan: string
  shiShenZhi: string[]
  naYin: string
  diShi: string
  ziZuo: string
  xun: string
  xunKong: string
}

export interface LiuNianItem { year: number; age: number; ganZhi: string; gan: string; zhi: string; shiShenGan: string; shiShenZhiMain: string; hideGan: string[]; shiShenZhi: string[] }
export interface DaYunItem {
  index: number
  startYear: number
  endYear: number
  startAge: number
  endAge: number
  startDate: string
  endDate: string
  startAgeText: string
  ganZhi: string
  gan: string
  zhi: string
  shiShenGan: string
  shiShenZhiMain: string
  hideGan: string[]
  shiShenZhi: string[]
  liuNian: LiuNianItem[]
}

export interface BaziResult {
  pillars: Pillar[]
  dayGan: string
  lunarText: string
  solarText: string
  beijingText: string
  correctedText: string
  trueSolarOffsetSeconds: number | null
  equationOfTimeSeconds: number | null
  wuXing: { name: string; score: number }[]
  dayMasterStrength: string
  qiYunText: string
  qiYunStartSolar: string
  daYun: DaYunItem[]
  prevJieQi: string
  nextJieQi: string
  taiYuan: string
  taiYuanGanZhi: string
  mingGong: string
  mingGongGanZhi: string
  shenGong: string
  shenGongGanZhi: string
  genderLabel: string
  placeName: string
  prevJieQiName: string
  nextJieQiName: string
  jieQiFromPrevText: string
  jieQiToNextText: string
  qiYunStartDate: string
  jiaoYunText: string
  jieQiTermText: string
  directMode?: boolean
  reverseSolarText?: string
  caliber: string[]
  strength: StrengthResult
  shensha: { perPillar: Record<string, ShenShaHit[]>; all: { pillar: string; hit: ShenShaHit }[] }
  tiaohou: TiaoHouResult
  geju: GeJuResult
  duogua: DuoGuaRow[]
  yongshen: YongShenResult
  daYunAnalysis: DaYunAnalysis[]
}

const GAN_WUXING: Record<string, string> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
}
const ORDER = ['木', '火', '土', '金', '水']
const ZHI_WUXING: Record<string, string> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
}
const GAN_LIST = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const ZHI_LIST = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
// 自坐：以柱干自身的十二长生落在柱支的位置，与库 _getDiShi 同一 CHANG_SHENG 表/偏移公式（库未单独暴露此接口，故按同表计算）
function ziZuoOf(gan: string, zhi: string): string {
  const offset = (LunarUtil as any).CHANG_SHENG_OFFSET[gan]
  const ganIndex = GAN_LIST.indexOf(gan)
  const zhiIndex = ZHI_LIST.indexOf(zhi)
  if (offset === undefined || ganIndex < 0 || zhiIndex < 0) return ''
  let index = offset + (ganIndex % 2 === 0 ? zhiIndex : -zhiIndex)
  index = ((index % 12) + 12) % 12
  return (LunarUtil as any).CHANG_SHENG[index]
}
function shiShenOf(dayGan: string, targetGan: string): string {
  return (LunarUtil as any).SHI_SHEN[dayGan + targetGan] || ''
}
function mainHideGan(zhi: string): string {
  const arr = (LunarUtil as any).ZHI_HIDE_GAN[zhi]
  return Array.isArray(arr) && arr.length ? arr[0] : ''
}
function solarYmd(solar: any): string {
  return `${solar.getYear()}-${pad(solar.getMonth())}-${pad(solar.getDay())}`
}
// 藏干权重：本气 1.0 / 中气 0.5 / 余气 0.3；天干本柱另计 1.0（分析层口径，非排盘事实）
const HIDE_WEIGHTS = [1.0, 0.5, 0.3]

export const CITIES = [
  { name: '北京', lng: 116.40 }, { name: '上海', lng: 121.47 },
  { name: '广州', lng: 113.26 }, { name: '深圳', lng: 114.05 },
  { name: '成都', lng: 104.06 }, { name: '重庆', lng: 106.50 },
  { name: '西安', lng: 108.94 }, { name: '武汉', lng: 114.30 },
  { name: '南京', lng: 118.78 }, { name: '杭州', lng: 120.15 },
  { name: '乌鲁木齐', lng: 87.60 }, { name: '拉萨', lng: 91.10 },
  { name: '哈尔滨', lng: 126.53 }, { name: '昆明', lng: 102.71 },
  { name: '纽约', lng: -73.99 }, { name: '伦敦', lng: -0.12 },
  { name: '东京', lng: 139.69 }, { name: '悉尼', lng: 151.21 },
]

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
function norm360(x: number) { const v = x % 360; return v < 0 ? v + 360 : v }

/**
 * 均时差（Equation of Time），单位秒。NOAA 太阳计算器 / Meeus《Astronomical Algorithms》算法：
 * 由儒略世纪数算平黄经、平近点角、偏心率、黄道倾角，再得时差角，精度秒级（1901–2099 内误差数秒）。
 * 返回值 = 真太阳时 − 平太阳时。
 */
export function equationOfTimeSeconds(y: number, m: number, d: number, h: number, mi: number, s: number): number {
  // 儒略日（输入为 UTC 时刻的字段）
  let yy = y, mm = m
  if (mm <= 2) { yy -= 1; mm += 12 }
  const A = Math.floor(yy / 100)
  const B = 2 - A + Math.floor(A / 4)
  const dayFrac = (h + mi / 60 + s / 3600) / 24
  const JD = Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5 + dayFrac
  const T = (JD - 2451545.0) / 36525 // 儒略世纪数（J2000 起）
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032)) // 平黄经
  const M = 357.52911 + T * (35999.05029 - T * 0.0001537) // 平近点角
  const e = 0.016708634 - T * (0.000042037 + T * 0.0000001267) // 地球轨道偏心率
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 // 平黄道倾角
  const omega = 125.04 - 1934.136 * T
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R) // 真黄道倾角
  const y2 = Math.tan((eps / 2) * D2R) ** 2
  const L0r = L0 * D2R, Mr = M * D2R
  const eqMin = 4 * R2D * (
    y2 * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * y2 * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y2 * y2 * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mr)
  )
  return eqMin * 60
}

function pad(n: number) { return String(n).padStart(2, '0') }
function fmt(y: number, m: number, d: number, h: number, mi: number, s = 0) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`
}
function solarFmt(solar: any) {
  return fmt(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute(), solar.getSecond())
}

export function calcBazi(input: BirthInput): BaziResult {
  const second = input.second ?? 0
  const tz = input.timeZoneOffset ?? 8
  const daYunSect = input.daYunSect ?? 1

  // 1. 输入墙钟（在其时区）→ 先得到该墙钟下的公历（农历先转公历）
  let localSolar: any
  if (input.calendar === 'solar') {
    localSolar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, second)
  } else {
    const lunarIn = Lunar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, second)
    localSolar = lunarIn.getSolar()
  }
  const solarText = solarFmt(localSolar)

  // 2. 时区换算：绝对时刻 → 北京时间墙钟（库的节气时刻以北京时间为口径）
  const localMs = Date.UTC(localSolar.getYear(), localSolar.getMonth() - 1, localSolar.getDay(), localSolar.getHour(), localSolar.getMinute(), localSolar.getSecond())
  const utcMs = localMs - tz * 3600000
  const beijingMs = utcMs + 8 * 3600000
  const bj = new Date(beijingMs)
  let workSolar = Solar.fromYmdHms(bj.getUTCFullYear(), bj.getUTCMonth() + 1, bj.getUTCDate(), bj.getUTCHours(), bj.getUTCMinutes(), bj.getUTCSeconds())
  const beijingText = solarFmt(workSolar)

  // 3. 真太阳时修正：经度时差（出生地经度 vs 东经 120°）+ 逐日均时差（秒级），不取整
  let offsetSeconds: number | null = null
  let eotSeconds: number | null = null
  if (input.useTrueSolarTime) {
    const u = new Date(utcMs)
    eotSeconds = equationOfTimeSeconds(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds())
    offsetSeconds = (input.longitude - 120) * 240 + eotSeconds // 1° = 240 秒
    const corr = new Date(beijingMs + Math.round(offsetSeconds) * 1000)
    workSolar = Solar.fromYmdHms(corr.getUTCFullYear(), corr.getUTCMonth() + 1, corr.getUTCDate(), corr.getUTCHours(), corr.getUTCMinutes(), corr.getUTCSeconds())
  }
  const correctedText = solarFmt(workSolar)

  // 4. 排盘（全部取库原生：干支/藏干/十神/纳音/地势/旬空/胎元/命宫/身宫）
  const lunar = workSolar.getLunar()
  const ec = lunar.getEightChar()
  ec.setSect(input.ziSect)

  const mk = (label: string, gz: string, hide: string[], ssg: string, ssz: string[], nayin: string, dishi: string, xun: string, xunkong: string): Pillar => {
    const gan = gz.charAt(0); const zhi = gz.charAt(1)
    return {
      label, ganZhi: gz, gan, zhi,
      ganWx: GAN_WUXING[gan], zhiWx: ZHI_WUXING[zhi],
      hideGan: hide, shiShenGan: ssg, shiShenZhi: ssz, naYin: nayin, diShi: dishi,
      ziZuo: ziZuoOf(gan, zhi), xun, xunKong: xunkong,
    }
  }
  const pillars: Pillar[] = [
    mk('年柱', ec.getYear(), ec.getYearHideGan(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi(), ec.getYearXun(), ec.getYearXunKong()),
    mk('月柱', ec.getMonth(), ec.getMonthHideGan(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi(), ec.getMonthXun(), ec.getMonthXunKong()),
    mk('日柱', ec.getDay(), ec.getDayHideGan(), ec.getDayShiShenGan(), ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi(), ec.getDayXun(), ec.getDayXunKong()),
    mk('时柱', ec.getTime(), ec.getTimeHideGan(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi(), ec.getTimeXun(), ec.getTimeXunKong()),
  ]

  // 5. 五行加权（分析层口径：天干 1.0 + 藏干本/中/余气，非排盘事实本身）
  const scores: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
  for (const p of pillars) {
    scores[GAN_WUXING[p.gan]] += 1.0
    p.hideGan.forEach((g, i) => { scores[GAN_WUXING[g]] += HIDE_WEIGHTS[i] ?? 0.2 })
  }
  const wuXing = ORDER.map((n) => ({ name: n, score: Math.round(scores[n] * 10) / 10 }))

  const dayGan = ec.getDayGan()
  const dayWx = GAN_WUXING[dayGan]
  const shengWo: Record<string, string> = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' }
  const total = wuXing.reduce((a, b) => a + b.score, 0)
  const ally = scores[dayWx] + scores[shengWo[dayWx]]
  const ratio = total ? ally / total : 0
  const dayMasterStrength = ratio >= 0.55 ? '身偏强' : ratio >= 0.42 ? '中和偏强' : ratio >= 0.32 ? '中和偏弱' : '身偏弱'

  // 6. 大运（sect 入参：1 日时法 / 2 分钟精算法）
  const yun = ec.getYun(input.gender === 'male' ? 1 : 0, daYunSect)
  const qiYunStartObj: any = yun.getStartSolar()
  const daYunRaw: any[] = yun.getDaYun()
  const dayGanForYun = dayGan
  const stepStartObj = (i: number): any => {
    if (i <= 0) return workSolar
    if (i === 1) return qiYunStartObj
    return qiYunStartObj.nextYear((i - 1) * 10)
  }
  const daYun: DaYunItem[] = daYunRaw.map((d: any, i: number) => {
    const gz = i === 0 ? '' : d.getGanZhi()
    const gan = gz ? gz.charAt(0) : ''
    const zhi = gz ? gz.charAt(1) : ''
    const sObj = stepStartObj(i)
    // 末步无下一步对象时以本步+10年-1日为结束
    let endObj: any
    try { endObj = (i >= daYunRaw.length - 1 ? sObj.nextYear(10) : stepStartObj(i + 1)).next(-1) } catch { endObj = sObj }
    const elapsedY = yun.getStartYear() + (i > 0 ? (i - 1) * 10 : 0)
    return {
      index: i,
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      startAge: d.getStartAge(),
      endAge: d.getEndAge(),
      startDate: solarYmd(sObj),
      endDate: solarYmd(endObj),
      startAgeText: i === 0 ? '出生' : `${elapsedY}岁${yun.getStartMonth()}个月${yun.getStartDay()}天${daYunSect === 2 && yun.getStartHour() ? `${yun.getStartHour()}小时` : ''}`,
      ganZhi: i === 0 ? '起运前' : gz,
      gan, zhi,
      shiShenGan: gan ? shiShenOf(dayGanForYun, gan) : '',
      shiShenZhiMain: zhi ? shiShenOf(dayGanForYun, mainHideGan(zhi)) : '',
      hideGan: zhi ? (((LunarUtil as any).ZHI_HIDE_GAN[zhi] as string[]) || []) : [],
      shiShenZhi: zhi ? ((((LunarUtil as any).ZHI_HIDE_GAN[zhi] as string[]) || []).map((g: string) => shiShenOf(dayGanForYun, g))) : [],
      liuNian: d.getLiuNian().map((ln: any) => {
        const lgz = ln.getGanZhi(); const lg = lgz.charAt(0); const lz = lgz.charAt(1)
        const lh: string[] = ((LunarUtil as any).ZHI_HIDE_GAN[lz] as string[]) || []
        return { year: ln.getYear(), age: ln.getAge(), ganZhi: lgz, gan: lg, zhi: lz, shiShenGan: shiShenOf(dayGanForYun, lg), shiShenZhiMain: shiShenOf(dayGanForYun, mainHideGan(lz)), hideGan: lh, shiShenZhi: lh.map((g: string) => shiShenOf(dayGanForYun, g)) }
      }),
    }
  })
  const qiYunText = `出生后 ${yun.getStartYear()} 年 ${yun.getStartMonth()} 个月 ${yun.getStartDay()} 天${daYunSect === 2 ? ` ${yun.getStartHour()} 小时` : ''}起大运（${yun.isForward() ? '顺行' : '逆行'}），交运时间 ${solarFmt(qiYunStartObj)}`
  const qiYunStartSolar = solarFmt(qiYunStartObj)
  const jiaoYunText = (() => {
    try {
      const sLunar = qiYunStartObj.getLunar()
      const yGan = sLunar.getYearGanExact ? sLunar.getYearGanExact() : ''
      return `出生后${yun.getStartYear()}年${yun.getStartMonth()}个月${yun.getStartDay()}天起大运，每逢${yGan}年${qiYunStartObj.getMonth()}月${qiYunStartObj.getDay()}日前后交运（逐到日见大运表）`
    } catch { return qiYunText }
  })()

  // 节气精确时刻（库原生，到秒）
  let prevJieQi = '', nextJieQi = '', prevJieQiName = '', nextJieQiName = '', jieQiFromPrevText = '', jieQiToNextText = '', jieQiTermText = ''
  try {
    const prev = lunar.getPrevJie(); const next = lunar.getNextJie()
    prevJieQiName = prev.getName(); nextJieQiName = next.getName()
    prevJieQi = `${prev.getName()} ${solarFmt(prev.getSolar())}`
    nextJieQi = `${next.getName()} ${solarFmt(next.getSolar())}`
    const toMs = (s: any) => Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond())
    const birthMs = toMs(workSolar)
    const fmtDiff = (ms: number) => {
      const totalH = Math.floor(Math.abs(ms) / 3600000)
      return `${Math.floor(totalH / 24)}天${totalH % 24}小时`
    }
    jieQiFromPrevText = fmtDiff(birthMs - toMs(prev.getSolar()))
    jieQiToNextText = fmtDiff(toMs(next.getSolar()) - birthMs)
    try {
      const pT = (lunar as any).getPrevJieQi(); const nT = (lunar as any).getNextJieQi()
      jieQiTermText = `${pT.getName()}后${fmtDiff(birthMs - toMs(pT.getSolar()))}，${nT.getName()}前${fmtDiff(toMs(nT.getSolar()) - birthMs)}`
    } catch { jieQiTermText = '' }
  } catch { /* 老年份节气表异常时留空 */ }

  const offsetMinText = offsetSeconds !== null ? `${offsetSeconds >= 0 ? '+' : ''}${(offsetSeconds / 60).toFixed(2)} 分钟（${Math.round(offsetSeconds)} 秒）` : ''
  // 强弱引擎（tianzhi 连乘移植）：司令按 prev 节后天数算，仅展示未加权（与真实盘测试口径一致）
  let daysAfterPrevJie: number | null = null
  try {
    const prev = lunar.getPrevJie()
    const toMs2 = (s: any) => Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond())
    daysAfterPrevJie = (toMs2(workSolar) - toMs2(prev.getSolar())) / 86400000
  } catch { daysAfterPrevJie = null }
  const quad: Quad = { year: [pillars[0].gan, pillars[0].zhi], month: [pillars[1].gan, pillars[1].zhi], day: [pillars[2].gan, pillars[2].zhi], hour: [pillars[3].gan, pillars[3].zhi] }
  const strength = analyzeStrength(quad, { daysAfterJie: daysAfterPrevJie, jieqiFromPrev: jieQiFromPrevText || null })
  const caliber = [
    `历法引擎 lunar-javascript 1.7.7（节气/朔望天文历）`,
    `输入时区 UTC${tz >= 0 ? '+' : ''}${tz}，已换算北京时间 ${beijingText}`,
    `子时流派 sect=${input.ziSect}（${input.ziSect === 1 ? '晚子时换日 23:00' : '子时不换日'}）`,
    input.useTrueSolarTime
      ? `真太阳时 开：经度 ${input.longitude}° 相对 120°E ${(input.longitude - 120) * 4 >= 0 ? '+' : ''}${((input.longitude - 120) * 4).toFixed(2)} 分钟 + 均时差 ${eotSeconds !== null ? (eotSeconds / 60).toFixed(3) : ''} 分钟（逐日天文公式）= ${offsetMinText}`
      : '真太阳时 关（以北京时间/输入时区标准时排盘）',
    `大运起运 sect=${daYunSect}（${daYunSect === 1 ? '日时法·三天折一年' : '分钟精算法'}），起运点 ${qiYunStartSolar}`,
    `节气：${prevJieQi} → ${nextJieQi}`,
  ]
  const stagesResult = analyzeStages(quad, strength)

  return {
    pillars, dayGan,
    lunarText: lunar.toString(),
    solarText, beijingText, correctedText,
    trueSolarOffsetSeconds: offsetSeconds,
    equationOfTimeSeconds: eotSeconds,
    wuXing, dayMasterStrength, qiYunText, qiYunStartSolar, daYun,
    prevJieQi, nextJieQi,
    taiYuan: `${ec.getTaiYuan()}（${ec.getTaiYuanNaYin()}）`,
    taiYuanGanZhi: ec.getTaiYuan(),
    mingGong: `${ec.getMingGong()}（${ec.getMingGongNaYin()}）`,
    mingGongGanZhi: ec.getMingGong(),
    shenGong: `${ec.getShenGong()}（${ec.getShenGongNaYin()}）`,
    shenGongGanZhi: ec.getShenGong(),
    genderLabel: input.gender === 'male' ? '乾造' : '坤造',
    placeName: input.placeName || '',
    prevJieQiName, nextJieQiName, jieQiFromPrevText, jieQiToNextText,
    qiYunStartDate: solarYmd(qiYunStartObj),
    jiaoYunText, jieQiTermText,
    caliber,
    strength,
    shensha: calcShenSha(quad),
    ...stagesResult,
    daYunAnalysis: analyzeDaYun(quad, stagesResult.yongshen, stagesResult.tiaohou, daYun),
  }
}

// ---- 直接输入八字（比对用）：校验 + 反查示例日期取库字段 ----
export function validatePillars(pillars: string[]): string | null {
  if (pillars.length !== 4) return '需要完整的年、月、日、时四柱'
  for (const gz of pillars) {
    if (!gz || gz.length !== 2) return `干支「${gz || ''}」不完整，每柱需天干+地支各一字`
    const g = gz.charAt(0), z = gz.charAt(1)
    if (!GAN_LIST.includes(g)) return `天干「${g}」不合法（应为甲乙丙丁戊己庚辛壬癸）`
    if (!ZHI_LIST.includes(z)) return `地支「${z}」不合法（应为子丑寅卯辰巳午未申酉戌亥）`
    if (GAN_LIST.indexOf(g) % 2 !== ZHI_LIST.indexOf(z) % 2) return `干支组合「${gz}」不存在：阴阳不合，六十甲子中无此柱`
  }
  return null
}

export function pillarWarnings(pillars: string[]): string[] {
  const warns: string[] = []
  if (validatePillars(pillars)) return warns
  const yearGan = pillars[0].charAt(0)
  const monthZhiIdx = ZHI_LIST.indexOf(pillars[1].charAt(1))
  const monthOffset = (monthZhiIdx - ZHI_LIST.indexOf('寅') + 12) % 12
  const firstMonthGanIdx: Record<string, number> = { 甲: 2, 己: 2, 乙: 4, 庚: 4, 丙: 6, 辛: 6, 丁: 8, 壬: 8, 戊: 0, 癸: 0 }
  const expectedMonthGan = GAN_LIST[(firstMonthGanIdx[yearGan] + monthOffset) % 10]
  if (pillars[1].charAt(0) !== expectedMonthGan) warns.push(`月柱与五虎遁不合（${yearGan}年${pillars[1].charAt(1)}月按遁法应为${expectedMonthGan}${pillars[1].charAt(1)}），已按输入原柱出盘供比对`)
  const dayGan = pillars[2].charAt(0)
  const timeZhiIdx = ZHI_LIST.indexOf(pillars[3].charAt(1))
  const ziGanIdx: Record<string, number> = { 甲: 0, 己: 0, 乙: 2, 庚: 2, 丙: 4, 辛: 4, 丁: 6, 壬: 6, 戊: 8, 癸: 8 }
  const expectedTimeGan = GAN_LIST[(ziGanIdx[dayGan] + timeZhiIdx) % 10]
  if (pillars[3].charAt(0) !== expectedTimeGan) warns.push(`时柱与五鼠遁不合（${dayGan}日${pillars[3].charAt(1)}时按遁法应为${expectedTimeGan}${pillars[3].charAt(1)}），已按输入原柱出盘供比对`)
  return warns
}

export function calcFromPillars(pillarsInput: string[], gender: 'male' | 'female', ziSect: 1 | 2 = 1): BaziResult {
  const err = validatePillars(pillarsInput)
  if (err) throw new Error(err)
  const [ygz, mgz, dgz, tgz] = pillarsInput
  // 四柱反查示例公历（1800 年起），仅为调用库 EightChar 字段，不代表命主生辰
  let found: any = null
  for (const sect of [ziSect, ziSect === 1 ? 2 : 1] as const) {
    const list = (Solar as any).fromBaZi(ygz, mgz, dgz, tgz, sect, 1800)
    if (Array.isArray(list)) {
      for (const s of list) {
        const ec0 = s.getLunar().getEightChar(); ec0.setSect(ziSect)
        if (ec0.getYear() === ygz && ec0.getMonth() === mgz && ec0.getDay() === dgz && ec0.getTime() === tgz) { found = s; break }
      }
    }
    if (found) break
  }
  const warns = pillarWarnings(pillarsInput)
  if (!found) {
    // 反查无真实日期（多为五虎/五鼠不合的历史命例）：按库表由四柱直推本命字段，不编造
    const dayGan0 = dgz.charAt(0)
    const mkF = (label: string, gz: string): Pillar => {
      const gan = gz.charAt(0); const zhi = gz.charAt(1)
      const hide: string[] = ((LunarUtil as any).ZHI_HIDE_GAN[zhi] as string[]) || []
      const offset = (LunarUtil as any).CHANG_SHENG_OFFSET[dayGan0]
      const dIdx = GAN_LIST.indexOf(dayGan0); const zIdx = ZHI_LIST.indexOf(zhi)
      let ci = ((offset + (dIdx % 2 === 0 ? zIdx : -zIdx)) % 12 + 12) % 12
      return { label, ganZhi: gz, gan, zhi, ganWx: GAN_WUXING[gan], zhiWx: ZHI_WUXING[zhi], hideGan: hide, shiShenGan: label === '日柱' ? '日主' : shiShenOf(dayGan0, gan), shiShenZhi: hide.map((g) => shiShenOf(dayGan0, g)), naYin: (LunarUtil as any).NAYIN[gz] || '', diShi: (LunarUtil as any).CHANG_SHENG[ci], ziZuo: ziZuoOf(gan, zhi), xun: (LunarUtil as any).getXun ? (LunarUtil as any).getXun(gz) : '', xunKong: (LunarUtil as any).getXunKong ? (LunarUtil as any).getXunKong(gz) : '' }
    }
    const pillarsF: Pillar[] = [mkF('年柱', ygz), mkF('月柱', mgz), mkF('日柱', dgz), mkF('时柱', tgz)]
    const scoresF: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
    for (const pp of pillarsF) { scoresF[GAN_WUXING[pp.gan]] += 1.0; pp.hideGan.forEach((g, i) => { scoresF[GAN_WUXING[g]] += HIDE_WEIGHTS[i] ?? 0.2 }) }
    const wuXingF = ORDER.map((n) => ({ name: n, score: Math.round(scoresF[n] * 10) / 10 }))
    const dayWxF = GAN_WUXING[dayGan0]; const shengWoF: Record<string, string> = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' }
    const totalF = wuXingF.reduce((a, b) => a + b.score, 0); const ratioF = totalF ? (scoresF[dayWxF] + scoresF[shengWoF[dayWxF]]) / totalF : 0
    const taiGan = GAN_LIST[(GAN_LIST.indexOf(mgz.charAt(0)) + 1) % 10]; const taiZhi = ZHI_LIST[(ZHI_LIST.indexOf(mgz.charAt(1)) + 3) % 12]; const taiYuanF = taiGan + taiZhi
    // 命宫/身宫按库公式（MONTH_ZHI 序）推算
    const MONTH_ZHI = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑']
    const mzIdx = MONTH_ZHI.indexOf(mgz.charAt(1)) + 1; const tzIdxM = MONTH_ZHI.indexOf(tgz.charAt(1)) + 1
    let offM = mzIdx + tzIdxM; offM = (offM >= 14 ? 26 : 14) - offM
    let gIdxM = (GAN_LIST.indexOf(ygz.charAt(0)) + 1 + 1) * 2 + offM; while (gIdxM > 10) gIdxM -= 10
    const mingGongF = GAN_LIST[gIdxM - 1] + MONTH_ZHI[offM - 1]
    const tzIdxZ = ZHI_LIST.indexOf(tgz.charAt(1)) + 1
    let offS = mzIdx + tzIdxZ; if (offS > 12) offS -= 12
    let gIdxS = (GAN_LIST.indexOf(ygz.charAt(0)) + 1 + 1) * 2 + offS; while (gIdxS > 10) gIdxS -= 10
    const shenGongF = GAN_LIST[gIdxS - 1] + MONTH_ZHI[offS - 1]
    return {
      pillars: pillarsF, dayGan: dayGan0, lunarText: '', solarText: '', beijingText: '', correctedText: '',
      trueSolarOffsetSeconds: null, equationOfTimeSeconds: null, wuXing: wuXingF,
      dayMasterStrength: ratioF >= 0.55 ? '身偏强' : ratioF >= 0.42 ? '中和偏强' : ratioF >= 0.32 ? '中和偏弱' : '身偏弱',
      qiYunText: '直接输入模式：未排大运（需出生日期与性别补排）', qiYunStartSolar: '', daYun: [],
      prevJieQi: '', nextJieQi: '',
      taiYuan: `${taiYuanF}（${(LunarUtil as any).NAYIN[taiYuanF] || ''}）`, taiYuanGanZhi: taiYuanF,
      mingGong: `${mingGongF}（${(LunarUtil as any).NAYIN[mingGongF] || ''}）`, mingGongGanZhi: mingGongF,
      shenGong: `${shenGongF}（${(LunarUtil as any).NAYIN[shenGongF] || ''}）`, shenGongGanZhi: shenGongF,
      genderLabel: gender === 'male' ? '乾造' : '坤造', placeName: '', prevJieQiName: '', nextJieQiName: '', jieQiFromPrevText: '', jieQiToNextText: '',
      qiYunStartDate: '', jiaoYunText: '直接输入模式默认只看本命盘；如需大运，请改用生辰排盘并补出生日期/性别。', jieQiTermText: '',
      directMode: true, reverseSolarText: '',
      caliber: ['直接输入四柱（备用计算八字·比对用），与生辰模式同库表口径（lunar-javascript 1.7.7）', '此四柱反查无对应真实公历（见警告），本命字段按库表由四柱直接推算', ...warns, '大运未排：直接输入无生辰信息，性别仅影响大运顺逆说明，本命盘不变'],
      strength: analyzeStrength({ year: [ygz.charAt(0), ygz.charAt(1)], month: [mgz.charAt(0), mgz.charAt(1)], day: [dgz.charAt(0), dgz.charAt(1)], hour: [tgz.charAt(0), tgz.charAt(1)] }),
      shensha: calcShenSha({ year: [ygz.charAt(0), ygz.charAt(1)], month: [mgz.charAt(0), mgz.charAt(1)], day: [dgz.charAt(0), dgz.charAt(1)], hour: [tgz.charAt(0), tgz.charAt(1)] }),
      ...analyzeStages({ year: [ygz.charAt(0), ygz.charAt(1)], month: [mgz.charAt(0), mgz.charAt(1)], day: [dgz.charAt(0), dgz.charAt(1)], hour: [tgz.charAt(0), tgz.charAt(1)] }, analyzeStrength({ year: [ygz.charAt(0), ygz.charAt(1)], month: [mgz.charAt(0), mgz.charAt(1)], day: [dgz.charAt(0), dgz.charAt(1)], hour: [tgz.charAt(0), tgz.charAt(1)] })),
      daYunAnalysis: [],
    }
  }
  const lunar = found.getLunar()
  const ec = lunar.getEightChar(); ec.setSect(ziSect)
  const mk = (label: string, gz: string, hide: string[], ssg: string, ssz: string[], nayin: string, dishi: string, xun: string, xunkong: string): Pillar => {
    const gan = gz.charAt(0); const zhi = gz.charAt(1)
    return { label, ganZhi: gz, gan, zhi, ganWx: GAN_WUXING[gan], zhiWx: ZHI_WUXING[zhi], hideGan: hide, shiShenGan: ssg, shiShenZhi: ssz, naYin: nayin, diShi: dishi, ziZuo: ziZuoOf(gan, zhi), xun, xunKong: xunkong }
  }
  const pillars: Pillar[] = [
    mk('年柱', ec.getYear(), ec.getYearHideGan(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi(), ec.getYearXun(), ec.getYearXunKong()),
    mk('月柱', ec.getMonth(), ec.getMonthHideGan(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi(), ec.getMonthXun(), ec.getMonthXunKong()),
    mk('日柱', ec.getDay(), ec.getDayHideGan(), ec.getDayShiShenGan(), ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi(), ec.getDayXun(), ec.getDayXunKong()),
    mk('时柱', ec.getTime(), ec.getTimeHideGan(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi(), ec.getTimeXun(), ec.getTimeXunKong()),
  ]
  const scores: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
  for (const p of pillars) { scores[GAN_WUXING[p.gan]] += 1.0; p.hideGan.forEach((g, i) => { scores[GAN_WUXING[g]] += HIDE_WEIGHTS[i] ?? 0.2 }) }
  const wuXing = ORDER.map((n) => ({ name: n, score: Math.round(scores[n] * 10) / 10 }))
  const dayGan = ec.getDayGan(); const dayWx = GAN_WUXING[dayGan]
  const shengWo: Record<string, string> = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' }
  const total = wuXing.reduce((a, b) => a + b.score, 0); const ally = scores[dayWx] + scores[shengWo[dayWx]]; const ratio = total ? ally / total : 0
  const dayMasterStrength = ratio >= 0.55 ? '身偏强' : ratio >= 0.42 ? '中和偏强' : ratio >= 0.32 ? '中和偏弱' : '身偏弱'
  return {
    pillars, dayGan,
    lunarText: '', solarText: '', beijingText: '', correctedText: '',
    trueSolarOffsetSeconds: null, equationOfTimeSeconds: null,
    wuXing, dayMasterStrength,
    qiYunText: '直接输入模式：未排大运（需出生日期与性别补排）', qiYunStartSolar: '', daYun: [],
    prevJieQi: '', nextJieQi: '',
    taiYuan: `${ec.getTaiYuan()}（${ec.getTaiYuanNaYin()}）`, taiYuanGanZhi: ec.getTaiYuan(),
    mingGong: `${ec.getMingGong()}（${ec.getMingGongNaYin()}）`, mingGongGanZhi: ec.getMingGong(),
    shenGong: `${ec.getShenGong()}（${ec.getShenGongNaYin()}）`, shenGongGanZhi: ec.getShenGong(),
    genderLabel: gender === 'male' ? '乾造' : '坤造',
    placeName: '', prevJieQiName: '', nextJieQiName: '', jieQiFromPrevText: '', jieQiToNextText: '',
    qiYunStartDate: '', jiaoYunText: '直接输入模式默认只看本命盘；如需大运，请改用生辰排盘并补出生日期/性别。', jieQiTermText: '',
    directMode: true, reverseSolarText: solarFmt(found),
    caliber: [
      '直接输入四柱（备用计算八字·比对用），与生辰模式同引擎同口径（lunar-javascript 1.7.7）',
      `反查示例公历 ${solarFmt(found)} 仅用于取库本命字段，不代表命主生辰`,
      `子时流派 sect=${ziSect}`,
      '大运未排：直接输入无生辰信息，性别仅影响大运顺逆说明，本命盘不变',
    ],
    strength: analyzeStrength({ year: [pillars[0].gan, pillars[0].zhi], month: [pillars[1].gan, pillars[1].zhi], day: [pillars[2].gan, pillars[2].zhi], hour: [pillars[3].gan, pillars[3].zhi] }),
    shensha: calcShenSha({ year: [pillars[0].gan, pillars[0].zhi], month: [pillars[1].gan, pillars[1].zhi], day: [pillars[2].gan, pillars[2].zhi], hour: [pillars[3].gan, pillars[3].zhi] }),
    ...analyzeStages({ year: [pillars[0].gan, pillars[0].zhi], month: [pillars[1].gan, pillars[1].zhi], day: [pillars[2].gan, pillars[2].zhi], hour: [pillars[3].gan, pillars[3].zhi] }, analyzeStrength({ year: [pillars[0].gan, pillars[0].zhi], month: [pillars[1].gan, pillars[1].zhi], day: [pillars[2].gan, pillars[2].zhi], hour: [pillars[3].gan, pillars[3].zhi] })),
    daYunAnalysis: [],
  }
}
