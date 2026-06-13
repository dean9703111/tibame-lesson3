import dotenv from "dotenv";
import path from "node:path";

// 從 repo 根載入共享 .env。所有 api script（dev / start / seed / db:* / test）
// 的 cwd 都是 apps/api，因此 ../../.env 一律指向 repo 根目錄。
const root = path.resolve(process.cwd(), "../..");
dotenv.config({ path: path.join(root, ".env") });

// 測試環境（jest 會自動設定 NODE_ENV=test）再疊加 .env.test，override 既有值，
// 把 DATABASE_URL 切到專屬 TestDB（vms_test），避免測試污染 dev 資料庫。
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: path.join(root, ".env.test"), override: true });
}
