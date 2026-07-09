# Reading Run Firebase 學生帳戶匯入工具

這個工具只用來把你已準備好的學生帳戶 CSV 匯入 Firebase。GitHub Pages 網頁不會、也不應該儲存學生 ID 或密碼。

正確登入流程：

```text
學生在 GitHub Pages 輸入：班別 + 學生 ID + 密碼
→ 前端把班別 + 學生 ID 轉成 Firebase Authentication email alias
→ Firebase Authentication 驗證密碼
→ Firestore users/{uid} 檢查 role / classId / studentId 是否吻合
→ 通過後才進入閱讀跑道
```

## 重要安全事項

- 不要把 `service-account.json` 上載到 GitHub。
- 不要把正式學生密碼的 CSV 上載到 GitHub。
- `users.example.csv` 只是一個學生帳戶格式範本。
- 本平台只設學生登入，不建立教師帳戶。
- 真正的學生 ID 和密碼資料應只存在 Firebase Authentication 及 Firestore `users/{uid}` 角色文件。

## CSV 欄位

| 欄位 | 用途 |
|---|---|
| role | 固定使用 `student` |
| classId | 學生班別代號，例如 `C01` |
| studentId | 學生 ID，例如 `S0001` |
| email | 可留空；系統會自動用 `scysps.C01.S0001@students.readingrun.invalid` |
| pin | 學生登入密碼，最少 6 位 |
| active | `true` 或 `false` |

## Firebase 內需要有兩部分資料

### 1. Firebase Authentication

每個學生都要有一個 Email/Password 帳戶。

例子：

```text
學生登入畫面：1A + S0001 + 123456
Firebase Auth email：scysps.C01.S0001@students.readingrun.invalid
Firebase Auth password：123456
```

### 2. Firestore users/{uid}

每個 Firebase Auth 使用者 UID 都要有一個對應的 `users/{uid}` 文件：

```text
role: "student"
classId: "C01"
studentId: "S0001"
active: true
```

如果 Firebase Auth 密碼正確，但 `users/{uid}` 的 `classId` 或 `studentId` 不吻合，學生仍然不能登入。

## 用 CSV 匯入 Firebase

1. 到 Firebase Console 下載 service account JSON。
2. 把 JSON 放在本資料夾，命名為 `service-account.json`。
3. 用 Excel 製作 `users.csv`，格式參考 `users.example.csv`。
4. 執行：

```bash
cd admin-tools
npm install
npm run import-users -- users.csv
```

## CSV 例子

```csv
role,classId,studentId,email,pin,active
student,C01,S0001,,123456,true
student,C01,S0002,,234567,true
```

匯入後，學生可在 GitHub Pages 登入頁選 `1A`，學生 ID 填 `S0001`，登入密碼填 `123456`。

## 不使用 CSV 時的手動建立方法

你也可以在 Firebase Console 手動建立：

1. Authentication → Users → Add user
2. Email 填：`scysps.C01.S0001@students.readingrun.invalid`
3. Password 填學生密碼，例如：`123456`
4. 複製該學生的 Firebase UID
5. Firestore → `users/{uid}` 建立同 UID 文件
6. 加入：

```text
role: "student"
classId: "C01"
studentId: "S0001"
active: true
```
