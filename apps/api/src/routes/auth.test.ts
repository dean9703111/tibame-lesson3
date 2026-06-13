import request from "supertest";
import { buildApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { disconnect, resetDb } from "../test/setup.js";
import { makeEmployee } from "../test/factories.js";
import { loginAs } from "../test/helpers.js";

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

describe("auth", () => {
  describe("成功登入", () => {
    test("正確帳密 → 200、回傳 user + csrfToken、不含 passwordHash、Set-Cookie 為 HttpOnly", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "password123" });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("USER");
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.csrfToken).toEqual(expect.any(String));
      expect(res.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/i);
    });

    test("成功登入後重置 failedLoginCount 與 lockedUntil", async () => {
      const emp = await makeEmployee({ username: "alice", password: "password123" });
      await prisma.employee.update({
        where: { id: emp.id },
        data: { failedLoginCount: 3 },
      });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "password123" });
      expect(res.status).toBe(200);
      const after = await prisma.employee.findUnique({ where: { id: emp.id } });
      expect(after?.failedLoginCount).toBe(0);
      expect(after?.lockedUntil).toBeNull();
    });
  });

  describe("登入失敗", () => {
    test("密碼錯誤 → 401 INVALID_CREDENTIALS", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "wrong" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    test("帳號不存在 → 401 INVALID_CREDENTIALS（不洩漏帳號是否存在）", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "ghost", password: "whatever" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    test("缺少必填欄位 → 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("帳號鎖定", () => {
    test("連續 5 次密碼錯誤 → 鎖定帳號（failedLoginCount=5、lockedUntil 在未來）", async () => {
      const emp = await makeEmployee({ username: "alice", password: "password123" });
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({ username: "alice", password: "wrong" });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      }
      const after = await prisma.employee.findUnique({ where: { id: emp.id } });
      expect(after?.failedLoginCount).toBe(5);
      expect(after?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    });

    test("鎖定後即使密碼正確 → 401 ACCOUNT_LOCKED 並回傳 unlockAt", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/login")
          .send({ username: "alice", password: "wrong" });
      }
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "password123" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
      expect(res.body.error.details.unlockAt).toEqual(expect.any(String));
    });

    test("第 4 次失敗尚未鎖定", async () => {
      const emp = await makeEmployee({ username: "alice", password: "password123" });
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({ username: "alice", password: "wrong" });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      }
      const after = await prisma.employee.findUnique({ where: { id: emp.id } });
      expect(after?.failedLoginCount).toBe(4);
      expect(after?.lockedUntil).toBeNull();
    });
  });

  describe("帳號狀態", () => {
    test("INACTIVE 帳號無法登入 → 401 ACCOUNT_INACTIVE", async () => {
      await makeEmployee({ username: "alice", password: "password123", status: "INACTIVE" });
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "password123" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("Session 驗證", () => {
    test("GET /api/auth/me 無 cookie → 401 UNAUTHENTICATED", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    test("GET /api/auth/me 帶有效 cookie → 200、回傳使用者資料", async () => {
      const emp = await makeEmployee({ username: "alice", password: "password123" });
      const session = await loginAs(app, "alice");
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", session.cookies);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(emp.email);
    });

    // 重整後前端只剩 cookie（csrfToken 是純記憶體、不持久化）。/me 必須回傳可用的
    // csrfToken，否則登出請求會缺 CSRF token 被擋下，cookie 清不掉、仍能用網址進內頁。
    test("GET /api/auth/me 回傳的 csrfToken 可用於登出", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      const session = await loginAs(app, "alice");
      const me = await request(app).get("/api/auth/me").set("Cookie", session.cookies);
      expect(me.status).toBe(200);
      expect(me.body.csrfToken).toEqual(expect.any(String));
      const out = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", session.cookies)
        .set("X-CSRF-Token", me.body.csrfToken);
      expect(out.status).toBe(204);
    });
  });

  describe("登出與 CSRF", () => {
    test("登出缺少 X-CSRF-Token → 403 CSRF_TOKEN_MISSING", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      const session = await loginAs(app, "alice");
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", session.cookies);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CSRF_TOKEN_MISSING");
    });

    test("登出帶正確 X-CSRF-Token → 204", async () => {
      await makeEmployee({ username: "alice", password: "password123" });
      const session = await loginAs(app, "alice");
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", session.cookies)
        .set("X-CSRF-Token", session.csrf);
      expect(res.status).toBe(204);
    });
  });

  describe("路由限制", () => {
    test("POST /api/auth/register → 404（未提供註冊功能）", async () => {
      const res = await request(app).post("/api/auth/register").send({});
      expect(res.status).toBe(404);
    });
  });
});
