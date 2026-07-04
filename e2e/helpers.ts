import type { Page } from "@playwright/test";

export const DEMO_PATIENT = { email: "paciente.demo@mindcare.test", password: "MindCare123!", fullName: "Ana Demo Paciente" };
export const DEMO_PROFESSIONAL = { email: "fernanda.demo@mindcare.test", password: "MindCare123!", fullName: "Dra. Fernanda Demo" };

/** Logs in through the real UI (not a session shortcut) so each test also exercises the actual
 *  auth form + redirect-by-role logic in App(). */
export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto("/entrar");
  await page.getByPlaceholder("seu@email.com").fill(user.email);
  await page.getByPlaceholder("••••••••").fill(user.password);
  // "Entrar" also labels the Entrar/Cadastrar mode tab above the form — the submit button is the
  // second (last) match in DOM order.
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
}
