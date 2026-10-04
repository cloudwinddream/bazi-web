<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { calcBazi, calcFromPillars, CITIES, type BirthInput, type BaziResult } from './engine/bazi'

// ---- 主题（浅色默认，记 localStorage） ----
type Theme = 'light' | 'dark'
function initTheme(): Theme {
  try {
    const saved = localStorage.getItem('bazi-theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* ignore */ }
  return 'light'
}
const theme = ref<Theme>(initTheme())
function applyTheme(t: Theme) {
  try {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('bazi-theme', t)
  } catch { /* ignore */ }
}
applyTheme(theme.value)
watch(theme, (t) => applyTheme(t))
function toggleTheme() { theme.value = theme.value === 'light' ? 'dark' : 'light' }

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
// ---- 结论先行：推导抽屉 ----
type DrawerTab = 'strength' | 'tiaohou' | 'geju' | 'yongshen' | 'shensha'
const drawerTab = ref<DrawerTab | null>(null)
function openDrawer(t: DrawerTab) { drawerTab.value = t }
function closeDrawer() { drawerTab.value = null }
const PILLAR_KEYS = ['year', 'month', 'day', 'hour']
const openAdj = ref<Set<number>>(new Set())
function toggleAdj(i: number) { const n = new Set(openAdj.value); n.has(i) ? n.delete(i) : n.add(i); openAdj.value = n }
const selectedDaYun = ref(1)
const errorMsg = ref('')

const WX_BAR: Record<string, string> = { 木: '#4e7a51', 火: '#b3352b', 土: '#a97b1f', 金: '#b8860b', 水: '#35618e' }
function wxBarColor(name: string) {
  if (theme.value === 'dark') {
    const c = DARK_COLORS[name]; return c ? c.yang : WX_BAR[name]
  }
  return WX_BAR[name]
}
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
// ---- 强弱推导展开 ----
const openFactors = ref<Set<string>>(new Set())
function toggleFactor(k: string) { const s = new Set(openFactors.value); s.has(k) ? s.delete(k) : s.add(k); openFactors.value = s }
const wxFilter = ref<string | null>(null)
const showL2 = ref(false); const showL3 = ref(false)
const WX_CYCLE = ['木', '火', '土', '金', '水']
const circleItems = computed(() => {
  const r = result.value; if (!r) return []
  const dayWx = r.pillars[2].ganWx
  const start = WX_CYCLE.indexOf(dayWx)
  return r.strength.monthState.map((row) => {
    const k = (WX_CYCLE.indexOf(row.wuxing) - start + 5) % 5
    const ang = (-90 + k * 72) * Math.PI / 180
    const pt = (rad: number) => ({ x: 250 + rad * Math.cos(ang), y: 250 + rad * Math.sin(ang) })
    return { row, namePt: pt(108), statPt: pt(163), godPt: pt(214), isDay: row.wuxing === dayWx }
  })
})
// 敌我分界：排布恒为日主置顶、按生序环排。同党=日主五行(顶)+生我五行(左上)为连续弧，
// 两处真实分界角为 -54°（同党/我生侧间）与 162°（克我/生我间）。五块奇数，一条直穿线必切一块，
// 故用从圆心出发的两条斜射线分开两阵营（与用户原图斜线划分同义、位置更准）。
const _cpt = (deg: number, rad: number) => ({ x: 250 + rad * Math.cos(deg * Math.PI / 180), y: 250 + rad * Math.sin(deg * Math.PI / 180) })
const divideP1 = _cpt(-54, 238)
const divideP2 = _cpt(162, 238)
const allyLabel = _cpt(-126, 78)
const enemyLabel = _cpt(54, 78)
const maxElem = computed(() => (result.value ? Math.max(...result.value.strength.elementPower.map((e) => e.weighted), 1) : 1))
const STATUS_COLOR: Record<string, string> = { 旺: '#cf2a1f', 相: '#d97a16', 休: '#7a6a55', 囚: '#35618e', 死: '#4a4a6a' }
const statusStyle = (s: string) => ({ color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] })
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
// 统一五行阴阳着色：随主题选色板——浅色主题用深版色（白底可读），深色主题用亮版色（暗底可读）
// 日元干在两套主题下都额外加粗描边/光晕，保证可辨识（列背景高亮另见 .day-highlight）
function ganStyle(g: string, isDay = false) {
  const palette = theme.value === 'dark' ? DARK_COLORS : LIGHT_COLORS
  const c = palette[GAN_WX[g]]
  const base: Record<string, string> = { color: isYangGan(g) ? c.yang : c.yin }
  if (isDay) {
    base.fontWeight = '800'
    base.textShadow = theme.value === 'dark' ? '0 0 10px rgba(255,255,255,.45)' : '0 0 6px rgba(179,53,43,.35)'
  }
  return base
}
function zhiStyle(z: string) { const palette = theme.value === 'dark' ? DARK_COLORS : LIGHT_COLORS; const c = palette[ZHI_WX[z]]; return { color: isYangZhi(z) ? c.yang : c.yin } }
function hideStyle(g: string) { return ganStyle(g) }

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
      <button class="theme-toggle" type="button" @click="toggleTheme" :aria-label="theme === 'light' ? '切换到深色主题' : '切换到浅色主题'">
        {{ theme === 'light' ? '🌙 深色' : '☀️ 浅色' }}
      </button>
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

      <!-- 命盘明细表（统一主题） -->
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
                    <span class="gz-big" :style="ganStyle(p.gan, p.label === '日柱')">{{ p.gan }}</span>
                    <span class="gz-big" :style="zhiStyle(p.zhi)">{{ p.zhi }}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <th>藏干</th>
                <td v-for="p in result.pillars" :key="p.label">
                  <div class="hide-wrap light">
                    <div v-for="(hg, i) in p.hideGan" :key="i" class="hide-item">
                      <div class="hide-gan" :style="hideStyle(hg)">{{ hg }}</div>
                      <div class="hide-ss">{{ shortSS(p.shiShenZhi[i]) }}<span class="hide-full">{{ p.shiShenZhi[i] }}</span></div>
                    </div>
                  </div>
                </td>
              </tr>
              <tr><th>纳音</th><td v-for="p in result.pillars" :key="p.label">{{ p.naYin }}</td></tr>
              <tr><th>地势</th><td v-for="p in result.pillars" :key="p.label">{{ p.diShi }}</td></tr>
              <tr><th>自坐</th><td v-for="p in result.pillars" :key="p.label">{{ p.ziZuo }}</td></tr>
              <tr><th>空亡</th><td v-for="p in result.pillars" :key="p.label">{{ p.xunKong }}<span class="small">（{{ p.xun }}旬）</span></td></tr>
              <tr><th>神煞</th>
                <td v-for="(p, idx) in result.pillars" :key="p.label">
                  <span v-if="!result.shensha.perPillar[PILLAR_KEYS[idx]].length" class="small">—</span>
                  <button v-for="h in result.shensha.perPillar[PILLAR_KEYS[idx]]" :key="h.name" class="sha-chip" :title="h.meaning" @click="openDrawer('shensha')">{{ h.name }}</button>
                  <button v-if="p.xunKong.includes(p.zhi)" class="sha-chip kong" title="旬空之位" @click="openDrawer('shensha')">空亡</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="gong-row">
          <div class="gong-box"><div class="gong-label">胎元</div><div class="gz-stack sm"><span :style="ganStyle(result.taiYuanGanZhi.charAt(0))">{{ result.taiYuanGanZhi.charAt(0) }}</span><span :style="zhiStyle(result.taiYuanGanZhi.charAt(1))">{{ result.taiYuanGanZhi.charAt(1) }}</span></div><div class="small">{{ result.taiYuan }}</div></div>
          <div class="gong-box"><div class="gong-label">命宫</div><div class="gz-stack sm"><span :style="ganStyle(result.mingGongGanZhi.charAt(0))">{{ result.mingGongGanZhi.charAt(0) }}</span><span :style="zhiStyle(result.mingGongGanZhi.charAt(1))">{{ result.mingGongGanZhi.charAt(1) }}</span></div><div class="small">{{ result.mingGong }}</div></div>
          <div class="gong-box"><div class="gong-label">身宫</div><div class="gz-stack sm"><span :style="ganStyle(result.shenGongGanZhi.charAt(0))">{{ result.shenGongGanZhi.charAt(0) }}</span><span :style="zhiStyle(result.shenGongGanZhi.charAt(1))">{{ result.shenGongGanZhi.charAt(1) }}</span></div><div class="small">{{ result.shenGong }}</div></div>
        </div>
        <p class="legend-inline">配色：同五行同色系，<b>阳</b>饱和本色、<b>阴</b>同系柔色（木绿·火红·土黄褐·金黄·水蓝；干：甲丙戊庚壬阳 / 乙丁己辛癸阴，支：子寅辰午申戌阳 / 丑卯巳未酉亥阴）。日柱列底色高亮、日干加粗。右上角可切换深 / 浅主题，两套下均为可读色板。</p>
      </section>


      <!-- 结论先行：各阶段结论条（点开进推导抽屉） -->
      <section class="card concl-card">
        <h2>推导结论 · 点条目看推导</h2>
        <div class="concl-list">
          <button class="concl-bar" @click="openDrawer('strength')"><span class="concl-k">强弱</span><span class="concl-v">{{ result.strength.grade }} · 修正后 {{ result.strength.ratio.toFixed(3) }}（基础 {{ result.strength.baseRatio.toFixed(3) }}）<span v-if="result.strength.crossGrade" class="cross"> · 关系修正跨档</span></span><span class="concl-go">推导 ›</span></button>
          <button class="concl-bar" @click="openDrawer('tiaohou')"><span class="concl-k">调候</span><span class="concl-v">{{ result.tiaohou.climate }} · {{ result.tiaohou.needText }}</span><span class="concl-go">推导 ›</span></button>
          <button class="concl-bar" @click="openDrawer('geju')"><span class="concl-k">格局</span><span class="concl-v">{{ result.geju.name }} · {{ result.geju.basis }}</span><span class="concl-go">推导 ›</span></button>
          <button class="concl-bar" @click="openDrawer('yongshen')"><span class="concl-k">多寡/用神</span><span class="concl-v">喜 {{ result.yongshen.xi.join('、') }} · 忌 {{ result.yongshen.ji.join('、') || '—' }}（候选）</span><span class="concl-go">推导 ›</span></button>
          <button class="concl-bar" @click="openDrawer('shensha')"><span class="concl-k">神煞</span><span class="concl-v">{{ result.shensha.all.length ? [...new Set(result.shensha.all.map(a => a.hit.name))].join('、') : '无常用神煞命中' }}</span><span class="concl-go">释义 ›</span></button>
        </div>
        <p class="small">主页只留结论；全部推导（强弱四层、关系修正逐条、调候/格局判定、多寡双口径、神煞释义）在抽屉里逐项可验算。</p>
      </section>

      <section class="card">
        <h2>五行分布（藏干加权）</h2>
        <div class="wx-row" v-for="w in result.wuXing" :key="w.name">
          <span class="nm">{{ w.name }}</span>
          <div class="wx-bar"><div class="wx-fill" :style="{ width: (w.score / maxWx * 100) + '%', background: wxBarColor(w.name) }"></div></div>
          <span class="sc">{{ w.score.toFixed(1) }}</span>
        </div>
        <p class="meta">日主 {{ result.dayGan }}：强弱见下方「日主强弱推导」（量化模型，不再用粗判）</p>
      </section>


      <!-- 推导抽屉：结论条点开，桌面侧栏/移动全屏 -->
      <div v-if="drawerTab" class="drawer-mask" @click.self="closeDrawer">
        <div class="drawer">
          <div class="drawer-head">
            <div class="drawer-tabs">
              <button :class="{ on: drawerTab === 'strength' }" @click="drawerTab = 'strength'">强弱推导</button>
              <button :class="{ on: drawerTab === 'tiaohou' }" @click="drawerTab = 'tiaohou'">调候</button>
              <button :class="{ on: drawerTab === 'geju' }" @click="drawerTab = 'geju'">格局·多寡</button>
              <button :class="{ on: drawerTab === 'yongshen' }" @click="drawerTab = 'yongshen'">最终用神</button>
              <button :class="{ on: drawerTab === 'shensha' }" @click="drawerTab = 'shensha'">神煞释义</button>
            </div>
            <button class="drawer-close" @click="closeDrawer">✕</button>
          </div>
          <div class="drawer-body">
      <section v-if="drawerTab === 'strength'" class="strength-card">
        <h2>日主强弱推导 · {{ result.strength.grade }}</h2>
        <div class="l0">
          <span class="grade-badge">{{ result.strength.grade }}</span>
          <span>修正后 ratio <b>{{ result.strength.ratio.toFixed(4) }}</b></span>
          <span class="small">基础（不计关系）ratio {{ result.strength.baseRatio.toFixed(4) }} · {{ result.strength.baseGrade }}｜同党 {{ result.strength.support.toFixed(1) }} / 异党 {{ result.strength.drain.toFixed(1) }}（基础 {{ result.strength.baseSupport.toFixed(1) }} / {{ result.strength.baseDrain.toFixed(1) }}）｜关系修正 Δ同 {{ result.strength.deltaSupport >= 0 ? '+' : '' }}{{ result.strength.deltaSupport.toFixed(1) }} / Δ异 {{ result.strength.deltaDrain >= 0 ? '+' : '' }}{{ result.strength.deltaDrain.toFixed(1) }}</span>
          <span v-if="result.strength.crossGrade" class="suspect">⚠ 关系修正跨档：{{ result.strength.crossNote }}</span>
          <span class="small">强根：{{ result.strength.hasRoot ? '有（' + result.strength.rootNotes.join('、') + '）' : '无' }}</span>
          <span v-if="result.strength.gates.zhuan.suspect" class="suspect">专旺疑似（结构闸）</span>
          <span v-if="result.strength.gates.cong.suspect" class="suspect">疑似{{ result.strength.gates.cong.kind }}（结构闸）</span>
          <span v-if="result.strength.gates.ratioStrong" class="suspect">占比极高（≥0.88，极端占比提示）</span>
          <span v-if="result.strength.gates.ratioWeak" class="suspect">占比极低（≤0.12，极端占比提示）</span>
          <span v-if="result.strength.yinHint.triggered" class="suspect">⚠ {{ result.strength.yinHint.text }}</span>
        </div>
        <p class="small">口径：量化打分派 · tianzhi-core 连乘权重（MIT）。点开每层可逐行验算；专旺/从格只标疑似，不自动反转喜忌。</p>

        <div class="factor-list">
          <div v-for="f in result.strength.factors" :key="f.key" class="factor">
            <button class="factor-head" @click="toggleFactor(f.key)">
              <span class="f-name">{{ f.name }}</span>
              <span class="f-score">同 {{ f.ally.toFixed(1) }}<span v-if="f.enemy"> / 异 {{ f.enemy.toFixed(1) }}</span><span v-if="Math.abs(f.ally - f.allyBase) > 0.01 || Math.abs(f.enemy - f.enemyBase) > 0.01" class="adj-mark">（含关系修正，基础 同 {{ f.allyBase.toFixed(1) }} / 异 {{ f.enemyBase.toFixed(1) }}）</span></span>
              <span class="f-toggle">{{ openFactors.has(f.key) ? '收起' : '展开' }}</span>
            </button>
            <div class="f-text">{{ f.text }}</div>
            <div v-if="openFactors.has(f.key) && f.key === 'deling'" class="deling-detail">
              <table class="state-table">
                <thead><tr><th>五行</th><th>月令状态</th><th>与日主</th><th>加权分</th><th>占比</th><th>个数 主(附)</th><th>十神对</th></tr></thead>
                <tbody>
                  <tr v-for="row in result.strength.monthState" :key="row.wuxing">
                    <td><b :style="{ color: wxBarColor(row.wuxing) }">{{ row.wuxing }}</b></td>
                    <td><span class="status-chip" :style="statusStyle(row.status)">{{ row.status }}</span></td>
                    <td>{{ row.relationToDM }}</td>
                    <td>{{ row.weighted.toFixed(1) }}</td>
                    <td>{{ (row.share * 100).toFixed(1) }}%</td>
                    <td>{{ row.counts.main }}({{ row.counts.hidden }})</td>
                    <td class="small">{{ row.tenGodPair[0] }} {{ row.tenGodPair[1] }} / {{ row.tenGodPair[2] }} {{ row.tenGodPair[3] }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="small">月令状态口径声明：状态为季节标签，不计分；月令得分来自月支成分 ×2.0，见逐成分明细。辰戌丑未月按四季土旺入表；司令分野另见下行。</p>
              <div class="wx-chart">
                <svg viewBox="0 0 500 500" class="wx-svg" role="img" aria-label="五行旺衰圆图">
                  <circle cx="250" cy="250" r="238" class="wx-bg" />
                  <line :x1="divideP1.x" :y1="divideP1.y" x2="250" y2="250" class="wx-divide" />
                  <line x1="250" y1="250" :x2="divideP2.x" :y2="divideP2.y" class="wx-divide" />
                  <text :x="allyLabel.x" :y="allyLabel.y" text-anchor="middle" class="wx-camp ally">同党·我方</text>
                  <text :x="enemyLabel.x" :y="enemyLabel.y" text-anchor="middle" class="wx-camp enemy">异党·敌方</text>
                  <g v-for="it in circleItems" :key="it.row.wuxing" class="wx-node" @click="wxFilter = wxFilter === it.row.wuxing ? null : it.row.wuxing; showL2 = true">
                    <text :x="it.namePt.x" :y="it.namePt.y" text-anchor="middle" class="wx-name" :fill="wxBarColor(it.row.wuxing)">{{ it.row.wuxing }}{{ it.isDay ? '·日主' : '' }}</text>
                    <text :x="it.statPt.x" :y="it.statPt.y" text-anchor="middle" class="wx-stat">{{ it.row.weighted.toFixed(1) }}分 · {{ it.row.status }} · {{ it.row.counts.main }}({{ it.row.counts.hidden }})</text>
                    <text :x="it.godPt.x" :y="it.godPt.y" text-anchor="middle" class="wx-god">{{ it.row.tenGodPair[0] }}{{ it.row.tenGodPair[1] }} {{ it.row.tenGodPair[2] }}{{ it.row.tenGodPair[3] }}</text>
                  </g>
                  <text x="250" y="242" text-anchor="middle" class="wx-center">{{ result.dayGan }}日主</text>
                  <text x="250" y="268" text-anchor="middle" class="wx-center-sub">{{ result.strength.grade }} · {{ result.strength.ratio.toFixed(3) }}</text>
                </svg>
                <div class="wx-bars">
                  <div v-for="e in result.strength.elementPower" :key="e.wuxing" class="wx-row">
                    <span class="nm">{{ e.wuxing }}</span>
                    <div class="wx-bar"><div class="wx-fill" :style="{ width: (e.weighted / maxElem * 100) + '%', background: wxBarColor(e.wuxing) }"></div></div>
                    <span class="sc">{{ e.weighted.toFixed(1) }}</span>
                  </div>
                  <p class="small">圆图点任意五行 → 下方逐成分按该五行过滤。主数=加权分，副数=个数（主气/附属气）。</p>
                </div>
              </div>
              <p class="meta">司令与长生：{{ result.strength.deling.silingGan ? `司令 ${result.strength.deling.silingGan}（${result.strength.deling.silingTenGod}，节后约 ${result.strength.deling.daysAfterJie?.toFixed(1)} 天，仅展示未加权）` : '司令：直接输入无节气日数，未算' }}；日主在月支十二长生：{{ result.strength.deling.dmChangSheng }}；得令徽标：{{ result.strength.deling.badge }}</p>
            </div>
            <div v-else-if="openFactors.has(f.key)" class="f-items small">成分：{{ f.items.join('、') }}（到 L2 逐行验算）</div>
          </div>
        </div>

        <button class="btn sub" @click="showL2 = !showL2">{{ showL2 ? '收起' : '展开' }} L2 逐成分明细（可验算）</button>
        <div v-if="showL2" class="scroll-x">
          <div class="chip-row"><button class="chip" :class="{ on: !wxFilter }" @click="wxFilter = null">全部</button><button v-for="w in ['木','火','土','金','水']" :key="w" class="chip" :class="{ on: wxFilter === w }" @click="wxFilter = w">{{ w }}</button></div>
          <table class="contrib-table">
            <thead><tr><th>柱</th><th>成分</th><th>十神</th><th>阵营</th><th>基础分</th><th>权重连乘</th><th>加权分</th><th>修正后</th></tr></thead>
            <tbody>
              <tr v-for="c in result.strength.contributions.filter(c => !wxFilter || c.wuxing === wxFilter)" :key="c.id">
                <td>{{ c.pillar }}</td><td>{{ c.source }}</td><td>{{ c.tenGod }}</td>
                <td :class="c.camp === '同党' ? 'ally' : 'enemy'">{{ c.camp }}</td>
                <td>{{ c.base }}</td>
                <td class="small">{{ c.multipliers.map(m => m.label).join(' × ') }}</td>
                <td><b>{{ c.weighted.toFixed(2) }}</b></td>
                <td><b v-if="Math.abs(c.adjustedWeighted - c.weighted) > 0.005" class="adj-mark">{{ c.adjustedWeighted.toFixed(2) }}</b><span v-else class="small">=</span></td>
              </tr>
            </tbody>
          </table>
          <p class="small">验算：加权分 = 基础分 × 各权重；「修正后」为关系修正逐条作用后的值（阵营按修正后计）。基础 同 {{ result.strength.baseSupport.toFixed(3) }} / 异 {{ result.strength.baseDrain.toFixed(3) }} → 修正后 {{ result.strength.support.toFixed(3) }} / {{ result.strength.drain.toFixed(3) }}。</p>
        </div>

        <button class="btn sub" @click="showL3 = !showL3">{{ showL3 ? '收起' : '展开' }} L3 关系修正（逐条可展开验算）</button>
        <div v-if="showL3">
          <p class="small">修正作用于已有成分的分值（倍率缩放/阵营转移），不新造分数。封顶：单条 |Δ|≤18、总修正≤基础总分20%（18–32）、单成分累计倍率 0.45–1.45。档位以修正后为准，基础值保留对照。</p>
          <div v-if="result.strength.adjustments.length" class="adj-list">
            <div v-for="(a, i) in result.strength.adjustments" :key="i" class="adj" :class="{ cross: a.crossGrade }">
              <button class="adj-head" @click="toggleAdj(i)"><b>{{ a.crossGrade ? '★' : '' }}{{ a.relation }}</b><span class="small">{{ a.type }} · {{ a.verdict }} · Δ同 {{ a.deltaSupport >= 0 ? '+' : '' }}{{ a.deltaSupport.toFixed(1) }} / Δ异 {{ a.deltaDrain >= 0 ? '+' : '' }}{{ a.deltaDrain.toFixed(1) }}<span v-if="a.capped">（已封顶）</span><span v-if="a.crossGrade"> · 本条跨档</span></span><span class="f-toggle">{{ openAdj.has(i) ? '收起' : '判定与加减' }}</span></button>
              <div v-if="openAdj.has(i)" class="adj-detail small">
                <div>涉及：{{ a.participants.join(' · ') }}</div>
                <div v-for="(c, ci) in a.conditions" :key="ci">{{ c.met ? '☑' : '☐' }} {{ c.label }}</div>
                <div class="adj-note">{{ a.note }}</div>
                <div v-for="(af, ai) in a.affects" :key="ai" class="adj-aff">{{ af.source }}：{{ af.before.toFixed(2) }} → {{ af.after.toFixed(2) }}（{{ af.delta >= 0 ? '+' : '' }}{{ af.delta.toFixed(2) }}）</div>
                <div v-if="!a.affects.length" class="small">本条无分值作用（仅提示）。</div>
              </div>
            </div>
          </div>
          <p v-else class="small">无三会/三合/六合/天干合/冲/刑/害关系。</p>
          <div class="gate-box">
            <div class="gate-title">从格门槛（结构闸）</div>
            <div v-for="(c, i) in result.strength.gates.cong.conditions" :key="'c'+i" class="gate-row">{{ c.met ? '☑' : '☐' }} {{ c.label }}</div>
            <div class="gate-title">专旺门槛（结构闸）</div>
            <div v-for="(c, i) in result.strength.gates.zhuan.conditions" :key="'z'+i" class="gate-row">{{ c.met ? '☑' : '☐' }} {{ c.label }}</div>
            <p class="small">两闸全过才标「疑似」，仍需人工复核，不自动改判喜忌。极端占比提示：ratio ≥0.88 / ≤0.12 只作提示，不构成判定（本站 69 例金标准上专旺极端占比 1/16、从格 0/2，判别力不足）。</p>
          </div>
        </div>
        <p class="trace small">{{ result.strength.trace }} 算法来源：zaoxu001/tianzhi-core（MIT）连乘模型 TS 移植，权重原样：基础 天干10/地支12、根气 本1.0/中0.5/余0.3、纯气×1.6、月令×2.0、贴身×1.2、虚透×0.5。关系修正为本站工程口径（化气严条件、冲定向削根、刑害只削本气、封顶防翻盘），系数逐条见 L3，不冒充古籍原值。天干合化转营已收紧：仅化神当令（月支同气）才全转营，否则只合绊（P1，2026-10-04）。五档阈值 0.26/0.35/0.48/0.61 与连乘权重本轮明确未动。</p>
      </section>


      <section v-if="drawerTab === 'tiaohou'" class="stage-panel">
        <h3>调候判定</h3>
        <p><b>{{ result.tiaohou.climate }}</b>（{{ result.tiaohou.season }}）</p>
        <p class="small">{{ result.tiaohou.tableText }}</p>
        <div v-for="(c, i) in result.tiaohou.checks" :key="i" class="gate-row">{{ c.met ? '☑' : '☐' }} {{ c.label }}<span v-if="c.note" class="small"> · {{ c.note }}</span></div>
        <p class="small">口径：《穷通宝鉴》十干×十二月 120 格逐格查表（tianzhi-core 核对版数据，MIT）+ 病药剔除——全盘最旺五行为病，古表用神正为病者剔除，全剔保留首用兜底；气候定性仅作季节标签。调候为独立一路进最终用神汇合，不计入强弱分。</p>
      </section>
      <section v-if="drawerTab === 'geju'" class="stage-panel">
        <h3>格局判定</h3>
        <p><b>{{ result.geju.name }}</b> · {{ result.geju.basis }}</p>
        <p class="small">{{ result.geju.touText }}；{{ result.geju.yongfa }}</p>
        <div v-for="(c, i) in result.geju.checks" :key="i" class="gate-row">{{ c.met ? '☑' : '☐' }} {{ c.label }}<span v-if="c.note" class="small"> · {{ c.note }}</span></div>
        <p v-if="result.geju.suspectNote" class="suspect">{{ result.geju.suspectNote }}</p>
        <p class="small">口径：《子平真诠》月令取格——月支本气十神为格、透干为引线，建禄/羊刃另列；成破只列条件，不硬断成败。</p>
        <h3>命局多寡（双口径）</h3>
        <table class="state-table"><thead><tr><th>五行</th><th>与日主</th><th>加权分</th><th>占比</th><th>个数</th><th>判读</th></tr></thead>
        <tbody><tr v-for="d in result.duogua" :key="d.wuxing"><td><b :style="{ color: wxBarColor(d.wuxing) }">{{ d.wuxing }}</b></td><td>{{ d.relation }}</td><td>{{ d.weighted.toFixed(1) }}</td><td>{{ (d.share * 100).toFixed(1) }}%</td><td>{{ d.count }}</td><td>{{ d.level }}</td></tr></tbody></table>
        <p class="small">加权分与强弱同源（连乘权重），个数为干支字数口径；缺/弱/旺仅描述分布，不单独断吉凶。</p>
      </section>
      <section v-if="drawerTab === 'yongshen'" class="stage-panel">
        <h3>最终用神 · 三路汇合</h3>
        <div v-for="r in result.yongshen.routes" :key="r.name" class="route-box"><b>{{ r.name }}</b>：喜 {{ r.xi.join('、') || '—' }}<span v-if="r.ji.length"> · 忌 {{ r.ji.join('、') }}</span><div class="small">{{ r.text }}</div></div>
        <p><b>{{ result.yongshen.finalText }}</b></p>
        <p class="small">优先级口径：{{ result.yongshen.priorityText }}</p>
        <p v-if="result.yongshen.conflictText" class="suspect">{{ result.yongshen.conflictText }}</p>
        <p class="small">三路来源：扶抑（强弱扶抑）、调候（穷通气候）、格局（子平顺用/逆用）。每路贡献如上可追溯；均为候选，需结合大运流年复核。</p>
      </section>
      <section v-if="drawerTab === 'shensha'" class="stage-panel">
        <h3>神煞释义（传统说法，中性表述）</h3>
        <div v-for="(a, i) in result.shensha.all" :key="i" class="sha-row"><b>{{ a.hit.name }}</b>（{{ ['年柱','月柱','日柱','时柱'][PILLAR_KEYS.indexOf(a.pillar)] }}）<div>{{ a.hit.meaning }}</div><div class="small">{{ a.hit.now }} · 起法：{{ a.hit.method }}</div></div>
        <p v-if="result.pillars.some(pp => pp.xunKong.includes(pp.zhi))" class="small">另有空亡位见命盘明细空亡行。</p>
        <p class="small">神煞据《三命通会》通行口诀自建查表：天乙/文昌/禄/羊刃/金舆/学堂按日干起，三合桃花/驿马/华盖/将星/劫煞/亡神/灾煞按年支·日支起，天德/月德按月支起，红鸾/天喜/孤辰/寡宿按年支起，词馆/魁罡按干支对。只展示释义，不计入强弱分，不作吉凶断言。</p>
      </section>
          </div>
        </div>
      </div>
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
                <span :style="ganStyle(dy.gan)">{{ dy.gan }}</span>
                <span :style="zhiStyle(dy.zhi)">{{ dy.zhi }}</span>
              </div>
              <div class="dy-ss">{{ dy.shiShenGan }} · {{ dy.shiShenZhiMain }}</div>
              <div class="hide-wrap light dy-hide">
                <div v-for="(hg, i) in dy.hideGan" :key="i" class="hide-item">
                  <div class="hide-gan" :style="hideStyle(hg)">{{ hg }}</div>
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
              <span :style="ganStyle(ln.gan)">{{ ln.gan }}</span>
              <span :style="zhiStyle(ln.zhi)">{{ ln.zhi }}</span>
            </div>
            <div class="ln-ss">{{ ln.shiShenGan }} · {{ ln.shiShenZhiMain }}</div>
            <div class="hide-wrap light ln-hide">
              <div v-for="(hg, i) in ln.hideGan" :key="i" class="hide-item">
                <div class="hide-gan" :style="hideStyle(hg)">{{ hg }}</div>
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
      <div v-if="result">神煞口径：据《三命通会》通行口诀自建查表（lunar 1.7.7 无神煞接口），只展示释义、不计强弱分；调候按《穷通宝鉴》十干十二月 120 格查表（tianzhi-core MIT 数据）+病药剔除，格局按《子平真诠》月令取格，用神三路汇合冲突注明。</div>
      <div>本站所有计算均在您的浏览器本地完成，不上传任何数据。</div>
      <div>仅供传统文化研究与娱乐参考，不构成任何决策依据。</div>
    </footer>
  </div>
</template>
