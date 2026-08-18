# 校方擁有權及正式網址切換手冊

目標正式網址是 `https://reading.twghscysps.edu.hk`。正式系統必須由學校或辦學團體控制 GitHub、Google Cloud/Firebase、帳單、DNS 和復原權限；任何日常修正都不再依賴私人 `pakho2433` 帳戶。

本手冊不包含任何真實專案 ID、帳戶、金鑰或 DNS 記錄。所有大寫代號都要由校方 IT 填入。不要把 service-account JSON、Firebase CI token、學生密碼或匯入 CSV 放入 repository。

## 1. 完成後的擁有權

| 資產 | 正式擁有人 | 最低管理安排 |
|---|---|---|
| GitHub repository | 校方／辦學團體 GitHub Organization | 兩名校方管理員；`main` 受保護；私人帳戶不是唯一管理員 |
| Firebase/GCP production | 校方 Google Cloud Organization | 校方帳單；兩名緊急管理員；日常權限以 Google Group 分配 |
| Firebase/GCP staging | 校方 Google Cloud Organization 的獨立 project | 不與正式學生資料共用 Auth、Firestore 或 App Check |
| `twghscysps.edu.hk` DNS | 校方／辦學團體網域管理員 | 至少兩名校方人員可修改和復原記錄 |
| GitHub Actions 部署身分 | 每個環境獨立 service account + Workload Identity Federation | 不建立或下載長效 service-account key |
| 備份及復原 | 校方 IT | 備份、還原演習和保留期均有書面紀錄 |

## 2. 建立 staging 與 production

1. 在校方 Google Cloud Organization 下建立兩個新 project，例如 `SCHOOL_READING_STAGING_PROJECT` 及 `SCHOOL_READING_PRODUCTION_PROJECT`。不要重用私人 `book-running` project ID。
2. 兩個 project 都升級到校方控制的 Blaze billing account，設定預算通知及服務配額警報。
3. 在每個 project 啟用 Firebase，建立 Web App、Firestore、Authentication、App Check、Cloud Functions 和 Firebase Hosting site。
4. Firestore 選用一致的資料庫位置；Functions 本 repository 使用 `asia-east2`。位置一經選定很難更改，先由校方確認資料管治要求。
5. production 只啟用所需的登入提供者。加入 `reading.twghscysps.edu.hk` 到 Firebase Authentication Authorized Domains；staging 使用自己的網域。
6. 為 production 和 staging 分別建立與現有 `ReCaptchaV3Provider` 相符的 reCAPTCHA v3/App Check site key，加入各自網域，先觀察指標，再對 Authentication、Firestore 及 callable Functions 強制執行 App Check。如日後改用 reCAPTCHA Enterprise，必須同時修改及測試前端 provider，不能只更換 Console key。
7. 啟用 Identity Platform 的 email enumeration protection。教師帳戶使用校方身分、強密碼及 MFA；不要與學生共用教師帳戶。

## 3. 把 repository 移交校方

建議把現有 repository 轉移到校方 GitHub Organization，再改名為例如 `reading-run`，這樣可保留提交紀錄。也可由校方建立全新 private repository，再由審核員匯入乾淨的歷史。無論採用哪一方法：

1. 先由兩名校方 Organization Owner 接受移交及確認可存取 repository settings。
2. 停用 GitHub Pages；本分支已移除 Pages deployment workflow。不要把 repository root 當網站 artifact。
3. 建立受保護的 `staging` 及 `main` 分支，禁止 force-push 和刪除，所有變更經 pull request。
4. `main` 至少要求一名非提交者審批、`Quality gate / verify` 成功，以及所有對話解決後才可合併。校方如有兩人覆核能力，正式環境建議兩名審批者。
5. 建立 `reading-staging` 和 `reading-production` GitHub Environments。兩者只准相應受保護分支部署；production 設 required reviewers、禁止 self-review，並關閉管理員繞過。
6. Organization Actions policy 只允許校方批准的 actions；本 repository 的外部 actions 已固定至完整 commit SHA。
7. 在校方成功進行部署和復原演習前，不要移除原維護者。驗收完成後，移除私人帳戶的 Admin、DNS、GCP IAM、billing 及部署權限；如仍需技術支援，只授予有期限、可撤銷的最低權限。

校方在選擇 private repository 前，必須確認所用 GitHub plan 支援 private repository 的 Environment required reviewers 和所需保護規則。若 plan 不支援，不可靜默取消 production 人手審批；應升級校方 plan，或由校方評估把不含 secrets 的 source 設為 public 並保留完整保護。

## 4. GitHub Environment variables

