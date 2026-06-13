---
description: 後端登入流程測試案例（POST /api/auth/login、/logout、/me）
---

> 狀態：初始為 [ ]、完成為 [x]
> 注意：狀態只能在測試通過後由流程更新。
> 對應測試檔：`apps/api/src/routes/auth.test.ts`（Jest + supertest）
> 測試類型：成功登入、登入失敗、帳號鎖定、帳號狀態、Session 驗證、登出與 CSRF、路由限制

---

## [x] 【成功登入】正確帳密 → 200、回傳 user + csrfToken、不含 passwordHash、Set-Cookie 為 HttpOnly
**範例輸入**：已存在 ACTIVE 員工 alice / password123，`POST /api/auth/login { username: "alice", password: "password123" }`
**期待輸出**：`200`；`body.user.role === "USER"`、`body.user.passwordHash` 為 undefined；`body.csrfToken` 為字串；`Set-Cookie` 含 `HttpOnly`

---

## [x] 【成功登入】成功登入後重置 failedLoginCount 與 lockedUntil
**範例輸入**：員工 alice 既有 `failedLoginCount = 3`，以正確密碼登入
**期待輸出**：`200`；DB 中該員工 `failedLoginCount === 0`、`lockedUntil === null`

---

## [x] 【登入失敗】密碼錯誤 → 401 INVALID_CREDENTIALS
**範例輸入**：員工 alice 存在，`POST /api/auth/login { username: "alice", password: "wrong" }`
**期待輸出**：`401`；`body.error.code === "INVALID_CREDENTIALS"`

---

## [x] 【登入失敗】帳號不存在 → 401 INVALID_CREDENTIALS（不洩漏帳號是否存在）
**範例輸入**：DB 無 ghost 此帳號，`POST /api/auth/login { username: "ghost", password: "whatever" }`
**期待輸出**：`401`；`body.error.code === "INVALID_CREDENTIALS"`（與密碼錯誤同一回應，不區分）

---

## [x] 【登入失敗】缺少必填欄位 → 400 VALIDATION_ERROR
**範例輸入**：`POST /api/auth/login { username: "alice" }`（缺 password）
**期待輸出**：`400`；`body.error.code === "VALIDATION_ERROR"`

---

## [x] 【帳號鎖定】連續 5 次密碼錯誤 → 鎖定帳號（failedLoginCount=5、lockedUntil 在未來）
**範例輸入**：員工 alice 存在，連續送出 5 次錯誤密碼登入
**期待輸出**：每次皆 `401 INVALID_CREDENTIALS`；DB 中 `failedLoginCount === 5`、`lockedUntil` 大於現在時間

---

## [x] 【帳號鎖定】鎖定後即使密碼正確 → 401 ACCOUNT_LOCKED 並回傳 unlockAt
**範例輸入**：承上已鎖定，改用正確密碼 password123 登入
**期待輸出**：`401`；`body.error.code === "ACCOUNT_LOCKED"`；`body.error.details.unlockAt` 為 ISO 字串

---

## [x] 【帳號鎖定】第 4 次失敗尚未鎖定
**範例輸入**：員工 alice 存在，連續送出 4 次錯誤密碼登入
**期待輸出**：每次皆 `401 INVALID_CREDENTIALS`；DB 中 `failedLoginCount === 4`、`lockedUntil === null`

---

## [x] 【帳號狀態】INACTIVE 帳號無法登入 → 401 ACCOUNT_INACTIVE
**範例輸入**：員工 alice 狀態為 INACTIVE，以正確密碼登入
**期待輸出**：`401`；`body.error.code === "ACCOUNT_INACTIVE"`

---

## [x] 【Session 驗證】GET /api/auth/me 無 cookie → 401 UNAUTHENTICATED
**範例輸入**：未帶任何 cookie 呼叫 `GET /api/auth/me`
**期待輸出**：`401`；`body.error.code === "UNAUTHENTICATED"`

---

## [x] 【Session 驗證】GET /api/auth/me 帶有效 cookie → 200、回傳使用者資料
**範例輸入**：alice 登入取得 cookie 後，帶該 cookie 呼叫 `GET /api/auth/me`
**期待輸出**：`200`；`body.user.email` 等於該員工 email

---

## [x] 【Session 驗證】GET /api/auth/me 回傳的 csrfToken 可用於登出
**範例輸入**：alice 登入後僅帶 cookie 呼叫 `/me` 取得 csrfToken，再以該 token 呼叫登出
**期待輸出**：`/me` 回 `200` 且 `body.csrfToken` 為字串；以該 token 登出回 `204`

---

## [x] 【登出與 CSRF】登出缺少 X-CSRF-Token → 403 CSRF_TOKEN_MISSING
**範例輸入**：alice 登入後僅帶 cookie、不帶 CSRF token 呼叫 `POST /api/auth/logout`
**期待輸出**：`403`；`body.error.code === "CSRF_TOKEN_MISSING"`

---

## [x] 【登出與 CSRF】登出帶正確 X-CSRF-Token → 204
**範例輸入**：alice 登入後帶 cookie 與正確 CSRF token 呼叫 `POST /api/auth/logout`
**期待輸出**：`204`、無內容

---

## [x] 【路由限制】POST /api/auth/register → 404（未提供註冊功能）
**範例輸入**：`POST /api/auth/register {}`
**期待輸出**：`404`
