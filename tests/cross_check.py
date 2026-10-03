#!/usr/bin/env python3
"""金标准交叉验证：lunar-python（6tail 同家族）独立排盘 + sxtwl（寿星天文历）节气/四柱校验。
生成 expected-python.json，并与前端 JS 引擎输出（dump-js.mjs 产出 js-results.json）逐字段 diff。
用法：
  python3 tests/cross_check.py gen     # 只生成金标准
  python3 tests/cross_check.py check   # 生成 + 与 JS 结果 diff + sxtwl 校验
"""
import json, math, sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / "tests/cases30.json").read_text())["cases"]

from lunar_python import Solar, Lunar

D2R = math.pi / 180
R2D = 180 / math.pi

def eot_seconds(y, m, d, h, mi, s):
    yy, mm = y, m
    if mm <= 2:
        yy -= 1; mm += 12
    A = yy // 100
    B = 2 - A + A // 4
    day_frac = (h + mi / 60 + s / 3600) / 24
    JD = math.floor(365.25 * (yy + 4716)) + math.floor(30.6001 * (mm + 1)) + d + B - 1524.5 + day_frac
    T = (JD - 2451545.0) / 36525
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    M = 357.52911 + T * (35999.05029 - T * 0.0001537)
    e = 0.016708634 - T * (0.000042037 + T * 0.0000001267)
    eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    omega = 125.04 - 1934.136 * T
    eps = eps0 + 0.00256 * math.cos(omega * D2R)
    y2 = math.tan((eps / 2) * D2R) ** 2
    L0r, Mr = L0 * D2R, M * D2R
    eq_min = 4 * R2D * (y2 * math.sin(2 * L0r) - 2 * e * math.sin(Mr) + 4 * e * y2 * math.sin(Mr) * math.cos(2 * L0r) - 0.5 * y2 * y2 * math.sin(4 * L0r) - 1.25 * e * e * math.sin(2 * Mr))
    return eq_min * 60

def fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def compute(inp):
    second = inp.get("second", 0)
    tz = inp.get("timeZoneOffset", 8)
    if inp["calendar"] == "solar":
        local = Solar.fromYmdHms(inp["year"], inp["month"], inp["day"], inp["hour"], inp["minute"], second)
    else:
        lunar_in = Lunar.fromYmdHms(inp["year"], inp["month"], inp["day"], inp["hour"], inp["minute"], second)
        local = lunar_in.getSolar()
    local_dt = datetime(local.getYear(), local.getMonth(), local.getDay(), local.getHour(), local.getMinute(), local.getSecond())
    utc_dt = local_dt - timedelta(hours=tz)
    beijing_dt = utc_dt + timedelta(hours=8)
    work_dt = beijing_dt
    offset = None
    if inp["useTrueSolarTime"]:
        eot = eot_seconds(utc_dt.year, utc_dt.month, utc_dt.day, utc_dt.hour, utc_dt.minute, utc_dt.second)
        offset = (inp["longitude"] - 120) * 240 + eot
        work_dt = beijing_dt + timedelta(seconds=round(offset))
    work = Solar.fromYmdHms(work_dt.year, work_dt.month, work_dt.day, work_dt.hour, work_dt.minute, work_dt.second)
    lunar = work.getLunar()
    ec = lunar.getEightChar()
    ec.setSect(inp["ziSect"])
    pillars = []
    for label, gz, hide, ssg, ssz, nayin, dishi, xk in [
        ("年柱", ec.getYear(), ec.getYearHideGan(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearNaYin(), ec.getYearDiShi(), ec.getYearXunKong()),
        ("月柱", ec.getMonth(), ec.getMonthHideGan(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthNaYin(), ec.getMonthDiShi(), ec.getMonthXunKong()),
        ("日柱", ec.getDay(), ec.getDayHideGan(), ec.getDayShiShenGan(), ec.getDayShiShenZhi(), ec.getDayNaYin(), ec.getDayDiShi(), ec.getDayXunKong()),
        ("时柱", ec.getTime(), ec.getTimeHideGan(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeNaYin(), ec.getTimeDiShi(), ec.getTimeXunKong()),
    ]:
        pillars.append({"label": label, "ganZhi": gz, "hideGan": list(hide), "shiShenGan": ssg, "shiShenZhi": list(ssz), "naYin": nayin, "diShi": dishi, "xunKong": xk})
    yun = ec.getYun(1 if inp["gender"] == "male" else 0, inp.get("daYunSect", 1))
    da_yun = []
    for i, d in enumerate(yun.getDaYun()):
        da_yun.append({"index": i, "ganZhi": "起运前" if i == 0 else d.getGanZhi(), "startYear": d.getStartYear(), "endYear": d.getEndYear(), "startAge": d.getStartAge(), "endAge": d.getEndAge()})
    prev_jie = lunar.getPrevJie()
    next_jie = lunar.getNextJie()
    return {
        "pillars": pillars,
        "taiYuan": f"{ec.getTaiYuan()}（{ec.getTaiYuanNaYin()}）",
        "mingGong": f"{ec.getMingGong()}（{ec.getMingGongNaYin()}）",
        "shenGong": f"{ec.getShenGong()}（{ec.getShenGongNaYin()}）",
        "prevJieQi": f"{prev_jie.getName()} {fmt(datetime(prev_jie.getSolar().getYear(), prev_jie.getSolar().getMonth(), prev_jie.getSolar().getDay(), prev_jie.getSolar().getHour(), prev_jie.getSolar().getMinute(), prev_jie.getSolar().getSecond()))}",
        "nextJieQi": f"{next_jie.getName()} {fmt(datetime(next_jie.getSolar().getYear(), next_jie.getSolar().getMonth(), next_jie.getSolar().getDay(), next_jie.getSolar().getHour(), next_jie.getSolar().getMinute(), next_jie.getSolar().getSecond()))}",
        "qiYunStartSolar": fmt(datetime(yun.getStartSolar().getYear(), yun.getStartSolar().getMonth(), yun.getStartSolar().getDay(), yun.getStartSolar().getHour(), yun.getStartSolar().getMinute(), yun.getStartSolar().getSecond())),
        "daYun": da_yun,
        "correctedText": fmt(work_dt),
        "trueSolarOffsetSeconds": offset,
    }

def sxtwl_checks(cases, expected):
    """sxtwl 寿星历校验：节气时刻（2024 立春）与非节气日四柱日干支"""
    notes = []
    ok = True
    try:
        import sxtwl
        GAN = "甲乙丙丁戊己庚辛壬癸"; ZHI = "子丑寅卯辰巳午未申酉戌亥"
        def gz(g): return GAN[g.tg] + ZHI[g.dz]
        # 立春 2024：sxtwl jqIndex 3
        lichun = None
        for j in sxtwl.getJieQiByYear(2024):
            if j.jqIndex == 3:
                t = sxtwl.JD2DD(j.jd)
                lichun = f"{t.Y}-{t.M:02d}-{t.D:02d} {int(t.h):02d}:{int(t.m):02d}:{t.s:04.1f}"
                break
        notes.append(f"sxtwl 2024立春 = {lichun}（lunar 家族 2024-02-04 16:27:07，差约 14 秒，见汇报）")
        # 基准命例日柱
        day = sxtwl.fromSolar(1990, 6, 15)
        sxtwl_pillars = f"{gz(day.getYearGZ())} {gz(day.getMonthGZ())} {gz(day.getDayGZ())} {gz(sxtwl.getShiGz(day.getDayGZ().tg, 14))}"
        notes.append(f"sxtwl 1990-06-15 14时四柱 = {sxtwl_pillars}")
        if sxtwl_pillars != "庚午 壬午 辛亥 乙未":
            ok = False
            notes.append("sxtwl 基准命例不一致！")
    except Exception as e:
        notes.append(f"sxtwl 不可用：{e}")
        return False, notes
    return ok, notes

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    expected = []
    for c in CASES:
        r = compute(c["input"])
        r["name"] = c["name"]
        expected.append(r)
    (ROOT / "tests/expected-python.json").write_text(json.dumps(expected, ensure_ascii=False, indent=1))
    print(f"金标准已生成：{len(expected)} 例 -> tests/expected-python.json")
    if mode == "gen":
        return 0
    js_path = ROOT / "tests/js-results.json"
    if not js_path.exists():
        print("缺少 tests/js-results.json，先跑 node tests/dump-js.mjs")
        return 2
    js = json.loads(js_path.read_text())
    fields = ["correctedText", "taiYuan", "mingGong", "shenGong", "prevJieQi", "nextJieQi", "qiYunStartSolar"]
    fails = 0
    for exp, got in zip(expected, js):
        diffs = []
        for i, (ep, gp) in enumerate(zip(exp["pillars"], got["pillars"])):
            for k in ["ganZhi", "hideGan", "shiShenGan", "shiShenZhi", "naYin", "diShi", "xunKong"]:
                if ep[k] != gp[k]:
                    diffs.append(f"柱{i}.{k}: py={ep[k]} js={gp[k]}")
        for k in fields:
            if exp[k] != got[k]:
                diffs.append(f"{k}: py={exp[k]} js={got[k]}")
        for ed, gd in zip(exp["daYun"], got["daYun"]):
            for k in ["ganZhi", "startYear", "endYear", "startAge", "endAge"]:
                if ed[k] != gd[k]:
                    diffs.append(f"daYun{ed['index']}.{k}: py={ed[k]} js={gd[k]}")
        # 偏移秒允许 1 秒舍入差
        eo, jo = exp["trueSolarOffsetSeconds"], got["trueSolarOffsetSeconds"]
        if (eo is None) != (jo is None) or (eo is not None and abs(eo - jo) > 1.5):
            diffs.append(f"offset: py={eo} js={jo}")
        status = "PASS" if not diffs else "FAIL"
        if diffs:
            fails += 1
        print(f"{status}  {exp['name']}  {' '.join(p['ganZhi'] for p in exp['pillars'])}")
        for d in diffs:
            print(f"      DIFF {d}")
    sx_ok, sx_notes = sxtwl_checks(CASES, expected)
    for n in sx_notes:
        print(f"SXTWL  {n}")
    print(f"\nJS vs lunar-python：{len(expected)-fails}/{len(expected)} 通过；sxtwl 校验：{'通过' if sx_ok else '未通过'}")
    return 0 if fails == 0 and sx_ok else 1

if __name__ == "__main__":
    sys.exit(main())
