# Reading Run｜3D 全校閱讀跑道

一個支援手機、平板及電腦的校園閱讀紀錄平台。學生用「課室 + 學生 ID」登入，每完成一本書便在 3D 跑道向前移動。教師可查看 17 個課室的即時人數、總距離，以及每班最多 26 名學生的跑步情況。

## 已完成

- 17 個可自訂名稱的課室
- 學生 ID 登入及自動記住登入資料
- 每班最多顯示 26 名 3D 跑步學生
- 輸入書名後，學生在跑道向前移動
- Firebase Firestore 跨裝置自動儲存
- 即時同步全校課室情況
- 斷線暫存，重新上線後自動補交
- 手機及桌面響應式介面
- GitHub Pages 自動部署工作流程

## 啟用跨裝置儲存（必做）

1. 到 Firebase Console 建立新專案。
2. 在 Project overview 新增一個 Web App，複製 Firebase configuration。
3. 開啟 `firebase-config.js`，把 `PASTE_YOUR_...` 全部換成自己的設定。
4. 到 **Authentication → Sign-in method**，啟用 **Anonymous**。
5. 到 **Firestore Database** 建立資料庫。
6. 安裝 Firebase CLI，登入後在本專案執行：

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

Firebase 設定完成後，同一學生在不同裝置選擇相同課室並輸入相同 ID，會讀取同一份進度。

> Firebase config 不是密碼，可以放在前端。資料存取安全由 `firestore.rules` 控制。

## 修改課室名稱

打開 `app-config.js`，把 `classrooms` 改成學校實際的 17 個班別。預設為「課室 01」至「課室 17」。

例如：

```js
classrooms: [
  { id: "1A", name: "一年級 A 班" },
  { id: "1B", name: "一年級 B 班" },
  // 共 17 個
]
```

## 預覽及部署

直接用本機伺服器開啟，不要以 `file://` 雙擊 HTML：

```bash
python -m http.server 8080
```

然後開啟 `http://localhost:8080`。

合併到 `main` 後，GitHub Actions 會部署 GitHub Pages。首次使用請到 repository **Settings → Pages → Source** 選擇 **GitHub Actions**。

## 資料結構

- `students/{classId}__{studentId}`：學生總進度
- `bookLogs/{eventId}`：每次提交的書名紀錄

## 目前安全限制

這個 MVP 按需求只使用學生 ID，屬於「身份識別」而不是密碼登入。為了讓同一 ID 能在不同裝置接續，以及讓全校總覽讀取各班進度，目前所有已匿名登入的使用者都能讀取學生進度。正式在學校大規模使用前，建議下一版加入教師帳戶、學生 PIN／學校 Google 帳戶及更嚴格的 Security Rules。
