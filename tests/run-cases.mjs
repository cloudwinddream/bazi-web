// 10 个固定命例回归：锁定四柱，任何引擎/版本变动导致漂移都会在这里红
import { calcBazi } from './.build/bazi.js'

const base = { calendar: 'solar', gender: 'male', longitude: 116.40, useTrueSolarTime: false, ziSect: 1 }
const CASES = [
  { name: '基准·1990午时', input: { ...base, year: 1990, month: 6, day: 15, hour: 14, minute: 30 }, expect: '庚午 壬午 辛亥 乙未' },
  { name: '立春前·2024-02-04 12:00', input: { ...base, year: 2024, month: 2, day: 4, hour: 12, minute: 0 }, expect: '癸卯 乙丑 戊戌 戊午' },
  { name: '立春后·2024-02-04 18:00', input: { ...base, year: 2024, month: 2, day: 4, hour: 18, minute: 0 }, expect: '甲辰 丙寅 戊戌 辛酉' },
  { name: '子时sect1·2024-01-01 23:30', input: { ...base, year: 2024, month: 1, day: 1, hour: 23, minute: 30, ziSect: 1 }, expect: '癸卯 甲子 乙丑 丙子' },
  { name: '子时sect2·2024-01-01 23:30', input: { ...base, year: 2024, month: 1, day: 1, hour: 23, minute: 30, ziSect: 2 }, expect: '癸卯 甲子 甲子 丙子' },
  { name: '清明前·2024-04-04 12:00', input: { ...base, year: 2024, month: 4, day: 4, hour: 12, minute: 0 }, expect: '甲辰 丁卯 戊戌 戊午' },
  { name: '清明后·2024-04-04 18:00', input: { ...base, year: 2024, month: 4, day: 4, hour: 18, minute: 0 }, expect: '甲辰 戊辰 戊戌 辛酉' },
  { name: '闰二月·农历2023闰二月十五', input: { ...base, calendar: 'lunar', year: 2023, month: -2, day: 15, hour: 10, minute: 0 }, expect: '癸卯 丙辰 癸巳 丁巳' },
  { name: '千禧·2000-01-01 00:00 女', input: { ...base, gender: 'female', year: 2000, month: 1, day: 1, hour: 0, minute: 0 }, expect: '己卯 丙子 戊午 壬子' },
  { name: '真太阳时临界·乌鲁木齐07:30', input: { ...base, year: 2024, month: 6, day: 1, hour: 7, minute: 30, longitude: 87.60, useTrueSolarTime: true }, expectNotClock: true },
]

let pass = 0
for (const c of CASES) {
  const r = calcBazi(c.input)
  const got = r.pillars.map((p) => p.ganZhi).join(' ')
  const okWx = r.wuXing.reduce((a, b) => a + b.score, 0) >= 8 && r.daYun.length === 10
  if (c.expectNotClock) {
    // 乌鲁木齐经度修正约 -116 分钟：07:30 北京时间 → 约 05:16 真太阳时，时柱应为卯时而非辰时
    const ok = r.pillars[3].zhi === '卯' && okWx
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  -> ${got}  (时支期望 卯, 修正 ${r.trueSolarOffsetMinutes} 分钟)`)
    if (ok) pass++
  } else {
    const ok = got === c.expect && okWx
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  -> ${got}${ok ? '' : '  期望 ' + c.expect}`)
    if (ok) pass++
  }
}
console.log(`\n${pass}/${CASES.length} passed`)
process.exit(pass === CASES.length ? 0 : 1)
