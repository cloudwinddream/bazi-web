// 八字排盘引擎：历法层封装 + 排盘层（只出事实，不下判断）
// 引擎：lunar-javascript 1.7.7（6tail，MIT）
import { Solar, Lunar } from 'lunar-javascript'

export interface BirthInput {
  calendar: 'solar' | 'lunar'
  year: number
  month: number // 农历闰月时传负数（如 -2 表示闰二月），与 lunar-javascript 约定一致
  day: number
  hour: number
  minute: number
  gender: 'male' | 'female'
  longitude: number // 出生地经度，东经为正
  useTrueSolarTime: boolean
  ziSect: 1 | 2 // 子时流派：1=晚子时换日(23:00)，2=早晚子时均按当日(0:00 换日口径由库 sect 定义)
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
  correctedText: string
  trueSolarOffsetMinutes: number | null
  wuXing: { name: string; score: number }[]
  dayMasterStrength: string
  qiYunText: string
  daYun: DaYunItem[]
  caliber: string[]
}

const GAN_WUXING: Record<string, string> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
}
const ORDER = ['木', '火', '土', '金', '水']
// 藏干权重：本气 1.0 / 中气 0.5 / 余气 0.3；天干本柱另计 1.0
const HIDE_WEIGHTS = [1.0, 0.5, 0.3]

export const CITIES = [
  { name: '北京', lng: 116.40 }, { name: '上海', lng: 121.47 },
  { name: '广州', lng: 113.26 }, { name: '深圳', lng: 114.05 },
  { name: '成都', lng: 104.06 }, { name: '重庆', lng: 106.50 },
  { name: '西安', lng: 108.94 }, { name: '武汉', lng: 114.30 },
  { name: '南京', lng: 118.78 }, { name: '杭州', lng: 120.15 },
  { name: '乌鲁木齐', lng: 87.60 }, { name: '拉萨', lng: 91.10 },
  { name: '哈尔滨', lng: 126.53 }, { name: '昆明', lng: 102.71 },
]

/** 均时差近似（分钟），NOAA 简化公式 */
function equationOfTime(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const doy = Math.floor((date.getTime() - start) / 86400000)
  const b = (2 * Math.PI * (doy - 81)) / 364
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

function pad(n: number) { return String(n).padStart(2, '0') }
function fmt(y: number, m: number, d: number, h: number, mi: number) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(mi)}`
}

export function calcBazi(input: BirthInput): BaziResult {
  // 1. 先得到标准时间（北京时间 UTC+8 口径的墙钟时间）下的 Solar
  let solar: any
  if (input.calendar === 'solar') {
    solar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, 0)
  } else {
    const lunar = Lunar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, 0)
    solar = lunar.getSolar()
  }
  const solarText = fmt(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute())

  // 2. 真太阳时修正：经度差（相对东经 120°）+ 均时差
  let offsetMinutes: number | null = null
  let workSolar = solar
  if (input.useTrueSolarTime) {
    const base = new Date(Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute()))
    offsetMinutes = Math.round((input.longitude - 120) * 4 + equationOfTime(base))
    const corrected = new Date(base.getTime() + offsetMinutes * 60000)
    workSolar = Solar.fromYmdHms(
      corrected.getUTCFullYear(), corrected.getUTCMonth() + 1, corrected.getUTCDate(),
      corrected.getUTCHours(), corrected.getUTCMinutes(), 0,
    )
  }
  const correctedText = fmt(workSolar.getYear(), workSolar.getMonth(), workSolar.getDay(), workSolar.getHour(), workSolar.getMinute())

  // 3. 排盘
  const lunar = workSolar.getLunar()
  const ec = lunar.getEightChar()
  ec.setSect(input.ziSect)

  const mk = (label: string, gz: string, hide: string[], ssg: string, ssz: string[], nayin: string, dishi: string): Pillar => ({
    label, ganZhi: gz, gan: gz.charAt(0), zhi: gz.charAt(1),
    hideGan: hide, shiShenGan: ssg, shiShenZhi: ssz, naYin: nayin, diShi: dishi,
  })
  const pillars: Pillar[] = [
    mk('年柱', ec.getYear(), ec.getYearHideGan(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi()),
    mk('月柱', ec.getMonth(), ec.getMonthHideGan(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi()),
    mk('日柱', ec.getDay(), ec.getDayHideGan(), ec.getDayShiShenGan(), ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi()),
    mk('时柱', ec.getTime(), ec.getTimeHideGan(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi()),
  ]

  // 4. 五行加权（天干 1.0 + 藏干本/中/余气）
  const scores: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
  for (const p of pillars) {
    scores[GAN_WUXING[p.gan]] += 1.0
    p.hideGan.forEach((g, i) => { scores[GAN_WUXING[g]] += HIDE_WEIGHTS[i] ?? 0.2 })
  }
  const wuXing = ORDER.map((n) => ({ name: n, score: Math.round(scores[n] * 10) / 10 }))

  // 日主强弱粗判：同党（生我+同我）占比
  const dayGan = ec.getDayGan()
  const dayWx = GAN_WUXING[dayGan]
  const shengWo: Record<string, string> = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' }
  const total = wuXing.reduce((a, b) => a + b.score, 0)
  const ally = scores[dayWx] + scores[shengWo[dayWx]]
  const ratio = total ? ally / total : 0
  const dayMasterStrength = ratio >= 0.55 ? '身偏强' : ratio >= 0.42 ? '中和偏强' : ratio >= 0.32 ? '中和偏弱' : '身偏弱'

  // 5. 大运
  const yun = ec.getYun(input.gender === 'male' ? 1 : 0)
  const daYun: DaYunItem[] = yun.getDaYun().map((d: any, i: number) => ({
    index: i,
    startYear: d.getStartYear(),
    endYear: d.getEndYear(),
    startAge: d.getStartAge(),
    endAge: d.getEndAge(),
    ganZhi: i === 0 ? '起运前' : d.getGanZhi(),
    liuNian: d.getLiuNian().map((ln: any) => ({ year: ln.getYear(), age: ln.getAge(), ganZhi: ln.getGanZhi() })),
  }))
  const qiYunText = `出生后 ${yun.getStartYear()} 年 ${yun.getStartMonth()} 个月 ${yun.getStartDay()} 天起运（${yun.isForward() ? '顺行' : '逆行'}）`

  const caliber = [
    `历法引擎 lunar-javascript 1.7.7`,
    `子时流派 sect=${input.ziSect}（${input.ziSect === 1 ? '晚子时换日' : '子时不换日'}）`,
    input.useTrueSolarTime
      ? `真太阳时 开（经度 ${input.longitude}°，修正 ${offsetMinutes! >= 0 ? '+' : ''}${offsetMinutes} 分钟）`
      : '真太阳时 关（使用北京时间）',
    `起运算法：库默认三天折一年口径`,
  ]

  return {
    pillars, dayGan,
    lunarText: lunar.toString(),
    solarText, correctedText,
    trueSolarOffsetMinutes: offsetMinutes,
    wuXing, dayMasterStrength, qiYunText, daYun, caliber,
  }
}
