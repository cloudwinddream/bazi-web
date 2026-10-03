<script setup lang="ts">
import { ref, computed } from 'vue'
import { calcBazi, calcFromPillars, CITIES, type BirthInput, type BaziResult } from './engine/bazi'

const form = ref({
  calendar: 'solar' as 'solar' | 'lunar',
  date: '1990-06-15',
  time: '14:30',
  gender: 'male' as 'male' | 'female',
  city: '北京',
  longitude: 116.40,
  second: 0,
  timeZoneOffset: 8,
  useTrueSolarTime: true,
  ziSect: 1 as 1 | 2,
  daYunSect: 1 as 1 | 2,
  lunarLeap: false,
})

const inputMode = ref<'birth' | 'direct'>('birth')
const GAN_OPTS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
const ZHI_OPTS = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
const direct = ref([
  { gan: '辛', zhi: '卯' }, { gan: '庚', zhi: '子' }, { gan: '丁', zhi: '丑' }, { gan: '丁', zhi: '未' },
])
const PRESETS: { name: string; gz: string; gender: 'male' | 'female' }[] = [
  { name: '胡适', gz: '辛卯庚子丁丑丁未', gender: 'male' },
  { name: '南怀瑾', gz: '戊午乙卯甲子乙亥', gender: 'male' },
  { name: '溥仪', gz: '丙午庚申壬午壬寅', gender: 'male' },
  { name: '戴笠', gz: '丁酉乙巳丙戌丁酉', gender: 'male' },
  { name: '韦千里', gz: '辛亥辛卯庚子庚辰', gender: 'male' },
  { name: '李鸿章', gz: '癸未甲寅乙亥己卯', gender: 'male' },
  { name: '王安石', gz: '辛酉庚子癸未丙辰', gender: 'male' },
  { name: '彭玉麟', gz: '丙子辛丑戊子癸丑', gender: 'male' },
  { name: '毛泽东', gz: '癸巳甲子丁酉甲辰', gender: 'male' },
  { name: '徐乐吾', gz: '丙戌壬辰丙申丙申', gender: 'male' },
  { name: '证严法师', gz: '丁丑甲辰辛卯己丑', gender: 'female' },
  { name: '杜月笙', gz: '戊子庚申乙丑壬午', gender: 'male' },
  { name: '曾国藩', gz: '辛未己亥丙辰己亥', gender: 'male' },
  { name: '岳飞', gz: '癸未乙卯甲子乙巳', gender: 'male' },
]
function applyPreset(pr: typeof PRESETS[number]) {
  for (let i = 0; i < 4; i++) { direct.value[i] = { gan: pr.gz.charAt(i * 2), zhi: pr.gz.charAt(i * 2 + 1) } }
  form.value.gender = pr.gender
  runDirect()
}
function runDirect() {
  errorMsg.value = ''
  try {
    const pillars = direct.value.map((d) => d.gan + d.zhi)
    result.value = calcFromPillars(pillars, form.value.gender, form.value.ziSect)
  } catch (e: any) {
    errorMsg.value = e?.message || '八字输入有误，请检查。'
    result.value = null
  }
}
const result = ref<BaziResult | null>(null)
const selectedDaYun = ref(1)
const errorMsg = ref('')

const WX_BAR: Record<string, string> = { 木: '#4e7a51', 火: '#b3352b', 土: '#a97b1f', 金: '#b8860b', 水: '#35618e' }
const currentYear = new Date().getFullYear()
const todayStr = new Date().toISOString().slice(0, 10)

const CITY_TZ: Record<string, number> = { 纽约: -5, 伦敦: 0, 东京: 9, 悉尼: 10 }
function onCityChange() {
  const c = CITIES.find((x) => x.name === form.value.city)
  if (c) form.value.longitude = c.lng
  form.value.timeZoneOffset = CITY_TZ[form.value.city] ?? 8
}

