const sidebar = document.querySelector(".sidebar");
const recentBookCard = document.querySelector(".recent-book-card");

if (sidebar && !document.querySelector("#readingBuddyButton")) {
  const panel = document.createElement("section");
  panel.className = "book-mascot-panel";
  panel.setAttribute("aria-label", "Reading Buddy 閱讀歷史");
  panel.innerHTML = `
    <button id="readingBuddyButton" class="reading-buddy-button" type="button" aria-haspopup="dialog" aria-controls="readingHistoryModal">
      <span>📚 READING BUDDY</span>
      <small>查看閱讀歷史</small>
    </button>
    <div class="book-mascot-stage" aria-hidden="true">
      <span class="book-sparkle one"></span>
      <span class="book-sparkle two"></span>
      <span class="book-sparkle three"></span>
      <span class="book-shadow"></span>
      <div class="book-character">
        <span class="book-pages"></span>
        <span class="book-page-flap"></span>
        <span class="book-arm left"></span>
        <span class="book-arm right"></span>
        <span class="book-leg left"></span>
        <span class="book-leg right"></span>
        <span class="book-cover"></span>
        <span class="book-face">
          <span class="book-eye left"></span>
          <span class="book-eye right"></span>
          <span class="book-cheek left"></span>
          <span class="book-cheek right"></span>
          <span class="book-mouth"></span>
        </span>
      </div>
    </div>
    <span class="book-mascot-bubble">按我查看以往讀過的書！</span>
  `;

  if (recentBookCard?.parentElement === sidebar) recentBookCard.after(panel);
  else sidebar.append(panel);
}

await import("./reading-history-secure.js?v=20260819-reading-buddy-restore-1");
