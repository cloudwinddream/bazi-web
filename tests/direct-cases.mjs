import { calcFromPillars, validatePillars, pillarWarnings } from './.build/bazi.js'
const PRESETS = [
  ['辛卯','庚子','丁丑','丁未','male'],['戊午','乙卯','甲子','乙亥','male'],['丙午','庚申','壬午','壬寅','male'],
  ['丁酉','乙巳','丙戌','丁酉','male'],['辛亥','辛卯','庚子','庚辰','male'],['癸未','甲寅','乙亥','己卯','male'],
  ['辛酉','庚子','癸未','丙辰','male'],['丙子','辛丑','戊子','癸丑','male'],['癸巳','甲子','丁酉','甲辰','male'],
  ['丙戌','壬辰','丙申','丙申','male'],['丁丑','甲辰','辛卯','己丑','female'],['戊子','庚申','乙丑','壬午','male'],
  ['辛未','己亥','丙辰','己亥','male'],['癸未','乙卯','甲子','乙巳','male'],
]
let pass=0, total=0
for (const [y,m,d,t,g] of PRESETS) {
  total++
  try {
    const r = calcFromPillars([y,m,d,t], g)
    const got = r.pillars.map(p=>p.ganZhi).join('')
    const ok = got === [y,m,d,t].join('')
    console.log(`${ok?'PASS':'FAIL'} 预设 ${y}${m}${d}${t} -> ${got} 日主${r.dayGan} 警告${pillarWarnings([y,m,d,t]).length}`)
    if (ok) pass++
  } catch(e){ console.log(`FAIL 预设 ${y}${m}${d}${t} ERR ${e.message}`) }
}
const bad = [
  [['甲丑','丙寅','甲子','甲子'],'不存在干支'],
  [['辛卯','庚子','丁丑','丁未X'],'字不合法/不完整'],
  [['甲子','丙寅','甲子','甲丑'],'时柱不存在干支'],
]
for (const [pillars, why] of bad) {
  total++
  const err = validatePillars(pillars)
  const ok = !!err
  console.log(`${ok?'PASS':'FAIL'} 非法拦截(${why}) ${pillars.join('')} -> ${err||'未拦截'}`)
  if (ok) pass++
}
// 警告（不拦截）：溥仪月柱、岳飞时柱
total++
const w = pillarWarnings(['丙午','庚申','壬午','壬寅'])
console.log(`${w.length?'PASS':'FAIL'} 警告提示 丙午庚申壬午壬寅 -> ${w.join(';')||'无'}`)
if (w.length) pass++
console.log(`\n${pass}/${total} passed（直接输入模式）`)
process.exit(pass===total?0:1)
