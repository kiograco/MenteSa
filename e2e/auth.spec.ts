import { test, expect } from "@playwright/test";
import { DEMO_PATIENT, DEMO_PROFESSIONAL, loginAs } from "./helpers";

test.describe("Login", () => {
  test("shows an error for invalid credentials", async ({ page }) => {
    await loginAs(page, { email: DEMO_PATIENT.email, password: "wrong-password" });
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("logs a patient in and redirects to the patient dashboard", async ({ page }) => {
    await loginAs(page, DEMO_PATIENT);
    await expect(page).toHaveURL(/\/paciente/);
    await expect(page.getByText(`Olá,`)).toBeVisible();
    await expect(page.getByText(DEMO_PATIENT.fullName.split(" ")[0])).toBeVisible();
  });

  test("logs a professional in and redirects to the professional dashboard", async ({ page }) => {
    await loginAs(page, DEMO_PROFESSIONAL);
    await expect(page).toHaveURL(/\/profissional$/);
  });
});
