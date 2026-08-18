# 依賴審核備註（2026-08-18）

鎖定依賴後，`npm audit --audit-level=high` 在 root、`functions/` 及 `admin-tools/` 全部以成功狀態完成，沒有 high 或 critical finding。

`npm audit` 仍報告 moderate transitive findings：root 5 項、Functions 7 項、admin tools 6 項。主要來自 Firebase CLI／Firebase Admin 間接使用的 `uuid < 11.1.1` buffer advisory，以及只在部署 CLI 的 OpenTelemetry baggage advisory。現有 Reading Run 程式不呼叫受影響的 UUID v3/v5/v6 buffer API，也不使用 Firebase Storage request path；root Firebase CLI 只在受保護 CI runner 執行。

npm 所建議的 `audit fix --force` 會把目前官方版本強制降級至舊 major（例如 Firebase Admin 10 或 Firebase Tools 14），不是合適修補，亦可能破壞 Node 22／Functions v2 部署。因此本 repository：

- 固定完整 package-lock；
- CI 阻止任何 high／critical advisory；
- 外部 GitHub Actions 固定 immutable commit SHA；
- 每月檢查 Firebase Admin、Functions、Tools 及受影響 transitive packages 的官方更新；
- 一旦有兼容修補版本，先在 staging 更新、執行全部 Functions／Rules／build 測試，再升 production。

這份備註不是代表校方已接受風險；production 上線前仍須由校方 IT／資料負責人確認，並在維護紀錄寫下覆核人及日期。
