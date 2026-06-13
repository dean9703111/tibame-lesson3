-- 自動建立測試專用資料庫 vms_test（與 dev 的 vms 同一個 Postgres 容器、不同 DB）。
-- 僅在 Postgres「資料卷首次初始化」時執行（docker-entrypoint-initdb.d 規則：
-- data 目錄為空才會跑）。表結構由 `npm run test:api`（prisma migrate deploy）建立，
-- 這支只負責確保「資料庫存在」，好讓 pgAdmin 的 VMS test 節點一開機就連得上。
SELECT 'CREATE DATABASE vms_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vms_test')\gexec