在 `reading-staging` 及 `reading-production` 分別設定下列 Variables。Firebase Web config 和 App Check site key 是公開 client 設定，但仍應由 environment 管理，以免誤連私人或錯誤 project。

| Variable | 內容 |
|---|---|
| `SCHOOL_GITHUB_ORG` | 校方 GitHub Organization 名稱 |
| `SCHOOL_NAME` | 網站顯示的正式校名 |
| `SCHOOL_CODE` | 短代號，例如 `scysps` |
| `SCHOOL_YEAR` | `2026-2027` |
| `SCHOOL_SITE_ORIGIN` | production 必須是 `https://reading.twghscysps.edu.hk`；staging 使用獨立 HTTPS origin |
| `FIREBASE_PROJECT_ID` | 該環境的校方 Firebase project ID |
| `FIREBASE_HOSTING_SITE` | 該環境的 Firebase Hosting site ID |
| `FIREBASE_API_KEY` | Firebase Web App config |
| `FIREBASE_AUTH_DOMAIN` | Firebase Web App config |
| `FIREBASE_STORAGE_BUCKET` | Firebase Web App config |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App config |
| `FIREBASE_APP_ID` | Firebase Web App config |
| `FIREBASE_MEASUREMENT_ID` | 如沒有使用 Analytics 可留空 |
| `FIREBASE_APP_CHECK_SITE_KEY` | 該環境的 App Check public site key |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | 完整 WIF provider resource name |
| `GCP_SERVICE_ACCOUNT` | 該環境專用部署 service account email |

Workflow 會拒絕以下情況：私人 project/owner、未受保護分支、非校方 Organization、production 使用錯誤網址、未填 placeholder，以及從 `ci` artifact 部署。

## 5. 無長效金鑰的部署身分

每個 Firebase project 建立獨立部署 service account。使用 GitHub OIDC 與 Google Cloud Workload Identity Federation，讓 workflow 只取得短效憑證。Google 官方建議 CI 使用 Application Default Credentials；不要使用舊式 `FIREBASE_TOKEN`。

WIF provider 最少映射：

```text
google.subject=assertion.sub
attribute.repository_id=assertion.repository_id
attribute.repository_owner_id=assertion.repository_owner_id
attribute.ref=assertion.ref
```

Attribute condition 應鎖定校方不可重用的 numeric Organization ID、numeric repository ID 及分支；例如 production 只接受 `refs/heads/main`，staging 只接受 `refs/heads/staging`。名稱可作額外限制，但不可只依賴名稱。

部署 service account 從以下最小角色開始，再按 Firebase CLI 實際錯誤由校方 Cloud 管理員逐項補權限，切勿直接授予 Owner/Editor：

- Firebase Hosting Admin (`roles/firebasehosting.admin`)
- API Keys Viewer (`roles/serviceusage.apiKeysViewer`，Firebase CLI 部署 Hosting 所需)
- Firebase Rules Admin (`roles/firebaserules.admin`)
- Cloud Datastore Index Admin (`roles/datastore.indexAdmin`)
- Cloud Functions Developer (`roles/cloudfunctions.developer`)
- Service Account User (`roles/iam.serviceAccountUser`) 只授予指定 Functions runtime 及 Cloud Build service accounts

確認 Google 管理的 Functions、Cloud Build、Artifact Registry service agents 保留官方預設角色。runtime service account 本身只應有讀寫本應用所需 Firestore、logging 等權限，不應保留 Editor。

