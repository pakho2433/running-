(() => {
  // 每次開啟或重新整理頁面都要求重新登入；閱讀進度仍保存在 Firebase。
  localStorage.removeItem("reading-run-session-v1");
})();
