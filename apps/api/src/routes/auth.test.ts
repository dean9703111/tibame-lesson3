import request from "supertest";
import { buildApp } from "../app.js";
import { disconnect, resetDb } from "../test/setup.js";
import { makeEmployee } from "../test/factories.js";
import { loginAs } from "../test/helpers.js";
import { prisma } from "../db/prisma.js";

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

// 登入(POST /api/auth/login)的案例已整併至 login.test.ts(對應 doc/test/backend/login.md)。
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

  test("GET /api/auth/me without cookie -> 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
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