function run() {
  errorMsg.value = ''
  try {
    const [y, m, d] = form.value.date.split('-').map(Number)
    const [hh, mm] = form.value.time.split(':').map(Number)
    const month = form.value.calendar === 'lunar' && form.value.lunarLeap ? -m : m
    const input: BirthInput = {
      calendar: form.value.calendar, year: y, month, day: d,
      hour: hh, minute: mm, second: Number(form.value.second) || 0, gender: form.value.gender,
      longitude: Number(form.value.longitude),
      timeZoneOffset: Number(form.value.timeZoneOffset),
      useTrueSolarTime: form.value.useTrueSolarTime,
      ziSect: form.value.ziSect,
      daYunSect: form.value.daYunSect,
      placeName: form.value.city,
    }
    result.value = calcBazi(input)
    const idx = result.value.daYun.findIndex((dy) => dy.index > 0 && todayStr >= dy.startDate && todayStr <= dy.endDate)
    selectedDaYun.value = idx >= 0 ? idx : 1
  } catch (e: any) {
    errorMsg.value = '输入有误或日期超出支持范围，请检查后重试。'
    result.value = null
  }
}

const maxWx = computed(() => (result.value ? Math.max(...result.value.wuXing.map((w) => w.score), 1) : 1))
const activeDaYun = computed(() => (result.value ? result.value.daYun[selectedDaYun.value] : null))
function isCurrentDy(dy: any) { return dy.index > 0 && todayStr >= dy.startDate && todayStr <= dy.endDate }

// ---- 五行分阴阳配色 ----
// 规则：同五行同色系；阳（干：甲丙戊庚壬 / 支：子寅辰午申戌）用饱和明亮本色，阴用同色系柔和偏浅色。
const GAN_LIST = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const ZHI_LIST = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const GAN_WX: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }
const ZHI_WX: Record<string, string> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }
// 深色盘面用色（亮）
const DARK_COLORS: Record<string, { yang: string; yin: string }> = {
  木: { yang: '#58c96b', yin: '#a9c98a' },
  火: { yang: '#ff3d1f', yin: '#ff9d8a' },
  土: { yang: '#e6a83c', yin: '#dbc08b' },
  金: { yang: '#ffd21f', yin: '#eee09b' },
  水: { yang: '#45a7f5', yin: '#a9cbe8' },
}
// 浅色表格用色（深，保证白底可读）
const LIGHT_COLORS: Record<string, { yang: string; yin: string }> = {
  木: { yang: '#2e7d32', yin: '#7aa95f' },
  火: { yang: '#cf2a1f', yin: '#e07a6a' },
  土: { yang: '#8f5d14', yin: '#b28c4d' },
  金: { yang: '#9c7600', yin: '#bfa94e' },
  水: { yang: '#1565c0', yin: '#6f9fd0' },
}
function isYangGan(g: string) { const i = GAN_LIST.indexOf(g); return i >= 0 && i % 2 === 0 }
function isYangZhi(z: string) { const i = ZHI_LIST.indexOf(z); return i >= 0 && i % 2 === 0 }
function darkGanStyle(g: string, isDay = false) {
  if (isDay) return { color: '#ffffff', textShadow: '0 0 10px rgba(255,255,255,.35)' }
  const c = DARK_COLORS[GAN_WX[g]]; return { color: isYangGan(g) ? c.yang : c.yin }
}
function darkZhiStyle(z: string) { const c = DARK_COLORS[ZHI_WX[z]]; return { color: isYangZhi(z) ? c.yang : c.yin } }
function lightGanStyle(g: string) { const c = LIGHT_COLORS[GAN_WX[g]]; return { color: isYangGan(g) ? c.yang : c.yin } }
function lightZhiStyle(z: string) { const c = LIGHT_COLORS[ZHI_WX[z]]; return { color: isYangZhi(z) ? c.yang : c.yin } }
function lightHideStyle(g: string) { return lightGanStyle(g) }
function darkHideStyle(g: string) { return darkGanStyle(g) }

// 十神简称（藏干下方小字，仿参考图单字风格；全称在十神行展示）
const SS_SHORT: Record<string, string> = {
  比肩: '比', 劫财: '劫', 食神: '食', 伤官: '伤', 偏财: '才', 正财: '财',
  七杀: '杀', 正官: '官', 偏印: '枭', 正印: '印', 日主: '日',
}
const shortSS = (s: string) => SS_SHORT[s] || s

