const removeLegacyTeacherUi = () => {
  document.querySelectorAll(".teacher-center-entry:not(.teacher-center-entry-secure)").forEach((item) => item.remove());
  document.querySelector("#teacherCenterModal")?.remove();
  sessionStorage.removeItem("readingrun-teacher-session-v1");
  localStorage.removeItem("readingrun-teacher-attempts-v1");
};

new MutationObserver(removeLegacyTeacherUi).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
removeLegacyTeacherUi();
