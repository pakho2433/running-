import { APP_CONFIG } from "./app-config.js";

const input = document.querySelector("#readingDate");
const backfillDays = Math.max(1, Number(APP_CONFIG.readingBackfillDays || 14));
const readingDateLimit = Math.max(1, Number(APP_CONFIG.readingDateBookLimit || 5));

if (input) {
  const today = schoolDateKey();
  let minimum = shiftDateKey(today, -(backfillDays - 1));
  const schoolStart = `${String(APP_CONFIG.schoolYear || "").slice(0, 4)}-09-01`;
  if (/^\d{4}-09-01$/u.test(schoolStart) && today >= schoolStart && minimum < schoolStart) {
    minimum = schoolStart;
  }
  input.min = minimum;
  input.max = today;
  if (!input.value || input.value < minimum || input.value > today) input.value = today;

  const label = input.closest("label")?.querySelector("span");
  if (label) label.textContent = `閱讀日期（可補填最近 ${backfillDays} 日）`;
}

// Defensive compatibility for any cached legacy UI message. Staging now has no
// actual-submission-day cap; only the selected reading date is limited to five.
const toastRegion = document.querySelector("#toastRegion");
if (toastRegion) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const text = node.textContent?.trim() || "";
        if (text === "今日已達 5 本上限。" || text.startsWith("已達提交限制：")) {
          node.textContent = `此閱讀日期已達 ${readingDateLimit} 本上限，請選擇其他閱讀日期。`;
        }
      }
    }
  });
  observer.observe(toastRegion, { childList: true });
}

function schoolDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateKey(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
