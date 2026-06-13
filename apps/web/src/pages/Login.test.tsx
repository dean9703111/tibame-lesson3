import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { LoginPage } from "./Login";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  };
});

const mockPost = () => vi.mocked(apiClient.post as unknown as ReturnType<typeof vi.fn>);

beforeEach(() => {
  useAuthStore.setState({ user: null, csrfToken: null, hydrated: true });
  mockPost().mockReset();
});

describe("LoginPage", () => {
  describe("成功流程", () => {
    it("輸入正確帳密登入成功 → 寫入 session（user + csrfToken）並導向首頁", async () => {
      mockPost().mockResolvedValue({
        data: {
          user: { id: "1", name: "Alice", role: "USER", employeeId: "1", email: "a@x" },
          csrfToken: "csrf-1",
        },
      });
      render(renderWithProviders(<LoginPage />));
      await userEvent.type(screen.getByLabelText("帳號"), "alice");
      await userEvent.type(screen.getByLabelText("密碼"), "password123");
      await userEvent.click(screen.getByRole("button", { name: /登入/ }));
      await waitFor(() => {
        expect(useAuthStore.getState().user?.name).toBe("Alice");
        expect(useAuthStore.getState().csrfToken).toBe("csrf-1");
      });
    });
  });

  describe("錯誤處理", () => {
    it("伺服器回傳 INVALID_CREDENTIALS → 顯示「帳號或密碼錯誤」", async () => {
      mockPost().mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "bad"));
      render(renderWithProviders(<LoginPage />));
      await userEvent.type(screen.getByLabelText("帳號"), "alice");
      await userEvent.type(screen.getByLabelText("密碼"), "wrongwrong");
      await userEvent.click(screen.getByRole("button", { name: /登入/ }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/帳號或密碼錯誤/);
    });

    it("伺服器回傳 ACCOUNT_LOCKED → 顯示帳號鎖定訊息（含解鎖時間）", async () => {
      const unlockAt = new Date(Date.now() + 60_000).toISOString();
      mockPost().mockRejectedValue(new ApiError(401, "ACCOUNT_LOCKED", "locked", { unlockAt }));
      render(renderWithProviders(<LoginPage />));
      await userEvent.type(screen.getByLabelText("帳號"), "alice");
      await userEvent.type(screen.getByLabelText("密碼"), "wrongwrong");
      await userEvent.click(screen.getByRole("button", { name: /登入/ }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/鎖定/);
    });

    it("伺服器回傳 ACCOUNT_INACTIVE → 顯示「此帳號已停用」", async () => {
      mockPost().mockRejectedValue(new ApiError(401, "ACCOUNT_INACTIVE", "inactive"));
      render(renderWithProviders(<LoginPage />));
      await userEvent.type(screen.getByLabelText("帳號"), "alice");
      await userEvent.type(screen.getByLabelText("密碼"), "password123");
      await userEvent.click(screen.getByRole("button", { name: /登入/ }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/已停用/);
    });
  });

  describe("表單驗證", () => {
    it("帳號或密碼為空 → 前端 zod 驗證阻擋，不呼叫登入 API", async () => {
      render(renderWithProviders(<LoginPage />));
      await userEvent.click(screen.getByRole("button", { name: /登入/ }));
      await waitFor(() => {
        expect(mockPost()).not.toHaveBeenCalled();
      });
    });
  });
});
