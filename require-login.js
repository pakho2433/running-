(() => {
  window.READING_RUN_TEACHER_LOGIN_DISABLED = true;
  function removeTeacherLogin() {
    document.querySelectorAll("#teacherLoginStatic, .teacher-center-entry, .teacher-center-entry-secure, #teacherCenterSecureModal").forEach((el) => el.remove());
    document.body?.classList.remove("teacher-center-open");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeTeacherLogin);
  } else {
    removeTeacherLogin();
  }
  setInterval(removeTeacherLogin, 500);
})();
