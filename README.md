# Reading Run｜3D 全校閱讀跑道

> [!IMPORTANT]
> 2026–2027 正式版已廢止 GitHub Pages、私人 Firebase project，以及用個人帳戶執行 `firebase login`／`firebase use` 的部署方法。網站只可由校方 GitHub Organization 的受保護分支，透過 OIDC/WIF 部署到校方 Firebase Hosting；Hosting、Firestore Rules/indexes 和 Functions 必須在同一個經測試的 release 發佈。校方設定及切換程序見 [`docs/SCHOOL_OWNERSHIP_AND_CUTOVER.md`](./docs/SCHOOL_OWNERSHIP_AND_CUTOVER.md)，日常部署見 [`docs/DEPLOYMENT_OPERATIONS.md`](./docs/DEPLOYMENT_OPERATIONS.md)。

一個支援手機、平板及電腦的校園閱讀紀錄平台。學生使用 Firebase Authentication 的獨立帳戶登入；教師以校方職員帳戶進入數據中心及分頁／串流匯出。閱讀提交只經 App Check 保護的 Cloud Functions，瀏覽器不可直接修改學生進度、排行榜或閱讀紀錄。

## 主要功能

- 17 個可自訂班別
- 學生 ID＋最少 12 位獨立密碼登入
- 每班最多顯示 76 名 3D 跑步學生
- 每人每日最多提交 5 本書
- 手機、平板及桌面響應式介面
- 班級公開排行榜
- 教師全校總覽及校方 Chrome／Edge 全年 CSV 串流匯出
- 校方 Firebase Hosting（正式網址：`https://reading.twghscysps.edu.hk`）

## 安全架構

### 學生私人資料

```text
students/{schoolYear}__{firebaseUid}
```

只准該學生本人讀取，包括最近閱讀書目、總本數及總里數。

### 班級公開排行榜

```text
publicStudents/{schoolYear}__{firebaseUid}
```

只包含學年、班別、不可反查登入 ID 的顯示別名、閱讀本數及里數。學生只可讀取自己班別，不會下載全校私人資料或同學學生 ID。

### 閱讀紀錄

```text
bookLogs/{serverGeneratedId}
```

每個學生每日只可建立第 1 至第 5 筆紀錄。Callable Function 以香港伺服器日期驗證學年、身份、輸入及冪等鍵，再把閱讀紀錄、私人進度及公開排行榜更新綁定在同一 transaction。Firestore Rules 拒絕瀏覽器直接寫入。

### 使用者角色

```text
users/{firebaseUid}
```

支援 `student` 及 `teacher` 角色；兩者均須為當前學年且 `active: true`。教師亦須具備相符的受信任 custom claims。`users` 文件及 claims 只能由校方管理工具建立，瀏覽器不可自行建立角色。

## Firebase 必要設定

正式使用前必須：

1. 啟用 Firebase Authentication 的 Email/Password。
2. 為每名學生建立獨立帳戶及不同的最少 12 位密碼。
3. 建立對應的 `users/{uid}` 學生角色文件。
4. 同一 release 部署 `firestore.rules`、indexes、Functions 及 Hosting。
5. 在相應 GitHub Environment 設定校方 Firebase Web config、`FIREBASE_APP_CHECK_SITE_KEY` 及學校網址；allowlisted build 才會產生 `dist` 設定檔。
6. 在 staging 完成規則、登入、456 人容量及匯出驗收後，啟用 Firebase App Check Enforcement。
7. 完成遷移後停用 Anonymous Authentication及移除私人帳戶權限。

完整步驟請閱讀 [`SECURITY_DEPLOYMENT.md`](./SECURITY_DEPLOYMENT.md)。

## 學生登入別名

學生不用知道背後的電郵別名，只需在網站輸入班別、學生 ID 和密碼。帳戶別名格式為：

```text
<schoolCode>.<YYYYYYYY>.<classId>.<studentId>@students.readingrun.invalid
```

`schoolCode` 由 GitHub Environment 的 `SCHOOL_CODE` 注入；不要把正式值或登入資料硬編碼到 source template。

## 修改課室名稱

打開 `app-config.js` 修改：

```js
const CLASSROOM_NAMES = [
  "1A", "1B",
  "2A", "2B", "2C",
  "3A", "3B", "3C",
  "4A", "4B", "4C",
  "5A", "5B", "5C",
  "6A", "6B", "6C",
];
```

## 本機預覽

不要以 `file://` 雙擊 HTML。請在專案目錄執行：

```bash
python -m http.server 8080
```

然後開啟：

```text
http://localhost:8080
```

沒有已建立的 Firebase 學生帳戶及角色文件時，安全版不會允許登入，這是正常的安全行為。

## 部署 Rules

上述私人登入及單獨部署 Rules 的指令已廢止。合併到受保護分支前，CI 必須通過 Functions tests、Firestore allow/deny emulator tests 和 allowlisted Hosting build；獲批後 workflow 一次過部署 Hosting、Firestore 和 Functions。

不要為了排錯把 Rules 改成 `allow read, write: if true`。

## 共用裝置

安全版不啟用 Firestore IndexedDB persistent cache。首次發布時，`reset-all-v1.js` 會清除舊匿名 session、舊離線 queue 及舊 Firestore 快取。學生使用共用裝置後仍應按「登出」。

## 上線狀態

此學生登入版應先在 staging Firebase 專案完成帳戶、角色、Rules、App Check 及負載測試，再合併到正式部署分支。
