# Reading Run 批量建立帳戶工具

這個工具用 CSV 批量建立 Firebase Authentication 帳戶，並同步建立 Firestore 的 `users/{uid}`、`students/{classId}__{studentId}`、`publicStudents/{classId}__{studentId}` 文件。

## 重要安全事項

- 不要把 `service-account.json` 上載到 GitHub。
- 不要把正式學生 PIN 的 CSV 上載到 GitHub。
- `users.example.csv` 只是一個範本。

## CSV 欄位

| 欄位 | 用途 |
|---|---|
| role | `student` 或 `teacher` |
| classId | 學生班別代號，例如 `C01` |
| studentId | 學生 ID，例如 `S0001` |
| email | 教師必填；學生可留空，系統會自動用 `scysps.C01.S0001@students.readingrun.invalid` |
| pin | 登入密碼，最少 6 位 |
| active | `true` 或 `false` |

## 使用方法

1. 到 Firebase Console 下載 service account JSON。
2. 把 JSON 放在本資料夾，命名為 `service-account.json`。
3. 用 Excel 製作 `users.csv`，格式參考 `users.example.csv`。
4. 在本資料夾執行：

```bash
npm install
npm run import-users -- users.csv
```

如要改 school code：

```bash
READING_RUN_SCHOOL_CODE=scysps npm run import-users -- users.csv
```

## 測試例子

CSV：

```csv
role,classId,studentId,email,pin,active
student,C01,S0001,,CHANGE_TO_UNIQUE_PIN,true
teacher,,,teacher@example.edu.hk,CHANGE_TO_STRONG_PASSWORD,true
```

學生登入時選 1A，學生 ID 填 `S0001`，PIN 填 CSV 裏的 `pin`。
