# Reading Run 安全部署清單（學生登入版）

這個版本只設學生登入，不設教師登入平台或教師數據中心。合併程式碼並不等於安全設定已生效；必須完成以下 Firebase Console 及學生帳戶建立步驟。

## 1. 先在測試 Firebase 專案驗證

不要直接在正式學生資料庫測試。先建立 staging 專案，完成學生登入、提交、每日上限、閱讀歷史及排行榜測試。

## 2. Authentication 設定

1. Firebase Console → Authentication → Sign-in method。
2. 啟用 **Email/Password**。
3. 建立學生帳戶後，停用 **Anonymous** 登入。
4. 不要使用全校共用 PIN。每位學生必須有不同 PIN，最少 6 位，建議 8 位或以上。
5. 不需要建立教師 Authentication 帳戶。

學生登入別名格式：

```text
<schoolCode>.<classId>.<studentId>@students.readingrun.invalid
```

本分支預設 `schoolCode` 是 `scysps`，可在 `security-config.js` 修改。例子：

```text
scysps.C01.S0001@students.readingrun.invalid
```

帳戶資料可先按照 `admin-tools/users.example.csv` 整理。正式 CSV 及 Firebase service account 不可上載 GitHub。

## 3. 建立 users 角色文件

每個 Firebase Authentication 使用者都必須在 Firestore 建立：

### 學生

```text
users/{firebaseUid}
  role: "student"
  classId: "C01"
  studentId: "S0001"
  active: true
```

現版本不建立 `teacher` 角色。`users` 文件只可由受信任的管理環境建立，不可由瀏覽器自行建立。

## 4. 部署 Firestore Rules

在專案根目錄執行：

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

部署後使用 Rules Playground 或 Firebase Emulator 驗證：

- 學生只能讀自己的 `students/{classId}__{studentId}`。
- 學生只能查詢自己班別的 `publicStudents`。
- 學生不能讀其他學生的 `bookLogs`。
- 學生不能直接把里數改成任意數字。
- 每日第 6 次提交必須失敗。
- 前端不能新增、修改或刪除 `dailyRecommendations`。
- 沒有教師登入或教師角色可以讀取全校學生資料。

## 5. 遷移公開排行榜資料

安全版排行榜改用 `publicStudents`，只包含：

```text
classId
studentId
booksCount
distance
updatedAt
```

不要把書名、作者、閱讀日期或其他私人閱讀資料複製到 `publicStudents`。

每個現有 `students/{studentKey}` 應建立同名 `publicStudents/{studentKey}`。首次學生登入亦會補建自己的公開排行榜文件。

## 6. 啟用 App Check

1. Firebase Console → App Check → Apps。
2. 為 Web App 設定 reCAPTCHA v3。
3. 把 site key 寫入 `security-config.js` 的 `appCheckSiteKey`。
4. 先使用監察模式，確認合法流量有 App Check token。
5. 確認無誤後，對 Firestore 啟用 Enforcement。

不要把 reCAPTCHA secret key 放在前端或 GitHub；前端只需要 site key。

## 7. 共用裝置及資料快取

安全版不再啟用 Firestore IndexedDB persistence。`reset-all-v1.js` 會在首次部署時清除舊匿名 session、離線 queue 及舊 Firestore 快取。

學校仍應：

- 要求學生使用後按「登出」。
- 共用 iPad 不使用瀏覽器自動填入 PIN。
- 定期清除共用瀏覽器資料。
- 不把 PIN 貼在公開位置或以全班共用同一 PIN。

## 8. 上線前負載及成本測試

用 staging 專案模擬至少：

- 30 部裝置同時登入。
- 30 部裝置同時提交。
- 500 個學生帳戶及每人至少 50 筆測試紀錄。
- 學校 Wi-Fi、iPad Safari、Android Chrome 和桌面 Chrome。

設定 Firebase Billing Budget、用量警報及異常流量通知。學生介面現在只讀本人班別的公開文件，不再監聽全校 `students` collection。

## 9. 正式發布次序

1. 備份 Firestore。
2. 建立學生 Authentication 帳戶。
3. 建立 `users` 學生角色文件。
4. 建立或遷移 `publicStudents`。
5. 部署新的 Firestore Rules。
6. 部署網站到測試網址。
7. 完成學生登入、越權和每日上限測試。
8. 啟用 App Check Enforcement。
9. 最後才把正式網址派給全校。

## 10. 回復方案

如正式部署後登入失敗，不要把 Rules 改回 `allow read, write: if true`。應回復上一個安全版本或暫停網站，先在 staging 修正帳戶／角色資料。
