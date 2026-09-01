const chartState = {
  students: [],
  classrooms: [],
  schoolYear: "",
  today: "",
  classMetric: "weeklyDistance",
  schoolRange: "30",
  primaryClass: "",
  comparisonClasses: [],
};

const CLASS_METRICS = Object.freeze({
  weeklyDistance: {
    label: "本週閱讀里數",
    unit: "里",
    decimals: 0,
    note: "由本週星期一至今日的閱讀里數。",
    value: (row) => row.weeklyDistance,
  },
  averageDistance: {
    label: "人均里數",
    unit: "里／人",
    decimals: 1,
    note: "本學年累積里數 ÷ 班內學生人數。",
    value: (row) => row.students ? row.totalDistance / row.students : 0,
  },
  books: {
    label: "閱讀本數",
    unit: "本",
    decimals: 0,
    note: "本學年累積閱讀本數。",
    value: (row) => row.totalBooks,
  },
  activeRate: {
    label: "活躍學生比例",
    unit: "%",
    decimals: 0,
    note: "最近 7 日內有閱讀紀錄的學生比例。",
    value: (row) => row.students ? (row.active7 / row.students) * 100 : 0,
  },
  inactive14: {
    label: "14日未提交人數",
    unit: "人",
    decimals: 0,
    note: "本學年已開始至少 14 日後，仍未開始閱讀，或最近一次閱讀已超過 14 日的學生。數值愈高愈需要跟進。",
    value: (row) => row.inactive14,
  },
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

setupControls();
window.addEventListener("readingrun:librarian-data", (event) => {
  const detail = event.detail || {};
  chartState.students = Array.isArray(detail.students) ? detail.students : [];
  chartState.classrooms = Array.isArray(detail.classrooms) ? detail.classrooms : [];
  chartState.schoolYear = String(detail.schoolYear || "");
  chartState.today = validDateKey(detail.today) ? detail.today : hongKongDateKey();
  ensureClassSelections();
  renderAll();
});

function setupControls() {
  $("#classMetricSelect")?.addEventListener("change", (event) => {
    chartState.classMetric = CLASS_METRICS[event.target.value] ? event.target.value : "weeklyDistance";
    renderClassPerformance();
  });

  $$("[data-school-trend-range]").forEach((button) => {
    button.addEventListener("click", () => {
      chartState.schoolRange = String(button.dataset.schoolTrendRange || "30");
      $$("[data-school-trend-range]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      renderSchoolTrend();
      renderClassTrend();
    });
  });

  $("#classTrendPrimary")?.addEventListener("change", (event) => {
    chartState.primaryClass = String(event.target.value || "");
    chartState.comparisonClasses = chartState.comparisonClasses.filter((id) => id !== chartState.primaryClass);
    renderComparisonControls();
    renderClassTrend();
  });

  $("#classTrendAddComparison")?.addEventListener("click", () => {
    const available = classIds().filter((id) => id !== chartState.primaryClass && !chartState.comparisonClasses.includes(id));
    if (!available.length || chartState.comparisonClasses.length >= 2) return;
    chartState.comparisonClasses.push(available[0]);
    renderComparisonControls();
    renderClassTrend();
  });
}

function ensureClassSelections() {
  const ids = classIds();
  const primary = $("#classTrendPrimary");
  if (primary) {
    const current = ids.includes(chartState.primaryClass) ? chartState.primaryClass : firstClassWithData(ids) || ids[0] || "";
    chartState.primaryClass = current;
    primary.replaceChildren(...ids.map((id) => option(id, roomName(id), id === current)));
  }
  chartState.comparisonClasses = chartState.comparisonClasses.filter((id) => ids.includes(id) && id !== chartState.primaryClass).slice(0, 2);
  renderComparisonControls();
}

function renderAll() {
  renderClassPerformance();
  renderSchoolTrend();
  renderClassTrend();
}

function renderClassPerformance() {
  const host = $("#classPerformanceChart");
  const note = $("#classPerformanceNote");
  if (!host) return;
  const metric = CLASS_METRICS[chartState.classMetric] || CLASS_METRICS.weeklyDistance;
  if (note) note.textContent = metric.note;

  const rows = classRows()
    .map((row) => ({ ...row, metricValue: finite(metric.value(row)) }))
    .sort((a, b) => b.metricValue - a.metricValue || roomName(a.classId).localeCompare(roomName(b.classId), "zh-Hant", { numeric: true }));
  const max = Math.max(1, ...rows.map((row) => row.metricValue));

  if (!rows.length) return empty(host, "未有班級資料。");
  host.replaceChildren(...rows.map((row, index) => {
    const article = document.createElement("article");
    article.className = "analytics-bar-row";
    article.innerHTML = `
      <div class="analytics-bar-rank">${index + 1}</div>
      <div class="analytics-bar-label"><strong>${escapeHtml(roomName(row.classId))}</strong><small>${row.students} 人</small></div>
      <div class="analytics-bar-track" role="img" aria-label="${escapeHtml(roomName(row.classId))} ${escapeHtml(metric.label)} ${escapeHtml(formatMetric(row.metricValue, metric))}">
        <span class="analytics-bar-fill" style="width:${Math.max(0, Math.min(100, (row.metricValue / max) * 100)).toFixed(2)}%"></span>
      </div>
      <div class="analytics-bar-value">${escapeHtml(formatMetric(row.metricValue, metric))}</div>`;
    return article;
  }));
}

function renderSchoolTrend() {
  const host = $("#schoolTrendChart");
  const summary = $("#schoolTrendSummary");
  if (!host) return;
  const dates = rangeDates(chartState.schoolRange);
  const daily = aggregateDailyDistance(chartState.students);
  const values = dates.map((date) => finite(daily[date]));
  const weeklyAverage = currentWeekAverage(daily);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (summary) summary.textContent = `${rangeLabel(chartState.schoolRange)}合共 ${number(total)} 里｜本週平均 ${formatNumber(weeklyAverage, 1)} 里／日`;
  drawLineChart(host, {
    dates,
    series: [{ label: "全校閱讀里數", values }],
    average: weeklyAverage,
    averageLabel: `本週平均 ${formatNumber(weeklyAverage, 1)} 里／日`,
    yUnit: "里",
    emptyMessage: "尚未有每日趨勢資料；新提交紀錄會自動加入走勢。",
  });
}

function renderClassTrend() {
  const host = $("#classTrendChart");
  const summary = $("#classTrendSummary");
  if (!host) return;
  const selected = [chartState.primaryClass, ...chartState.comparisonClasses].filter(Boolean).slice(0, 3);
  const dates = rangeDates(chartState.schoolRange);
  const series = selected.map((classId) => {
    const classStudents = chartState.students.filter((student) => student.classId === classId);
    const daily = aggregateDailyDistance(classStudents);
    return { label: roomName(classId), values: dates.map((date) => finite(daily[date])) };
  });
  if (summary) summary.textContent = selected.length
    ? `${rangeLabel(chartState.schoolRange)}｜${selected.map(roomName).join("、")}`
    : "請選擇班別。";
  drawLineChart(host, {
    dates,
    series,
    yUnit: "里",
    emptyMessage: "這些班別暫未有每日趨勢資料。",
  });
}

function renderComparisonControls() {
  const host = $("#classTrendComparisons");
  const addButton = $("#classTrendAddComparison");
  if (!host) return;
  const ids = classIds();
  host.replaceChildren(...chartState.comparisonClasses.map((classId, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "analytics-compare-control";
    const span = document.createElement("span");
    span.textContent = `對比 ${index + 1}`;
    const select = document.createElement("select");
    const available = ids.filter((id) => id === classId || (id !== chartState.primaryClass && !chartState.comparisonClasses.includes(id)));
    select.replaceChildren(...available.map((id) => option(id, roomName(id), id === classId)));
    select.addEventListener("change", () => {
      chartState.comparisonClasses[index] = select.value;
      renderComparisonControls();
      renderClassTrend();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "analytics-remove-compare";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      chartState.comparisonClasses.splice(index, 1);
      renderComparisonControls();
      renderClassTrend();
    });
    wrapper.append(span, select, remove);
    return wrapper;
  }));
  if (addButton) {
    const availableCount = ids.filter((id) => id !== chartState.primaryClass && !chartState.comparisonClasses.includes(id)).length;
    addButton.disabled = chartState.comparisonClasses.length >= 2 || availableCount === 0;
    addButton.textContent = chartState.comparisonClasses.length >= 2 ? "最多比較 3 班" : "+ 加入比較";
  }
}

function drawLineChart(host, options) {
  const dates = options.dates || [];
  const series = options.series || [];
  const allValues = series.flatMap((item) => item.values || []);
  const hasData = allValues.some((value) => value > 0);
  if (!dates.length || !series.length) return empty(host, options.emptyMessage || "未有資料。");

  const width = 1000;
  const height = 360;
  const margin = { top: 28, right: 28, bottom: 58, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...allValues, finite(options.average));
  const yMax = niceCeiling(maxValue);
  const x = (index) => margin.left + (dates.length === 1 ? plotWidth / 2 : (index / (dates.length - 1)) * plotWidth);
  const y = (value) => margin.top + plotHeight - (finite(value) / yMax) * plotHeight;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "閱讀里數走勢圖");
  svg.classList.add("analytics-svg");

  for (let step = 0; step <= 4; step += 1) {
    const value = (yMax / 4) * step;
    const yPos = y(value);
    svg.append(svgLine(ns, margin.left, yPos, width - margin.right, yPos, "analytics-grid-line"));
    svg.append(svgText(ns, margin.left - 12, yPos + 5, number(Math.round(value)), "analytics-axis-label", "end"));
  }
  svg.append(svgText(ns, 18, margin.top + plotHeight / 2, options.yUnit || "", "analytics-y-unit", "middle", -90));

  tickIndexes(dates.length, 6).forEach((index) => {
    const xPos = x(index);
    svg.append(svgText(ns, xPos, height - 22, shortDate(dates[index]), "analytics-axis-label", "middle"));
  });

  if (Number.isFinite(options.average) && options.average >= 0) {
    const avgY = y(options.average);
    const line = svgLine(ns, margin.left, avgY, width - margin.right, avgY, "analytics-average-line");
    svg.append(line);
    svg.append(svgText(ns, width - margin.right, Math.max(16, avgY - 8), options.averageLabel || "平均", "analytics-average-label", "end"));
  }

  series.forEach((item, seriesIndex) => {
    const points = item.values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
    const polyline = document.createElementNS(ns, "polyline");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", `analytics-series analytics-series-${seriesIndex + 1}`);
    svg.append(polyline);
    item.values.forEach((value, index) => {
      if (dates.length > 45 && value === 0) return;
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", x(index));
      circle.setAttribute("cy", y(value));
      circle.setAttribute("r", dates.length > 45 ? "2.6" : "4");
      circle.setAttribute("class", `analytics-point analytics-series-${seriesIndex + 1}`);
      const title = document.createElementNS(ns, "title");
      title.textContent = `${item.label}｜${dates[index]}｜${number(value)} ${options.yUnit || ""}`;
      circle.append(title);
      svg.append(circle);
    });
  });

  const legend = document.createElement("div");
  legend.className = "analytics-legend";
  series.forEach((item, index) => {
    const entry = document.createElement("span");
    entry.innerHTML = `<i class="analytics-legend-swatch analytics-series-${index + 1}"></i>${escapeHtml(item.label)}`;
    legend.append(entry);
  });

  const viewport = document.createElement("div");
  viewport.className = "analytics-chart-viewport";
  viewport.append(svg);
  host.replaceChildren(viewport, legend);
  if (!hasData) {
    const hint = document.createElement("p");
    hint.className = "analytics-chart-hint";
    hint.textContent = options.emptyMessage || "暫未有非零數據。";
    host.append(hint);
  }
}

function classRows() {
  const weekDates = currentWeekDates();
  return classIds().map((classId) => {
    const students = chartState.students.filter((student) => student.classId === classId);
    const totalBooks = students.reduce((sum, student) => sum + finite(student.booksCount), 0);
    const totalDistance = students.reduce((sum, student) => sum + finite(student.distance), 0);
    const weeklyDistance = students.reduce((sum, student) => {
      const map = student.dailyDistanceByDate || {};
      return sum + weekDates.reduce((weekSum, date) => weekSum + finite(map[date]), 0);
    }, 0);
    const active7 = students.filter((student) => {
      const days = daysSince(student.lastReadingDate);
      return days !== null && days <= 7;
    }).length;
    const inactive14 = students.filter((student) => {
      const days = daysSince(student.lastReadingDate);
      return days === null ? schoolYearAgeDays() >= 14 : days >= 14;
    }).length;
    return { classId, students: students.length, totalBooks, totalDistance, weeklyDistance, active7, inactive14 };
  });
}

function aggregateDailyDistance(students) {
  const totals = {};
  students.forEach((student) => {
    Object.entries(student.dailyDistanceByDate || {}).forEach(([date, value]) => {
      if (!validDateKey(date)) return;
      totals[date] = finite(totals[date]) + finite(value);
    });
  });
  return totals;
}

function currentWeekAverage(daily) {
  const dates = currentWeekDates();
  if (!dates.length) return 0;
  return dates.reduce((sum, date) => sum + finite(daily[date]), 0) / dates.length;
}

function currentWeekDates() {
  const today = parseDateKey(chartState.today || hongKongDateKey());
  if (!today) return [];
  const weekday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - weekday * 86400000);
  const start = laterDate(monday, schoolYearStart());
  return dateKeysBetween(start, today);
}

function rangeDates(range) {
  const today = parseDateKey(chartState.today || hongKongDateKey());
  if (!today) return [];
  let start;
  if (range === "year") start = schoolYearStart();
  else {
    const days = Math.max(1, Number(range) || 30);
    start = new Date(today.getTime() - (days - 1) * 86400000);
    start = laterDate(start, schoolYearStart());
  }
  return dateKeysBetween(start, today);
}

function schoolYearStart() {
  const match = /^(\d{4})-(\d{4})$/.exec(chartState.schoolYear);
  const year = match ? Number(match[1]) : parseDateKey(chartState.today || hongKongDateKey())?.getUTCFullYear() || new Date().getUTCFullYear();
  return new Date(Date.UTC(year, 8, 1));
}

function dateKeysBetween(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || start > end) return [];
  const keys = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) keys.push(toDateKey(new Date(time)));
  return keys;
}

