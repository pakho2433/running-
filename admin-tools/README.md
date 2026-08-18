# Reading Run 校方帳戶管理工具

這些工具只供校方受管控的管理員工作站使用。正式網站不會、也不應儲存學生密碼或管理員憑證。

## 安全原則

- 只可連接由學校／東華三院持有的 Google Cloud/Firebase 專案。
- 使用 Google Application Default Credentials（ADC）或 Workload Identity Federation；不要下載或保存長期 `service-account.json` key。
- 不要把正式學生 CSV、密碼、匯出資料或 `.env` 上載到 GitHub。
- 每名學生使用獨立、隨機、最少 12 字元的密碼；不要使用學號、生日、`123456` 或全班共用密碼。
- 教師帳戶須使用學校電郵、最少 14 字元密碼及 MFA；工具不會把教師密碼印在終端。
- `FIREBASE_PROJECT_ID` 及 `READING_RUN_CONFIRM_PROJECT` 必須完全相同，避免誤寫私人或錯誤專案。

## 2026–2027 登入及資料隔離

學生在網站輸入班別、學生 ID 及密碼。前端把資料轉成含學年的 Firebase Auth alias，例如：

```text
scysps.20262027.c01.s0001@students.readingrun.invalid
```

成功登入後仍須通過 `users/{uid}` 的 `role`、`active`、`classId`、`studentId`、`schoolYear` 及 `studentKey` 驗證。正式學生文件使用不含班別／學號的 opaque key：

```text
students/2026-2027__{uid}
publicStudents/2026-2027__{uid}
```

`publicStudents` 只存非登入用途的 `displayAlias`，不存學生 ID。

## CSV 欄位

| 欄位 | 用途 |
|---|---|
| `role` | 固定為 `student` |
| `classId` | 班別代號，例如 `C01` |
| `studentId` | 校內學生 ID，例如 `S0001` |
| `email` | 通常留空，由工具按學年產生 Auth alias |
| `pin` | 獨立、隨機、最少 12 字元密碼 |
| `displayAlias` | 可留空；工具會產生不作登入用途的跑手代號 |
| `active` | `true` 或 `false` |

格式請參考 `users.example.csv`。範例內 `REPLACE_WITH_...` 是故意不可匯入的 placeholder；必須逐行換成不同的隨機密碼。正式 CSV 必須存於學校受管控、加密的暫存位置，完成匯入後按校方保存政策安全刪除。

## 匯入學生

先以校方帳戶取得短期 ADC，例如由校方 IT 執行 `gcloud auth application-default login`，然後設定明確目標：

```powershell
$env:FIREBASE_PROJECT_ID="SCHOOL_FIREBASE_PROJECT_ID"
$env:READING_RUN_CONFIRM_PROJECT="SCHOOL_FIREBASE_PROJECT_ID"
$env:READING_RUN_SCHOOL_YEAR="2026-2027"
$env:READING_RUN_SCHOOL_CODE="scysps"
npm install
npm run import-users -- "C:\SchoolSecureTemp\users.csv"
```

工具會先完成兩層預檢，而且在兩層全部通過前不會寫入任何資料：

1. 一次過驗證整份 CSV，拒絕 placeholder、少於 12 字元或重複密碼、重複 email，以及重複 `classId + studentId`。
2. 只讀取所有相關 Auth、`users`、`students` 及 `publicStudents` 狀態，核對身份欄位、公開 alias 和既有 counters；任何衝突或讀取失敗都會令整次匯入在零 mutation 狀態停止。

開始寫入後，單一學生的 Firestore batch 失敗時，工具會刪除剛建立的新 Auth user，讓同一份 CSV 可以安全重跑。若既有 Auth user 已更新但其 Firestore batch 失敗，或新 user 無法刪除，終端會在 `RECONCILIATION_REQUIRED_BEGIN` 與 `RECONCILIATION_REQUIRED_END` 之間輸出不含密碼的 JSON 清單，並以非零 exit code 結束。請保留該清單於校方事故紀錄、修正列出的 Firebase 錯誤，然後使用原本受保護的 CSV 重跑；不要把清單或 CSV 上載到 GitHub。

匯入後應抽樣核對 Auth、`users/{uid}`、`students/{schoolYear}__{uid}` 及 `publicStudents/{schoolYear}__{uid}`，再用測試學生帳戶完成一次登入／提交／登出。

## 建立教師帳戶

教師密碼只可透過受保護的環境變數提供，不可放在命令列參數或 CSV：

```powershell
$env:FIREBASE_PROJECT_ID="SCHOOL_FIREBASE_PROJECT_ID"
$env:READING_RUN_CONFIRM_PROJECT="SCHOOL_FIREBASE_PROJECT_ID"
$env:READING_RUN_SCHOOL_YEAR="2026-2027"
$env:READING_RUN_ALLOWED_TEACHER_DOMAINS="CONFIRMED_SCHOOL_OR_TWGH_EMAIL_DOMAIN"
$env:READING_RUN_TEACHER_PASSWORD="USE_A_SCHOOL_APPROVED_SECRET"
npm run create-teacher -- "teacher@twghscysps.edu.hk" "閱讀統籌老師"
```

請由校方 IT 先確認真正的職員電郵 domain；上述 domain 只作格式示例。建立後立即清除密碼環境變數、在校方 Identity/Firebase 管理介面強制 MFA，並按最小權限原則指派教師角色。不要使用私人電郵帳戶。
