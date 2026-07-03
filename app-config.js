export const APP_CONFIG = {
  schoolName: "全校閱讀跑道",
  maxRunnersPerClass: 26,
  distancePerBook: 100,
  classrooms: Array.from({ length: 17 }, (_, index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`,
    name: `課室 ${String(index + 1).padStart(2, "0")}`,
  })),
};