參考：[Google Cloud 的 GitHub WIF 指引](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)、[Firebase CLI CI 認證](https://firebase.google.com/docs/cli)、[Cloud Run functions 部署 IAM](https://cloud.google.com/functions/docs/reference/iam/roles)、[Firebase product roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product)。

## 6. 正式網址與 DNS 零停機切換

1. 在 production Firebase Hosting Console 選 Add custom domain，輸入 `reading.twghscysps.edu.hk`。
2. 使用 Advanced Setup，先按 Console 顯示加入網域驗證記錄，讓 Firebase 預先簽發 TLS；不要猜測或把網上範例 IP 當成正式記錄。
3. 如校方 DNS 使用 CAA，確保 Firebase Console 要求的憑證機構可簽發。切換前 24–48 小時把相關 DNS TTL 降低。
4. Firebase 顯示 TLS/網域準備完成後，才把流量記錄改到 Console 提供的值。驗證 HTTPS、登入、App Check、提交、教師檢視及安全 headers。
5. 在 Firebase Authentication、App Check/reCAPTCHA、API key HTTP referrer restrictions 和監察平台加入新網域；移除 `pakho2433.github.io`，但先確認沒有合法流量。
6. 保留舊站最多兩至四星期只顯示不含個人資料的搬遷通知，之後在私人 repository Settings 明確 Unpublish GitHub Pages。不要讓兩個站點同時寫入 production。

Firebase Advanced Setup 可在舊站仍運作時準備連線及 TLS：[Firebase custom domain 指引](https://firebase.google.com/docs/hosting/custom-domain)。

## 7. 資料移轉及驗收

新 project 代表 Authentication UID 和 Firestore 資料不會自動存在。2026–2027 正式版的首選做法是以本 repository 的校方匯入工具建立全新 cohort、全新含學年 Auth alias 和全新隨機密碼，把舊資料只作受控封存；不要把舊 project 原樣匯入 active collections。先在 staging 演練，再在維護時段進行 production：

1. 凍結舊站寫入，記錄最後成功提交時間及文件數。
2. 用 `admin-tools/import-users-from-csv.mjs` 在校方 project 建立 2026–2027 帳戶。舊 Auth alias 沒有學年，而且 UID 與新 `studentKey` schema 不同，不能直接匯入後期望新登入頁可用。
3. 如校方必須保存舊學年，只把核准資料匯出到校方控制的封存 bucket／archive collection；匯出 bucket、KMS、IAM 和檔案均由校方擁有。若要在新系統查閱，必須另寫並覆核一次性轉換，明確映射舊 UID、學年及新 opaque key，不能把原始 `students`、`publicStudents` 或 `bookLogs` 直接倒入 active collections。
4. 不要把 2025–2026 舊資料混入 2026–2027 active cohort。抽查 `schoolYear`、學生數、總閱讀數、班級總數和每日限制文件。
5. 在 staging 用測試帳戶完成：錯誤密碼、學生登入、重複提交、每日第六本被拒、跨學生讀寫被拒、教師角色、分頁、登出及共用裝置重新登入。
6. production 由兩名校方人員完成 smoke test，並記錄 commit SHA、Firebase release、Functions revision、Rules release 和 DNS 截圖。
7. 校方獨立執行一次 Hosting rollback、Firestore restore 演習及緊急移除部署權限。全部成功後才簽署移交。

## 8. 私隱及資料管治上線閘門

production 開放學生前，校方資料負責人須批准個人資料收集聲明（PICS）及處理記錄，清楚列出收集目的、學生 ID／班別／閱讀紀錄等欄位、使用者、Google/Firebase 處理安排、資料位置、保存期限、查閱／改正方法及聯絡人。登入頁應提供校方批准的簡短通知及完整 PICS 連結。

校方須書面決定：離校／停用帳戶時限、學年完結封存或刪除日期、備份保留期、教師匯出批准人及事故通報流程。教師 CSV 只可在校方受管控及加密裝置處理，不可上載私人電郵、私人雲端或未批准 USB；全年資料只可在支援 File System Access API 的校方 Chrome／Edge 串流寫入單一 CSV，避免瀏覽器記憶體、被封鎖的多檔自動下載及舊式 `.xls` 65,536 列限制。不支援安全串流的瀏覽器會清楚拒絕全年匯出，不會誤稱成功。下載及分頁匯出應由 Cloud audit log 記錄並定期覆核。正式學生資料不得用於 staging、示範、負載測試或一般開發。

## 9. 切換及回復判準

切換前必須全部為「是」：校方可合併及部署、兩個管理員可登入、CI/rules/backend tests 全部通過、備份完成、TLS 已簽發、App Check 指標正常、學生資料核對完成、舊站已凍結。

出現以下任何情況立即回復：大量登入失敗、提交交易錯誤、班級資料互相可見、Rules/App Check 未強制執行、DNS/TLS 錯誤、資料核對不一致。回復方法是把 DNS 恢復至預先記錄的值及在 Firebase Hosting rollback 到上一個已驗證 release；資料寫入一旦開始便不要盲目雙向同步，先凍結並由校方資料負責人核對。

## 10. 每學年例行工作

每年開學前四星期：由開發人員在同一個受版本控制的 pull request 同步更新前端建置合約、Functions 的 `DEFAULT_SCHOOL_YEAR`、Firestore Rules 內的學年、測試及部署變數；不可只在 GitHub Environment 改 `SCHOOL_YEAR`。現有 release 會拒絕 `2026-2027` 以外的值，避免前後端錯配。合併後才在 staging 匯入新 cohort、驗證班別和容量、完成規則測試及負載測試；開學前一星期由 production reviewer 批准。舊學年資料依學校私隱保留政策封存或刪除，不能只靠學生編號覆蓋。每季檢查 GitHub/GCP/DNS 管理員、WIF 條件、依賴更新、App Check、預算、備份和復原紀錄。
