(() => {
  const TEACHER_MODULE_VERSION = "20260709-password-login-2";

  const ready = () => {
    const loginForm = document.querySelector("#loginForm");
    if (!loginForm || document.querySelector("#teacherLoginStatic")) return;

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
      let modal = document.querySelector("#teacherCenterSecureModal");
      if (!modal) {
        await import(`./teacher-center-secure.js?v=${TEACHER_MODULE_VERSION}`);
        modal = await waitForModal();
      }
      const loginView = modal.querySelector(".teacher-login-view");
      const dashboard = modal.querySelector(".teacher-dashboard-view");
      loginView?.classList.remove("is-hidden");
      dashboard?.classList.add("is-hidden");
      modal.classList.remove("is-hidden");
      document.body.classList.add("teacher-center-open");
    } catch (error) {
      console.error("Teacher center failed to open", error);
      alert(`教師登入暫時未能載入：${error?.message || error}\n請按 Ctrl + F5 後再試。`);
    }
  }

  function waitForModal() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("#teacherCenterSecureModal");
      if (existing) return resolve(existing);
      let count = 0;
      const timer = setInterval(() => {
        const modal = document.querySelector("#teacherCenterSecureModal");
        if (modal) {
          clearInterval(timer);
          resolve(modal);
        } else if (++count >= 20) {
          clearInterval(timer);
          reject(new Error("TEACHER_CENTER_NOT_READY"));
        }
      }, 100);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