function schoolYearAgeDays() {
  const today = parseDateKey(chartState.today || hongKongDateKey());
  const start = schoolYearStart();
  if (!today || today < start) return 0;
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
}

function daysSince(dateKey) {
  const date = parseDateKey(dateKey);
  const today = parseDateKey(chartState.today || hongKongDateKey());
  if (!date || !today) return null;
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
}

function classIds() {
  const configured = chartState.classrooms.map((room) => String(room.id || "")).filter(Boolean);
  const extras = [...new Set(chartState.students.map((student) => String(student.classId || "")).filter((id) => id && !configured.includes(id)))];
  return [...configured, ...extras].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function firstClassWithData(ids) {
  return ids.find((id) => chartState.students.some((student) => student.classId === id)) || "";
}

function roomName(classId) {
  return chartState.classrooms.find((room) => String(room.id) === String(classId))?.name || classId || "—";
}

function rangeLabel(range) {
  return range === "year" ? "本學年" : `${Number(range) || 30}日`;
}

function formatMetric(value, metric) {
  const text = formatNumber(value, metric.decimals);
  if (metric.unit === "%") return `${text}%`;
  return `${text} ${metric.unit}`;
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(finite(value));
}

function number(value) {
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 }).format(finite(value));
}

function niceCeiling(value) {
  if (value <= 10) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

function tickIndexes(length, maxTicks) {
  if (length <= 1) return [0];
  const count = Math.min(maxTicks, length);
  const indexes = new Set();
  for (let i = 0; i < count; i += 1) indexes.add(Math.round((i / (count - 1)) * (length - 1)));
  return [...indexes];
}

function shortDate(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return new Intl.DateTimeFormat("zh-HK", { timeZone: "UTC", month: "numeric", day: "numeric" }).format(date);
}

function hongKongDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDateKey(value) {
  return Boolean(parseDateKey(value));
}

function toDateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function laterDate(a, b) {
  return a > b ? a : b;
}

function finite(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function option(value, label, selected = false) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  item.selected = selected;
  return item;
}

function empty(host, message) {
  const p = document.createElement("p");
  p.className = "analytics-empty";
  p.textContent = message;
  host.replaceChildren(p);
}

function svgLine(ns, x1, y1, x2, y2, className) {
  const line = document.createElementNS(ns, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", className);
  return line;
}

function svgText(ns, x, y, text, className, anchor = "start", rotate = 0) {
  const node = document.createElementNS(ns, "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("text-anchor", anchor);
  node.setAttribute("class", className);
  if (rotate) node.setAttribute("transform", `rotate(${rotate} ${x} ${y})`);
  node.textContent = text;
  return node;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
