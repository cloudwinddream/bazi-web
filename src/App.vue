<script setup lang="ts">
import { ref, computed } from 'vue'
import { calcBazi, CITIES, type BirthInput, type BaziResult } from './engine/bazi'

const form = ref({
  calendar: 'solar' as 'solar' | 'lunar',
  date: '1990-06-15',
  time: '14:30',
  gender: 'male' as 'male' | 'female',
  city: '北京',
  longitude: 116.40,
  useTrueSolarTime: true,
  ziSect: 1 as 1 | 2,
  lunarLeap: false,
})

const result = ref<BaziResult | null>(null)
const selectedDaYun = ref(2)
const errorMsg = ref('')

const WX_COLORS: Record<string, string> = { 木: 'var(--wx-mu)', 火: 'var(--wx-huo)', 土: 'var(--wx-tu)', 金: 'var(--wx-jin)', 水: 'var(--wx-shui)' }
const currentYear = new Date().getFullYear()

function onCityChange() {
  const c = CITIES.find((x) => x.name === form.value.city)
  if (c) form.value.longitude = c.lng
}

function run() {
  errorMsg.value = ''
  try {
    const [y, m, d] = form.value.date.split('-').map(Number)
    const [hh, mm] = form.value.time.split(':').map(Number)
    const month = form.value.calendar === 'lunar' && form.value.lunarLeap ? -m : m
    const input: BirthInput = {
      calendar: form.value.calendar, year: y, month, day: d,
      hour: hh, minute: mm, gender: form.value.gender,
      longitude: Number(form.value.longitude),
      useTrueSolarTime: form.value.useTrueSolarTime,
      ziSect: form.value.ziSect,
    }
    result.value = calcBazi(input)
    // 默认选中包含今年的大运
    const idx = result.value.daYun.findIndex((dy) => currentYear >= dy.startYear && currentYear <= dy.endYear)
    selectedDaYun.value = idx >= 0 ? idx : 1
  } catch (e: any) {
    errorMsg.value = '输入有误或日期超出支持范围，请检查后重试。'
    result.value = null
  }
}

const maxWx = computed(() => (result.value ? Math.max(...result.value.wuXing.map((w) => w.score), 1) : 1))
const activeDaYun = computed(() => (result.value ? result.value.daYun[selectedDaYun.value] : null))

run()
</script>

<template>
  <div class="wrap">
    <header class="top">
      <h1>云八字</h1>
      <p>纯前端排盘 · 本地计算 · 生辰不上传</p>
    </header>

    <section class="card">
      <h2>出生信息</h2>
      <div class="grid">
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
            <button :class="{ on: form.gender === 'male' }" @click="form.gender = 'male'">男</button>
            <button :class="{ on: form.gender === 'female' }" @click="form.gender = 'female'">女</button>
          </div>
        </div>
        <div class="field">
          <label>出生日期</label>
          <input type="date" v-model="form.date" min="1900-01-01" max="2100-12-31" />
        </div>
        <div class="field">
          <label>出生时间</label>
          <input type="time" v-model="form.time" />
        </div>
        <div class="field">
          <label>出生地（带出经度）</label>
          <select v-model="form.city" @change="onCityChange">
            <option v-for="c in CITIES" :key="c.name" :value="c.name">{{ c.name }}（{{ c.lng }}°E）</option>
          </select>
        </div>
        <div class="field">
          <label>经度（可手改）</label>
          <input type="number" step="0.01" v-model="form.longitude" />
        </div>
      </div>
      <div class="switches">
        <label><input type="checkbox" v-model="form.useTrueSolarTime" /> 真太阳时</label>
        <label v-if="form.calendar === 'lunar'"><input type="checkbox" v-model="form.lunarLeap" /> 闰月</label>
        <label>子时：
          <select v-model.number="form.ziSect">
            <option :value="1">晚子换日（23点）</option>
            <option :value="2">子时不换日</option>
          </select>
        </label>
      </div>
      <button class="btn" @click="run">排 盘</button>
      <p v-if="errorMsg" style="color: var(--red); font-size: 13px;">{{ errorMsg }}</p>
    </section>

    <template v-if="result">
      <section class="card">
        <h2>四柱命盘</h2>
        <p class="meta">
          公历 {{ result.solarText }}<span v-if="result.trueSolarOffsetMinutes !== null"> → 真太阳时 {{ result.correctedText }}（{{ result.trueSolarOffsetMinutes >= 0 ? '+' : '' }}{{ result.trueSolarOffsetMinutes }} 分钟）</span><br />
          农历 {{ result.lunarText }} · 日主 {{ result.dayGan }}（{{ result.dayMasterStrength }}）
        </p>
        <div class="scroll-x">
          <table class="pan">
            <thead>
              <tr><th></th><th v-for="p in result.pillars" :key="p.label" :class="{ 'day-highlight': p.label === '日柱' }">{{ p.label }}</th></tr>
            </thead>
            <tbody>
              <tr><th>干支</th><td v-for="p in result.pillars" :key="p.label" :class="{ 'day-highlight': p.label === '日柱' }"><span class="gz">{{ p.ganZhi }}</span></td></tr>
              <tr><th>十神</th><td v-for="p in result.pillars" :key="p.label">{{ p.label === '日柱' ? '日主' : p.shiShenGan }}</td></tr>
              <tr><th>藏干</th><td v-for="p in result.pillars" :key="p.label">{{ p.hideGan.join(' ') }}<br /><span class="small">{{ p.shiShenZhi.join(' · ') }}</span></td></tr>
              <tr><th>纳音</th><td v-for="p in result.pillars" :key="p.label">{{ p.naYin }}</td></tr>
              <tr><th>地势</th><td v-for="p in result.pillars" :key="p.label">{{ p.diShi }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>五行分布（藏干加权）</h2>
        <div class="wx-row" v-for="w in result.wuXing" :key="w.name">
          <span class="nm">{{ w.name }}</span>
          <div class="wx-bar"><div class="wx-fill" :style="{ width: (w.score / maxWx * 100) + '%', background: WX_COLORS[w.name] }"></div></div>
          <span class="sc">{{ w.score.toFixed(1) }}</span>
        </div>
        <p class="meta">日主 {{ result.dayGan }}：{{ result.dayMasterStrength }}（同党占比粗判，仅供参考）</p>
      </section>

      <section class="card">
        <h2>大运</h2>
        <p class="meta">{{ result.qiYunText }}</p>
        <div class="timeline">
          <div v-for="dy in result.daYun" :key="dy.index" class="dy" :class="{ on: selectedDaYun === dy.index }" @click="selectedDaYun = dy.index">
            <div class="gz2">{{ dy.ganZhi }}</div>
            <div class="yr">{{ dy.startYear }}–{{ dy.endYear }}<br />{{ dy.startAge }}–{{ dy.endAge }} 岁</div>
          </div>
        </div>
        <div v-if="activeDaYun" class="ln-grid">
          <div v-for="ln in activeDaYun.liuNian" :key="ln.year" class="ln" :class="{ cur: ln.year === currentYear }">
            {{ ln.year }}<br />{{ ln.ganZhi }} · {{ ln.age }}岁
          </div>
        </div>
      </section>
    </template>

    <footer>
      <div v-if="result">计算口径：{{ result.caliber.join('；') }}</div>
      <div>本站所有计算均在您的浏览器本地完成，不上传任何数据。</div>
      <div>仅供传统文化研究与娱乐参考，不构成任何决策依据。</div>
    </footer>
  </div>
</template>
