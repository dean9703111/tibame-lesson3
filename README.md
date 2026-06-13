# Vehicle Management System (VMS)

內部車輛管理系統。Monorepo（npm workspaces / pnpm workspaces 二選一），前端 Vite + React + shadcn/ui，後端 Express + Prisma + Postgres。

---

## 套件管理器

本專案同時支援 **npm** 與 **pnpm**，擇一使用即可：

| | npm | pnpm |
|---|---|---|
| 安裝指令 | `npm install` | `pnpm install` |
| 啟動指令 | `npm run dev` | `npm run dev`（腳本內部仍呼叫 npm） |
| lock 檔 | `package-lock.json` | `pnpm-lock.yaml` |
| 本地套件宣告 | `"@vms/shared": "*"` | `"@vms/shared": "workspace:*"` |

> **注意**：目前 `apps/api` 與 `apps/web` 的 `package.json` 使用 `"@vms/shared": "workspace:*"`（pnpm 必要語法），**npm install 不支援 `workspace:` 協議**，請改用 `pnpm install` 安裝依賴。若需恢復 npm 相容性，請將版本改回 `"*"`。

---

## 一次性安裝

```bash
cp .env.example .env          # 第一次先複製出來、按需修改
cp .env.test.example .env.test # 測試專用：DATABASE_URL 指向獨立的 vms_test（見「測試資料庫」）
docker compose up -d          # 啟 db (Postgres) + pgadmin (5050)
pnpm install                  # 安裝所有 workspace 依賴（本 branch 使用 pnpm）
npm run db:migrate            # 建立 schema
npm run seed                  # 建立第一個 admin（讀 .env 的 SEED_ADMIN_*）
npm run seed:mock             # 選用：塞 30 員工 + 50 車輛模擬資料，方便看 dashboard / 分頁
```

### pnpm 安裝說明

本專案在 pnpm 安裝時需要以下設定（已配置好，無需手動調整）：

| 檔案 | 用途 |
|---|---|
| `pnpm-workspace.yaml` | 宣告 workspace 範圍（`apps/*`, `packages/*`）並批准需要 build script 的套件 |
| `.npmrc` | 說明文件：解釋為何 jest 放在 root devDependencies |

**pnpm v11 預設安全機制**：含有 install script 的套件（Prisma、bcrypt、esbuild 等）需在 `pnpm-workspace.yaml` 的 `allowBuilds` 明確批准才會執行建置。

**jest 置於 root devDependencies**：pnpm workspace 的子套件依賴不會出現在 root `node_modules/`。`apps/api` 的 test script 直接引用 `../../node_modules/jest/bin/jest.js`，因此 jest、ts-jest、@types/jest 移至 root，確保路徑可解析。

**從 npm 切換到 pnpm（已有舊的 node_modules 時）**：pnpm 偵測到 `node_modules` 存在時會跳過安裝。請先清除再重裝：

```bash
rm -rf node_modules apps/api/node_modules apps/web/node_modules packages/shared/node_modules
pnpm install
```

## 日常啟動

先確保 db / pgadmin 在跑：

```bash
docker compose up -d
```

啟動 api + web，兩種擇一：

```bash
# 一鍵：兩邊 log 混在同一終端（concurrently，前綴 [api]/[web]）
npm run dev

# 或 分開兩個終端，各看各的乾淨 log（debug / 讀 log 更清楚）
npm run dev:api   # 終端 A：Express（tsx watch，:8090）
npm run dev:web   # 終端 B：Vite（:3087）
```

`npm run dev` 帶 `--kill-others-on-fail`：任一邊崩了會連帶停掉另一邊，不會留下半殘的 stack。

要停掉：在對應終端按 `Ctrl+C`；docker 服務則 `docker compose down`。

---

## 服務一覽

| 服務 | URL | 帳密 / 備註 |
|---|---|---|
| Web (Vite dev) | http://localhost:3087 | 若 3087 已被占用會自動往上找（3088、3089…），終端會印實際 port |
| API (Express) | http://localhost:8090 | `GET /api/health` 應回 `{"ok":true}` |
| Postgres | localhost:5432 | dev DB `vms`、測試 DB `vms_test`（同一容器）/ user `vms` / password `vms`（見 `.env`） |
| pgAdmin (Postgres Admin 網頁) | http://localhost:5050 | 預設 `admin@example.com` / `admin`（見 `.env` 的 `PGADMIN_DEFAULT_*`） |

> **預設 admin 帳號**（用來登入 Web 的）：`admin` / `admin12345`，由 `npm run seed` 建立（讀 `.env` 的 `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`）。建議第一次登入後馬上到「員工管理」改密碼。

### Port 已被占用時怎麼辦

預設已選用較冷門的 8090 / 3087 以降低衝突。若仍被占用，**只需改根目錄 `.env`**（單一來源，不必動程式）：
1. `API_PORT` 與 `API_TARGET` 要對齊（例：`API_PORT=8091` → `API_TARGET=http://localhost:8091`）。
2. `WEB_PORT` 與 `WEB_ORIGIN` 要對齊（例：`WEB_PORT=3088` → `WEB_ORIGIN=http://localhost:3088`）。
3. 重新 `npm run dev`。

> Vite（web）撞埠會自動往上找一個能用的；但 Express（api）撞埠會直接 `EADDRINUSE` 結束，所以 api 的埠優先挑沒被占用的。`WEB_ORIGIN` 要對齊 web 實際 port，否則 CORS 會擋 cookie。

---

## 測試資料庫（TestDB）

API 測試**不會碰 dev 資料庫**。執行 `npm test` / `npm run test:api` 時：

