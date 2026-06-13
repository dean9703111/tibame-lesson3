---
description: 前端登入頁面測試案例（LoginPage 元件）
---

> 狀態：初始為 [ ]、完成為 [x]
> 注意：狀態只能在測試通過後由流程更新。
> 對應測試檔：`apps/web/src/pages/Login.test.tsx`（Vitest + Testing Library，apiClient 以 mock 取代）
> 測試類型：成功流程、錯誤處理、表單驗證

---

## [x] 【成功流程】輸入正確帳密登入成功 → 寫入 session（user + csrfToken）並導向首頁
**範例輸入**：mock `apiClient.post` 回傳 `{ user: { name: "Alice", ... }, csrfToken: "csrf-1" }`；於帳號欄輸入 alice、密碼欄輸入 password123 後點擊「登入」
**期待輸出**：`useAuthStore` 的 `user.name === "Alice"`、`csrfToken === "csrf-1"`（並觸發導向 `/`）

---

## [x] 【錯誤處理】伺服器回傳 INVALID_CREDENTIALS → 顯示「帳號或密碼錯誤」
**範例輸入**：mock `apiClient.post` reject `new ApiError(401, "INVALID_CREDENTIALS", "bad")`；輸入帳密後送出
**期待輸出**：畫面出現 `role="alert"`，文字含「帳號或密碼錯誤」

---

## [x] 【錯誤處理】伺服器回傳 ACCOUNT_LOCKED → 顯示帳號鎖定訊息（含解鎖時間）
**範例輸入**：mock `apiClient.post` reject `new ApiError(401, "ACCOUNT_LOCKED", "locked", { unlockAt })`；輸入帳密後送出
**期待輸出**：畫面出現 `role="alert"`，文字含「鎖定」

---

## [x] 【錯誤處理】伺服器回傳 ACCOUNT_INACTIVE → 顯示「此帳號已停用」
**範例輸入**：mock `apiClient.post` reject `new ApiError(401, "ACCOUNT_INACTIVE", "inactive")`；輸入帳密後送出
**期待輸出**：畫面出現 `role="alert"`，文字含「已停用」

---

## [x] 【表單驗證】帳號或密碼為空 → 前端 zod 驗證阻擋，不呼叫登入 API
**範例輸入**：兩欄皆留空，直接點擊「登入」
**期待輸出**：`apiClient.post` 未被呼叫；欄位出現必填驗證錯誤訊息
