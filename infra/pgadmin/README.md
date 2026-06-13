# pgAdmin（Postgres Admin 網頁）

`docker compose up -d` 會一併啟動 pgAdmin（http://localhost:5050）。

## 登入

- Email：`admin@example.com`
- Password：`admin`

（這兩個值定義在根 `.env` 的 `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`，可自行修改）

## 連到 Postgres

**不需要手動 add server**。pgAdmin 啟動時已自動從 `servers.json` 載入**兩條**連線，並透過 `pgpass` 預載密碼：

- **VMS local** → maintenance DB `vms`（日常開發資料）
- **VMS test (vms_test)** → maintenance DB `vms_test`（API 測試專用，見根 README「測試資料庫」）

登入後直接：

1. 左側 server tree 展開 **Servers → VMS local**（或 **VMS test (vms_test)**）
2. 展開 **Databases → vms（或 vms_test）→ Schemas → public → Tables**
3. 可以看到 `Employee`、`Vehicle`、`AuditLog` 三張表
4. 對著 table 按右鍵 → **View/Edit Data → All Rows** 即可查資料

> **看不到 vms_test？** `servers.json` 只在 pgAdmin **設定卷首次建立時**匯入。若你是在加入這條 server 之前就跑過 pgAdmin，需重置 pgAdmin 設定卷讓它重新匯入（不影響 Postgres 資料）：
> ```bash
> docker compose rm -sf pgadmin && docker volume rm vms_pgadmin && docker compose up -d pgadmin
> ```
> 另外，`vms_test` 由 Postgres 首次初始化時的 `infra/postgres/init/` 腳本自動建立；既有資料卷不會重跑該腳本，但只要跑過一次 `npm run test:api`（會 `prisma migrate deploy` 到 `vms_test`）即會存在。

## 如果要手動建立 Server（萬一 servers.json 沒生效）

按左側 Servers → 右鍵 → Register → Server，填：

| 分頁 | 欄位 | 值 |
|---|---|---|
| General | Name | 任意，例如 `VMS local` |
| Connection | Host name/address | **`db`**（這是 docker network 內的服務名，不是 `localhost`） |
| Connection | Port | `5432` |
| Connection | Maintenance database | `vms` |
| Connection | Username | `vms` |
| Connection | Password | `vms`（勾「Save password」省得每次再輸入） |

> 如果你是從 **host machine 直接連**（例如 `psql`、TablePlus、DBeaver），則用 `localhost:5432` / `vms` / `vms` / `vms`。`db` 這個 hostname 只在 docker compose network 內有效。