run()
</script>

<template>
  <div class="wrap">
    <header class="top">
      <h1>云八字</h1>
      <p>纯前端排盘 · 本地计算 · 生辰不上传</p>
    </header>

    <section class="card">
      <h2>{{ inputMode === 'birth' ? '出生信息' : '直接输入八字' }}</h2>
      <div class="seg mode-seg">
        <button :class="{ on: inputMode === 'birth' }" @click="inputMode = 'birth'">生辰排盘</button>
        <button :class="{ on: inputMode === 'direct' }" @click="inputMode = 'direct'">直接输入八字</button>
      </div>
      <template v-if="inputMode === 'direct'">
        <div class="direct-grid">
          <div v-for="(d, i) in direct" :key="i" class="direct-col">
            <label>{{ ['年柱','月柱','日柱','时柱'][i] }}</label>
            <select v-model="direct[i].gan"><option v-for="g in GAN_OPTS" :key="g" :value="g">{{ g }}</option></select>
            <select v-model="direct[i].zhi"><option v-for="z in ZHI_OPTS" :key="z" :value="z">{{ z }}</option></select>
          </div>
        </div>
        <div class="switches">
          <label>性别：
            <select v-model="form.gender"><option value="male">男 · 乾造</option><option value="female">女 · 坤造</option></select>
          </label>
          <span class="small">改性别只影响大运顺逆说明，本命盘不变；直接输入默认只看本命盘。</span>
        </div>
        <button class="btn" @click="runDirect">出 盘</button>
        <div class="preset-box">
          <div class="preset-title">名人命例 · 备用计算八字·比对用（点一下即出盘）</div>
          <div class="preset-chips">
            <button v-for="pr in PRESETS" :key="pr.name" class="chip" @click="applyPreset(pr)">{{ pr.gz }} {{ pr.name }}</button>
          </div>
        </div>
      </template>
      <div v-if="inputMode === 'birth'" class="grid">
        <div class="field">
          <label>历法</label>
          <div class="seg">
            <button :class="{ on: form.calendar === 'solar' }" @click="form.calendar = 'solar'">公历</button>
            <button :class="{ on: form.calendar === 'lunar' }" @click="form.calendar = 'lunar'">农历</button>
          </div>
        </div>
        <div class="field">
          <label>性别</label>
          <div class="seg">
            <button :class="{ on: form.gender === 'male' }" @click="form.gender = 'male'">男 · 乾造</button>
            <button :class="{ on: form.gender === 'female' }" @click="form.gender = 'female'">女 · 坤造</button>
          </div>
        </div>
        <div class="field"><label>出生日期</label><input type="date" v-model="form.date" min="1900-01-01" max="2100-12-31" /></div>
        <div class="field"><label>出生时间</label><input type="time" v-model="form.time" /></div>
        <div class="field">
          <label>出生地（带出经度）</label>
          <select v-model="form.city" @change="onCityChange">
            <option v-for="c in CITIES" :key="c.name" :value="c.name">{{ c.name }}（{{ c.lng }}°E）</option>
          </select>
        </div>
        <div class="field"><label>经度（可手改）</label><input type="number" step="0.01" v-model="form.longitude" /></div>
        <div class="field"><label>秒（可选，精确排盘）</label><input type="number" min="0" max="59" v-model="form.second" /></div>
        <div class="field">
          <label>出生地时区（UTC偏移）</label>
          <select v-model.number="form.timeZoneOffset">
            <option :value="8">UTC+8 中国</option><option :value="9">UTC+9 东京</option>
            <option :value="10">UTC+10 悉尼</option><option :value="0">UTC+0 伦敦</option>
            <option :value="-5">UTC-5 纽约(标准时)</option><option :value="-8">UTC-8 洛杉矶(标准时)</option>
          </select>
        </div>
      </div>
      <template v-if="inputMode === 'birth'">
      <div class="switches">
        <label><input type="checkbox" v-model="form.useTrueSolarTime" /> 真太阳时</label>
        <label v-if="form.calendar === 'lunar'"><input type="checkbox" v-model="form.lunarLeap" /> 闰月</label>
        <label>子时：
          <select v-model.number="form.ziSect"><option :value="1">晚子换日（23点）</option><option :value="2">子时不换日</option></select>
        </label>
        <label>起运：
          <select v-model.number="form.daYunSect"><option :value="1">日时法（三天折一年）</option><option :value="2">分钟精算法</option></select>
        </label>
      </div>
      <button class="btn" @click="run">排 盘</button>
      </template>
      <p v-if="errorMsg" style="color: var(--red); font-size: 13px;">{{ errorMsg }}</p>
    </section>

    <template v-if="result">
      <!-- 顶部信息行（图1） -->
      <section v-if="result.directMode" class="card info-card">
        <table class="info-table"><tbody>
          <tr><th>四柱</th><td>{{ result.pillars.map(p=>p.ganZhi).join(' ') }} · {{ result.genderLabel }} · 日主 {{ result.dayGan }}（备用计算八字·比对用）</td></tr>
          <tr v-if="result.reverseSolarText"><th>反查示例</th><td>公历 {{ result.reverseSolarText }}（仅用于取库本命字段，不代表命主生辰）</td></tr>
          <tr><th>大运</th><td>直接输入模式默认只看本命盘；需补出生日期/性别并改用生辰排盘才能排大运。</td></tr>
        </tbody></table>
      </section>
      <section v-else class="card info-card">
        <table class="info-table">
          <tbody>
            <tr><th>日期</th><td>{{ result.solarText }}（农历 {{ result.lunarText }}）</td></tr>
            <tr><th>真太阳时</th><td>{{ result.trueSolarOffsetSeconds !== null ? `${result.correctedText}（${result.placeName || '出生地'}，偏移 ${result.trueSolarOffsetSeconds >= 0 ? '+' : ''}${Math.round(result.trueSolarOffsetSeconds)} 秒）` : `${result.beijingText}（北京时间，未启用真太阳时）` }}</td></tr>
            <tr><th>节气</th><td>{{ result.jieQiTermText || `${result.prevJieQiName}后${result.jieQiFromPrevText}，${result.nextJieQiName}前${result.jieQiToNextText}` }}<span class="small">（{{ result.prevJieQi }} → {{ result.nextJieQi }}）</span></td></tr>
          </tbody>
        </table>
      </section>

      <!-- 深色四柱大盘面（图2） -->
      <section class="dark-pan">
        <div class="dark-head">
          <span class="qiankun">{{ result.genderLabel }}</span>
          <span class="dark-sub">日主 {{ result.dayGan }} · {{ result.dayMasterStrength }}</span>
        </div>
        <div class="dark-cols">
          <div v-for="p in result.pillars" :key="p.label" class="dark-col" :class="{ 'is-day': p.label === '日柱' }">
            <div class="dark-pillar-label">{{ p.label.replace('柱', '') }}</div>
            <div class="dark-shishen">{{ p.label === '日柱' ? '日元' : p.shiShenGan }}</div>
            <div class="dark-gan" :style="darkGanStyle(p.gan, p.label === '日柱')">{{ p.gan }}</div>
            <div class="dark-zhi" :style="darkZhiStyle(p.zhi)">{{ p.zhi }}</div>
            <div class="dark-divider"></div>
            <div class="dark-hide">
              <div v-for="(hg, i) in p.hideGan" :key="i" class="dark-hide-item">
                <div class="dark-hide-gan" :style="darkHideStyle(hg)">{{ hg }}</div>
                <div class="dark-hide-ss">{{ shortSS(p.shiShenZhi[i]) }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="legend">
          配色：同五行同色系，<b>阳</b>用饱和本色、<b>阴</b>用同系柔色（干：甲丙戊庚壬阳 / 乙丁己辛癸阴；支：子寅辰午申戌阳 / 丑卯巳未酉亥阴）。日干白字高亮。
        </div>
      </section>

      <!-- 浅色明细表（图1） -->
      <section class="card">
        <h2>命盘明细 · {{ result.genderLabel }}</h2>
        <div class="scroll-x">
          <table class="pan">
            <thead>
              <tr><th></th><th v-for="p in result.pillars" :key="p.label" :class="{ 'day-highlight': p.label === '日柱' }">{{ p.label }}</th></tr>
            </thead>
            <tbody>
              <tr><th>十神</th><td v-for="p in result.pillars" :key="p.label">{{ p.label === '日柱' ? '日元（日主）' : p.shiShenGan }}</td></tr>
              <tr>
                <th>{{ result.genderLabel }}</th>
                <td v-for="p in result.pillars" :key="p.label" :class="{ 'day-highlight': p.label === '日柱' }">
                  <div class="gz-stack">
                    <span class="gz-big" :style="lightGanStyle(p.gan)">{{ p.gan }}</span>
                    <span class="gz-big" :style="lightZhiStyle(p.zhi)">{{ p.zhi }}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <th>藏干</th>
                <td v-for="p in result.pillars" :key="p.label">
                  <div class="hide-wrap light">
                    <div v-for="(hg, i) in p.hideGan" :key="i" class="hide-item">
                      <div class="hide-gan" :style="lightHideStyle(hg)">{{ hg }}</div>
                      <div class="hide-ss">{{ shortSS(p.shiShenZhi[i]) }}<span class="hide-full">{{ p.shiShenZhi[i] }}</span></div>
                    </div>
                  </div>
                </td>
              </tr>
              <tr><th>纳音</th><td v-for="p in result.pillars" :key="p.label">{{ p.naYin }}</td></tr>
              <tr><th>地势</th><td v-for="p in result.pillars" :key="p.label">{{ p.diShi }}</td></tr>
              <tr><th>自坐</th><td v-for="p in result.pillars" :key="p.label">{{ p.ziZuo }}</td></tr>
              <tr><th>空亡</th><td v-for="p in result.pillars" :key="p.label">{{ p.xunKong }}<span class="small">（{{ p.xun }}旬）</span></td></tr>
              <tr><th>神煞</th><td colspan="4" class="left-note">引擎（lunar-javascript 1.7.7 EightChar）未提供神煞接口，本版不展示，避免编造；后续按标准神煞表补入。</td></tr>
            </tbody>
          </table>
        </div>
        <div class="gong-row">
          <div class="gong-box"><div class="gong-label">胎元</div><div class="gz-stack sm"><span :style="lightGanStyle(result.taiYuanGanZhi.charAt(0))">{{ result.taiYuanGanZhi.charAt(0) }}</span><span :style="lightZhiStyle(result.taiYuanGanZhi.charAt(1))">{{ result.taiYuanGanZhi.charAt(1) }}</span></div><div class="small">{{ result.taiYuan }}</div></div>
          <div class="gong-box"><div class="gong-label">命宫</div><div class="gz-stack sm"><span :style="lightGanStyle(result.mingGongGanZhi.charAt(0))">{{ result.mingGongGanZhi.charAt(0) }}</span><span :style="lightZhiStyle(result.mingGongGanZhi.charAt(1))">{{ result.mingGongGanZhi.charAt(1) }}</span></div><div class="small">{{ result.mingGong }}</div></div>
          <div class="gong-box"><div class="gong-label">身宫</div><div class="gz-stack sm"><span :style="lightGanStyle(result.shenGongGanZhi.charAt(0))">{{ result.shenGongGanZhi.charAt(0) }}</span><span :style="lightZhiStyle(result.shenGongGanZhi.charAt(1))">{{ result.shenGongGanZhi.charAt(1) }}</span></div><div class="small">{{ result.shenGong }}</div></div>
        </div>
      </section>

      <section class="card">
        <h2>五行分布（藏干加权）</h2>
        <div class="wx-row" v-for="w in result.wuXing" :key="w.name">
          <span class="nm">{{ w.name }}</span>
          <div class="wx-bar"><div class="wx-fill" :style="{ width: (w.score / maxWx * 100) + '%', background: WX_BAR[w.name] }"></div></div>
          <span class="sc">{{ w.score.toFixed(1) }}</span>
        </div>
        <p class="meta">日主 {{ result.dayGan }}：{{ result.dayMasterStrength }}（同党占比粗判，仅供参考）</p>
      </section>

      <section v-if="!result.daYun.length" class="card">
        <h2>大运 · 交运</h2>
        <p class="jiao">直接输入模式默认只看本命盘，大运无法排：需补出生日期/性别并改用「生辰排盘」才能排大运。此处不假排。</p>
      </section>
      <section v-else class="card">
        <h2>大运 · 交运</h2>
        <p class="jiao">{{ result.jiaoYunText }}。首步交运：{{ result.qiYunStartSolar }}（{{ result.qiYunStartDate }}）。</p>
        <div class="dy-scroll">
          <div v-for="dy in result.daYun" :key="dy.index" class="dy-card" :class="{ on: selectedDaYun === dy.index, cur: isCurrentDy(dy) }" @click="selectedDaYun = dy.index">
            <div class="dy-years">{{ dy.startYear }}–{{ dy.endYear }}</div>
            <template v-if="dy.index === 0">
              <div class="dy-before">起运前</div><div class="dy-date">{{ dy.startDate }} 起</div>
            </template>
            <template v-else>
              <div class="gz-stack dy-gz">
                <span :style="lightGanStyle(dy.gan)">{{ dy.gan }}</span>
                <span :style="lightZhiStyle(dy.zhi)">{{ dy.zhi }}</span>
              </div>
              <div class="dy-ss">{{ dy.shiShenGan }} · {{ dy.shiShenZhiMain }}</div>
              <div class="hide-wrap light dy-hide">
                <div v-for="(hg, i) in dy.hideGan" :key="i" class="hide-item">
                  <div class="hide-gan" :style="lightHideStyle(hg)">{{ hg }}</div>
                  <div class="hide-ss">{{ shortSS(dy.shiShenZhi[i]) }}</div>
                </div>
              </div>
              <div class="dy-date">{{ dy.startDate }} 起交<br />至 {{ dy.endDate }}<br />起运 {{ dy.startAgeText }}<span v-if="isCurrentDy(dy)"> · 当前大运</span></div>
            </template>
          </div>
        </div>

        <div v-if="activeDaYun && activeDaYun.index > 0" class="ln-head">流年 · {{ activeDaYun.ganZhi }}大运（{{ activeDaYun.startDate }} ～ {{ activeDaYun.endDate }}）</div>
        <div v-if="activeDaYun" class="ln-grid2">
          <div v-for="ln in activeDaYun.liuNian" :key="ln.year" class="ln-card" :class="{ cur: ln.year === currentYear }">
            <div class="ln-year">{{ ln.year }} · {{ ln.age }}岁</div>
            <div class="gz-stack ln-gz">
              <span :style="lightGanStyle(ln.gan)">{{ ln.gan }}</span>
              <span :style="lightZhiStyle(ln.zhi)">{{ ln.zhi }}</span>
            </div>
            <div class="ln-ss">{{ ln.shiShenGan }} · {{ ln.shiShenZhiMain }}</div>
            <div class="hide-wrap light ln-hide">
              <div v-for="(hg, i) in ln.hideGan" :key="i" class="hide-item">
                <div class="hide-gan" :style="lightHideStyle(hg)">{{ hg }}</div>
                <div class="hide-ss">{{ shortSS(ln.shiShenZhi[i]) }}</div>
              </div>
            </div>
          </div>
        </div>
        <p class="meta">大运/流年十神口径：天干十神 + 地支本气（藏干首位）十神；藏干小字为地支全部藏干及其对日主十神（简称）。</p>
      </section>
    </template>

    <footer>
      <div v-if="result">计算口径：{{ result.caliber.join('；') }}</div>
      <div v-if="result">配色口径：同五行同色系，阳（干甲丙戊庚壬、支子寅辰午申戌）饱和本色，阴同系柔色；藏干颜色按其天干五行阴阳。自坐按库 CHANG_SHENG 同表以柱干坐柱支计算。</div>
      <div>本站所有计算均在您的浏览器本地完成，不上传任何数据。</div>
      <div>仅供传统文化研究与娱乐参考，不构成任何决策依据。</div>
    </footer>
  </div>
</template>
