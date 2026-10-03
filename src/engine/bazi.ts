// 八字排盘引擎：历法层封装 + 排盘层（只出事实，不下判断）
// 引擎：lunar-javascript 1.7.7（6tail，MIT）—— 节气/朔望/干支全部走库天文历，不自写查表
//
// 精度整改（2026-10-03）：
// - 均时差改 NOAA/Meeus 天文公式逐日逐时计算（太阳平黄经/真黄经/倾角），精度秒级，不再用简化正弦近似
// - 真太阳时偏移保留到秒，不再四舍五入到分钟；出生秒数全程保留
// - 大运起运 sect 入参：1=日时法（三天折一年），2=分钟精算法（库 Yun 原生两法）
// - 输入时区入参：先按输入时区换算为北京时间再排盘（库 Solar 口径为北京时间），海外出生可正确对齐节气
// - 藏干/十神/纳音/地势/胎元/命宫/身宫全部取库原生表
import { Solar, Lunar } from 'lunar-javascript'

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
}

export interface Pillar {
  label: string
  ganZhi: string
  gan: string
  zhi: string
  hideGan: string[]
  shiShenGan: string
  shiShenZhi: string[]
  naYin: string
  diShi: string
  xunKong: string
}

export interface LiuNianItem { year: number; age: number; ganZhi: string }
export interface DaYunItem {
  index: number
  startYear: number
  endYear: number
  startAge: number
  endAge: number
  ganZhi: string
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
  mingGong: string
  shenGong: string
  caliber: string[]
}

const GAN_WUXING: Record<string, string> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
}
const ORDER = ['木', '火', '土', '金', '水']
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

  const mk = (label: string, gz: string, hide: string[], ssg: string, ssz: string[], nayin: string, dishi: string, xunkong: string): Pillar => ({
    label, ganZhi: gz, gan: gz.charAt(0), zhi: gz.charAt(1),
    hideGan: hide, shiShenGan: ssg, shiShenZhi: ssz, naYin: nayin, diShi: dishi, xunKong: xunkong,
  })
  const pillars: Pillar[] = [
    mk('年柱', ec.getYear(), ec.getYearHideGan(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi(), ec.getYearXunKong()),
    mk('月柱', ec.getMonth(), ec.getMonthHideGan(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi(), ec.getMonthXunKong()),
    mk('日柱', ec.getDay(), ec.getDayHideGan(), ec.getDayShiShenGan(), ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi(), ec.getDayXunKong()),
    mk('时柱', ec.getTime(), ec.getTimeHideGan(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi(), ec.getTimeXunKong()),
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
  const daYun: DaYunItem[] = yun.getDaYun().map((d: any, i: number) => ({
    index: i,
    startYear: d.getStartYear(),
    endYear: d.getEndYear(),
    startAge: d.getStartAge(),
    endAge: d.getEndAge(),
    ganZhi: i === 0 ? '起运前' : d.getGanZhi(),
    liuNian: d.getLiuNian().map((ln: any) => ({ year: ln.getYear(), age: ln.getAge(), ganZhi: ln.getGanZhi() })),
  }))
  const qiYunText = `出生后 ${yun.getStartYear()} 年 ${yun.getStartMonth()} 个月 ${yun.getStartDay()} 天${daYunSect === 2 ? ` ${yun.getStartHour()} 小时` : ''}起运（${yun.isForward() ? '顺行' : '逆行'}）`
  const qiYunStartSolar = solarFmt(yun.getStartSolar())

  // 节气精确时刻（库原生，到秒）
  let prevJieQi = '', nextJieQi = ''
  try {
    const prev = lunar.getPrevJie(); const next = lunar.getNextJie()
    prevJieQi = `${prev.getName()} ${solarFmt(prev.getSolar())}`
    nextJieQi = `${next.getName()} ${solarFmt(next.getSolar())}`
  } catch { /* 老年份节气表异常时留空 */ }

  const offsetMinText = offsetSeconds !== null ? `${offsetSeconds >= 0 ? '+' : ''}${(offsetSeconds / 60).toFixed(2)} 分钟（${Math.round(offsetSeconds)} 秒）` : ''
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

  return {
    pillars, dayGan,
    lunarText: lunar.toString(),
    solarText, beijingText, correctedText,
    trueSolarOffsetSeconds: offsetSeconds,
    equationOfTimeSeconds: eotSeconds,
    wuXing, dayMasterStrength, qiYunText, qiYunStartSolar, daYun,
    prevJieQi, nextJieQi,
    taiYuan: `${ec.getTaiYuan()}（${ec.getTaiYuanNaYin()}）`,
    mingGong: `${ec.getMingGong()}（${ec.getMingGongNaYin()}）`,
    shenGong: `${ec.getShenGong()}（${ec.getShenGongNaYin()}）`,
    caliber,
  }
}
