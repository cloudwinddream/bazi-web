// v2 金标准复测（classic-v2.0）：强弱侧别、修正净影响、调候首用、印重提示
import { analyzeStrength } from './.build/strength.js'
import { analyzeStages } from './.build/stages.js'
import { readFileSync, writeFileSync } from 'node:fs'
const v2 = JSON.parse(readFileSync('/home/hatch/workspace/bazi-research/classic-cases/v2/classic-v2.0.json','utf8'))
const GANWX={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'}
const quad=(gz)=>({year:[gz[0],gz[1]],month:[gz[2],gz[3]],day:[gz[4],gz[5]],hour:[gz[6],gz[7]]})
const side=(g)=> g.includes('旺')||g==='偏旺'?'s':(g==='偏弱'||g==='身弱')?'w':'b'
const SIDE={s:['偏旺','身旺','极旺'],b:['中和'],w:['偏弱','身弱']}
// v1-style grade->side mapping via thresholds on grade string
function gradeSide(grade){ if(['偏旺','身旺','极旺'].includes(grade)) return 's'; if(['偏弱','身弱'].includes(grade)) return 'w'; return 'b' }
function expSideOf(e){ return e==='strong'?'s':e==='weak'?'w':'b' }
const rows=[]
for(const c of v2){
  const q=quad(c.bazi); const s=analyzeStrength(q); let st=null; try{ st=analyzeStages(q,s) }catch(e){}
  rows.push({bazi:c.bazi, group:c.v2_group, src:c.source, exp:c.v2_exp_side||c.exp_side, verdict_type:c.verdict_type,
    ratio:s.ratio, grade:s.grade, baseRatio:s.baseRatio, baseGrade:s.baseGrade,
    yin:s.yinHint.triggered, gates:{zhuan:s.gates.zhuan.suspect, cong:s.gates.cong.suspect},
    tio: st? {gods:st.tiaohou.gods, kept:st.tiaohou.kept, dropped:st.tiaohou.dropped, primary:st.tiaohou.primaryGod} : null})
}
const gold=rows.filter(r=>r.group==='gold_strength' && ['strong','weak','balanced'].includes(r.exp))
const goldBase=gold.filter(r=> expSideOf(r.exp)===gradeSide(r.baseGrade)).length
const goldAdj=gold.filter(r=> expSideOf(r.exp)===gradeSide(r.grade)).length
let helped=0,hurt=0,changes=[]
for(const r of gold){
  const eb=expSideOf(r.exp)===gradeSide(r.baseGrade), ea=expSideOf(r.exp)===gradeSide(r.grade)
  if(gradeSide(r.baseGrade)!==gradeSide(r.grade)) changes.push(r)
  if(!eb&&ea) helped++
  if(eb&&!ea) hurt++
}
console.log(`v2金标准普通盘 n=${gold.length} 基础命中 ${goldBase} 修正后命中 ${goldAdj} 修正帮${helped} 伤${hurt} 净${helped-hurt>=0?'+':''}${helped-hurt}`)
for(const r of changes) console.log(`  侧变 ${r.bazi} ${r.baseRatio.toFixed(3)}${r.baseGrade}->${r.ratio.toFixed(3)}${r.grade} 期望${r.exp}`)
console.log('哨兵:')
for(const b of ['辛未乙未庚辰丁亥','辛亥丙申乙亥庚辰']){ const r=rows.find(x=>x.bazi===b); console.log(`  ${b} ${r?.baseRatio}->${r?.ratio} ${r?.grade} (期望回收中和侧)`) }
console.log('印病3:')
for(const b of ['戊辰壬戌辛未己丑','癸未乙卯丙辰庚寅','癸巳癸亥甲寅壬申']){ const r=rows.find(x=>x.bazi===b); console.log(`  ${b} yinHint=${r?.yin} ${r?.grade}`) }
const goldTrig=rows.filter(r=>r.group==='gold_strength'&&r.yin)
console.log(`金标准组印重触发共 ${goldTrig.length}: ${goldTrig.map(r=>r.bazi).join(' ')}`)
// tiaohou
const py=JSON.parse(readFileSync('/home/hatch/workspace/bazi-research/classic-cases/tiaohou-python.json','utf8')); const pym=new Map(py.map(e=>[e.bazi,e]))
const th=rows.filter(r=>r.group==='tiaohou'||r.bazi==='戊戌壬戌甲子甲申')
let thHit=0
for(const r of th){ const e=pym.get(r.bazi); const hit=r.tio && r.tio.kept[0]===e.kept[0]; if(hit) thHit++; else console.log(`  TIO MISS ${r.bazi} site kept=${r.tio?.kept} py=${e?.kept}`) }
console.log(`调候组 n=${th.length} 首用(剔病后首位五行)命中 ${thHit}`)
// zhuanwang/cong structural
const zw=rows.filter(r=>r.group==='gold_strength'&&r.exp==='zhuanwang'); const cg=rows.filter(r=>r.group==='gold_strength'&&r.exp==='cong')
console.log(`专旺结构闸 ${zw.filter(r=>r.gates.zhuan).length}/${zw.length} 从格结构闸 ${cg.filter(r=>r.gates.cong).length}/${cg.length}`)
writeFileSync('/home/hatch/workspace/bazi-research/classic-cases/v2/round2-results.json', JSON.stringify(rows,null,1))
