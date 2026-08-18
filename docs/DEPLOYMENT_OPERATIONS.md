# 部署及全年運作指引

本網站只可由 `dist/` 發佈。`npm run build` 使用明確 allowlist 複製學生網站檔案，並在建置時產生 Firebase、App Check、學年和正式 origin 設定。repository root、`admin-tools/`、文件、CSV、`.env`、service-account 檔案、測試及 Git metadata 不會進入 Hosting artifact。

## 本機建置

先設定與 GitHub Environment variables 相同的環境變數，再執行：

```powershell
npm ci --ignore-scripts
npm --prefix functions ci --ignore-scripts
npm run check:source
npm --prefix functions test
npm run test:rules
npm run build
npm run validate:dist
```

建置器會拒絕 `book-running`、`pakho2433`、placeholder、非 HTTPS origin、錯誤學年格式，以及 production 不是 `https://reading.twghscysps.edu.hk`。它也會刪除舊式 anonymous-auth recommendation entry，不把不需要的 legacy clients 複製到 `dist/`。

## 自動部署

- Pull request、`staging`、`main` 都先經 `Quality gate / verify`：JavaScript syntax、Functions tests、Firestore allow/deny tests、allowlisted build 和 Hosting security-header validation。
- `staging` 只由受保護 `staging` branch 部署到 `reading-staging` Environment。
- production 只由受保護 `main` branch 部署到 `reading-production` Environment，並需要 environment reviewer 批准。
- Workflow 使用 GitHub OIDC/WIF 的短效 Google credential，同一次 release 部署 Hosting、Firestore Rules/indexes 和 Functions，避免前端與規則版本漂移。
- Workflow 不接受個人 GitHub owner，也不使用 GitHub Pages、Firebase refresh token 或 service-account JSON。

## 全年監察

校方 IT 每月最少檢查：

- Firebase Authentication 登入失敗率、App Check valid/invalid/unknown 比例；
- Functions error rate、latency、instance/concurrency 和 transaction retry；
- Firestore reads/writes/storage、索引建立失敗和被 Rules 拒絕的請求；
- Hosting 5xx、TLS custom-domain 狀態和 uptime check；
- GCP billing budget、異常增幅、備份/PITR 狀態；
- GitHub Actions 失敗、依賴警報、分支及 Environment protection；
- 學生帳戶離校停用、教師角色、管理員及 WIF IAM 變動。

不要以 Firebase Spark 免費額度作全年服務承諾。456 名學生同時使用及 real-time listener 可令 reads 短時間增加；production 應使用校方 Blaze billing、預算警報、負載測試、備份及書面 incident owner。Firebase Hosting/CDN 與 Firestore 可承載這個校本規模，但可用性取決於校方帳單、配額、監察、備份、Rules/Functions 版本和網絡，而不是只看靜態網頁大小。

## 發佈及回復

每次 production release 記錄 pull request、commit SHA、審批人、Functions revision、Rules release 和 Hosting release。發佈後立即用學生及教師測試帳戶做 smoke test。前端錯誤可在 Firebase Hosting Console rollback；Functions/Rules 亦要回復到相容版本，不能只回復其中一層。資料錯誤先停止寫入及保留證據，再按校方備份程序復原。

擁有權、WIF、DNS、資料移轉及移除私人帳戶的完整步驟見 `docs/SCHOOL_OWNERSHIP_AND_CUTOVER.md`。
