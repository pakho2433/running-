(() => {
  // Hardened authentication is handled by secure-ui-app.js.
  // This file now only adds a stable teacher-login entry on the cover page.
  const ready = () => {
    const loginCard = document.querySelector(".login-card");
    const loginForm = document.querySelector("#loginForm");
    if (!loginCard || !loginForm || document.querySelector("#teacherLoginStatic")) return;

    const button = document.createElement("button");
    button.id = "teacherLoginStatic";
    button.type = "button";
    button.className = "teacher-center-entry teacher-center-entry-login teacher-center-entry-secure";
    button.textContent = "👩‍🏫 教師登入";
    button.style.width = "100%";
    button.style.marginTop = "14px";
    button.addEventListener("click", openTeacherCenter);
    loginForm.insertAdjacentElement("afterend", button);
  };

  async function openTeacherCenter() {
    try {
      if (!document.querySelector("#teacherCenterSecureModal")) {
        await import("./teacher-center-secure.js?v=20260706-secure-login-4");
      }
      const modal = document.querySelector("#teacherCenterSecureModal");
      const loginView = modal?.querySelector(".teacher-login-view");
      const dashboard = modal?.querySelector(".teacher-dashboard-view");
      if (!modal) throw new Error("TEACHER_CENTER_NOT_READY");
      loginView?.classList.remove("is-hidden");
      dashboard?.classList.add("is-hidden");
      modal.classList.remove("is-hidden");
      document.body.classList.add("teacher-center-open");
    } catch (error) {
      console.error("Teacher center failed to open", error);
      alert("教師登入暫時未能載入，請重新整理後再試。");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
