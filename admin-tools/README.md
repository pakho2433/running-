# Reading Run 批量建立學生帳戶工具

這個工具用 CSV 批量建立 Firebase Authentication 學生帳戶，並同步建立 Firestore 的 `users/{uid}`、`students/{classId}__{studentId}`、`publicStudents/{classId}__{studentId}` 文件。

## 重要安全事項

- 不要把 `service-account.json` 上載到 GitHub。
- 不要把正式學生密碼的 CSV 上載到 GitHub。
- `users.example.csv` 只是一個學生帳戶範本。
- 本平台只設學生登入，不建立教師帳戶。
- `users.generated.csv` 已加入 `.gitignore`，請只留在自己的電腦內使用。

## CSV 欄位

| 欄位 | 用途 |
|---|---|
| role | 固定使用 `student` |
| classId | 學生班別代號，例如 `C01` |
| studentId | 學生 ID，例如 `S0001` |
| email | 可留空；系統會自動用 `scysps.C01.S0001@students.readingrun.invalid` |
| pin | 學生登入密碼，最少 6 位 |
| active | `true` 或 `false` |
| className | 只方便老師查看，匯入時不會影響登入 |

## 方法一：自動產生全校學生 ID 和密碼

預設會產生 17 班，每班 26 個學生，即 442 個學生帳戶：

```bash
cd admin-tools
npm install
npm run generate-users
```

完成後會產生：

```text
admin-tools/users.generated.csv
```

預設 ID 例子：

```text
1A：S0001 至 S0026
1B：S0001 至 S0026
2A：S0001 至 S0026
...
6C：S0001 至 S0026
```

每個學生會自動產生 8 位隨機登入密碼。

如要每班 30 人：

```bash
STUDENTS_PER_CLASS=30 npm run generate-users
```

如要 6 位密碼：

```bash
PIN_LENGTH=6 npm run generate-users
```

如要改 school code：

```bash
READING_RUN_SCHOOL_CODE=scysps npm run generate-users
```

## 匯入 Firebase

1. 到 Firebase Console 下載 service account JSON。
2. 把 JSON 放在本資料夾，命名為 `service-account.json`。
3. 執行：

```bash
npm run import-users -- users.generated.csv
```

匯入後，學生可在登入頁選班別，例如 `1A`，學生 ID 填 `S0001`，登入密碼填 CSV 裏的 `pin`。

## 方法二：手動製作 users.csv

你也可以用 Excel 自己製作 `users.csv`，格式參考 `users.example.csv`：

```csv
role,classId,studentId,email,pin,active
student,C01,S0001,,CHANGE_TO_UNIQUE_PASSWORD,true
student,C01,S0002,,CHANGE_TO_UNIQUE_PASSWORD,true
```

然後匯入：

```bash
npm run import-users -- users.csv
```
