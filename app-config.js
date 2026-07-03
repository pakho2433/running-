const CLASSROOM_NAMES = [
  "1A", "1B",
  "2A", "2B", "2C",
  "3A", "3B", "3C",
  "4A", "4B", "4C",
  "5A", "5B", "5C",
  "6A", "6B", "6C",
];

export const APP_CONFIG = {
  schoolName: "東華三院周演森小學-26/27悅讀千里號",
  maxRunnersPerClass: 26,
  trackDistance: 15000,
  stageDistance: 1500,
  trackLocations: 10,
  dailyBookLimit: 5,
  schoolTimeZone: "Asia/Hong_Kong",
  legacyDistancePerBook: 100,
  scoring: {
    base: 10,
    readingType: 30,
    subject: 30,
    completion: 50,
  },
  classrooms: CLASSROOM_NAMES.map((name, index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`,
    name,
  })),
};
