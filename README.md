# Reading Run｜3D 全校閱讀跑道

一個支援手機、平板及電腦的校園閱讀紀錄平台。安全版以 Firebase Authentication、學生個人 PIN、教師帳戶及角色式 Firestore Rules 保護學生資料。

## 主要功能

- 17 個可自訂班別
- 學生 ID＋個人 PIN 登入
- 每班最多顯示 26 名 3D 跑步學生
- 每人每日最多提交 5 本書
- 手機、平板及桌面響應式介面
- 教師安全數據中心及 Excel 匯出
- 教師每日好書推介
- GitHub Pages 部署

## 安全架構

### 學生私人資料

```text
students/{classId}__{studentId}
```

只准該學生及教師讀取，包括最近閱讀書目、總本數及總里數。

### 班級公開排行榜

```text
publicStudents/{classId}__{studentId}
```

只包含班別、學生 ID、閱讀本數及里數。學生只可讀取自己班別，不會下載全校私人資料。

### 閱讀紀錄

```text
bookLogs/{studentKey}__{schoolDate}__{dailySequence}
```

每個學生每日只可建立第 1 至第 5 筆紀錄。Firestore Rules 會把閱讀紀錄、私人進度及公開排行榜更新綁定在同一 transaction。

### 使用者角色

```text
users/{firebaseUid}
```

學生角色包含 `classId` 及 `studentId`；教師角色為 `teacher`。`users` 文件只能由受信任的管理環境建立，瀏覽器不可自行建立角色。

## Firebase 必要設定

正式使用前必須：

1. 啟用 Firebase Authentication 的 Email/Password。
2. 為每名學生建立獨立帳戶及不同 PIN。
3. 為教師建立學校電郵帳戶。
4. 建立對應的 `users/{uid}` 角色文件。
5. 部署 `firestore.rules`。
6. 設定 `publicStudents` 排行榜文件。
7. 在 `security-config.js` 加入 reCAPTCHA v3 site key。
8. 測試後啟用 Firebase App Check Enforcement。
9. 完成遷移後停用 Anonymous Authentication。

完整步驟請閱讀 [`SECURITY_DEPLOYMENT.md`](./SECURITY_DEPLOYMENT.md)。

## 學生登入別名

學生不用知道背後的電郵別名，只需在網站輸入班別、學生 ID 和 PIN。帳戶別名格式為：

```text
<schoolCode>.<classId>.<studentId>@students.readingrun.invalid
```

`schoolCode` 在 `security-config.js` 設定。

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

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

不要為了排錯把 Rules 改成 `allow read, write: if true`。

## 共用裝置

安全版不啟用 Firestore IndexedDB persistent cache。首次發布時，`reset-all-v1.js` 會清除舊匿名 session、舊離線 queue 及舊 Firestore 快取。學生使用共用裝置後仍應按「登出」。

## 上線狀態

此安全修改應先在 staging Firebase 專案完成帳戶、角色、Rules、App Check 及負載測試，再合併到正式部署分支。