1. jest 會自動把 `NODE_ENV` 設為 `test`，api 的 `loadDotenv` 因此在 `.env` 之上再疊加 `.env.test`，把 `DATABASE_URL` 切到專屬的 **`vms_test`**（與 dev 同一個 `vms-db` Postgres 容器內的獨立資料庫）。
2. `test` script 會先跑 `db:test:deploy`（`prisma migrate deploy` 打在 `vms_test`），第一次會自動建立該資料庫並套用所有 migration。
3. 每個測試在 `beforeEach` 透過 `resetDb()` truncate `Employee` / `Vehicle` / `AuditLog`，**確保每條測試都從乾淨環境開始**。

**用 pgAdmin 觀察測試結果**：`servers.json` 已預載一條專屬連線 **VMS test (vms_test)**，登入後直接展開 `Servers → VMS test (vms_test) → Databases → vms_test → Schemas → public → Tables` 即可查 `Employee` / `Vehicle` / `AuditLog`。測試殘留資料（最後一條測試造出的列）會留在 `vms_test`，方便事後檢視；下次跑測試時 `beforeEach` 會再清掉。

> **看不到 `vms_test` 或 VMS test 節點？** `vms_test` 由 Postgres 首次初始化腳本（`infra/postgres/init/`）自動建立，既有資料卷不會重跑——跑一次 `npm run test:api` 即會建好。而 `servers.json` 只在 pgAdmin 設定卷首次建立時匯入，若節點沒出現，重置 pgAdmin 設定卷（不影響 Postgres 資料）：
> ```bash
> docker compose rm -sf pgadmin && docker volume rm vms_pgadmin && docker compose up -d pgadmin
> ```
>
> `.env.test` 已被 gitignore（內含 `DATABASE_URL`），請從 `.env.test.example` 複製。若要單獨重置測試 schema：`npm run db:test:reset --workspace apps/api`。

## 使用 pgAdmin

pgAdmin 操作（登入、連 Postgres、手動建 server）詳見 [`infra/pgadmin/README.md`](infra/pgadmin/README.md)。

---

## 預設 Web 操作流程

1. 開 http://localhost:3087（或實際 Vite 印出的 URL）
2. 用 `admin` / `admin12345` 登入
3. Dashboard 應顯示 6 張 card + 3 張 chart（admin 視角）
4. 點左側「員工」可建立新員工（含登入帳號、角色）
5. 點左側「車輛」可建立／編輯／刪除車輛
6. 用建好的 user 帳號（在無痕視窗或別的瀏覽器）登入後：
   - 「員工」連結會消失
   - 「車輛」只看得到 `ownerId = 自己` 的車

---

## 結構

```
apps/
  api/     Express + Prisma（port 8090）
  web/     Vite + React + shadcn/ui（port 3087）
packages/
  shared/  兩邊共用的 zod schema、type、ApiError
infra/
  pgadmin/  pgAdmin 啟動時自動載入的 servers.json + pgpass（含 VMS local / VMS test 兩條 server）
  postgres/ Postgres 首次初始化腳本（init/：自動建立測試 DB vms_test）
docker-compose.yml
openspec/  本專案的需求／設計／規格／任務（OpenSpec）
```

## 常用指令

```bash
npm run dev          # 同時起 api + web（concurrently，--kill-others-on-fail）
npm run dev:api      # 只起 api（Express / tsx watch）
npm run dev:web      # 只起 web（Vite）
npm test             # 跑兩個 app 的測試（api: jest、web: vitest）
npm run test:api     # 只跑 api 測試（jest，需 docker DB 在跑；自動重建測試 DB）
npm run test:web     # 只跑 web 測試（vitest）
npm run lint         # ESLint（整個 repo）
npm run db:migrate   # prisma migrate dev
npm run db:reset     # prisma migrate reset --force（直接重置，不會互動詢問）
npm run db:test:reset # 手動重建測試 DB（vms_test：清空 schema + 重套 migrations）
npm run db:studio    # 開 prisma studio (5555)
npm run seed         # 重新建立 seed admin
npm run seed:mock    # 開發用：保留 ADMIN、清空其他資料，塞 30 員工 + 50 車輛
```

## 測試與測試 DB

API 測試跑在**專屬測試 DB**（`.env` 的 `TEST_DATABASE_URL`，預設同一個 Postgres container 裡的 `vms_test`），不會碰開發用的 `vms`：

- `npm test` / `npm run test:api` 會先自動重建測試 DB（清空 schema + 重套全部 migrations），確保每次都是乾淨環境。
- 測試結束後，最後一個測試留下的資料會保留在 `vms_test`，可直接在 pgAdmin（http://localhost:5050 → VMS local → Databases → `vms_test`）觀察。
- 直接用 jest 跑單一測試檔不會觸發重建，但仍然連到 `vms_test`；若該 DB 還不存在，先跑一次 `npm run db:test:reset`。
- 防呆：`TEST_DATABASE_URL` 的資料庫名稱必須包含 `test`，否則測試會直接報錯，避免誤砍開發資料。

## 規格與設計

- 各 capability 目前的規格（已 sync）位於 `openspec/specs/{auth,dashboard,employees,vehicles}/spec.md`
- 歷史 change（含 proposal、design、tasks、delta specs）位於 `openspec/changes/archive/`
- 新需求請走 OpenSpec workflow（`.cursor/skills/` 與 `openspec-*` / `opsx:*` skills）開 change，不要直接手改主 specs

## 內建 Skills

`.agents/skills/` 下保留多個 OpenSpec 工作流 Skill，可用於後續 change 的提案、實作、驗證、封存。
