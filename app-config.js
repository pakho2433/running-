export const APP_CONFIG = {
  schoolName: "全校閱讀跑道",
  maxRunnersPerClass: 26,
  trackDistance: 15000,
  stageDistance: 1500,
  trackLocations: 10,
  legacyDistancePerBook: 100,
  scoring: {
    base: 10,
    readingType: 30,
    subject: 30,
    completion: 50,
  },
  classrooms: Array.from({ length: 17 }, (_, index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`,
    name: `課室 ${String(index + 1).padStart(2, "0")}`,
  })),
};
