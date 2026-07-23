import { test, expect } from "@playwright/test";
import { DEMO_PATIENT, DEMO_PROFESSIONAL, loginAs } from "./helpers";

test("patient books a session with a verified professional and pays (mock provider)", async ({ page }) => {
  await loginAs(page, DEMO_PATIENT);
  await expect(page).toHaveURL(/\/paciente/);

  await page.goto("/diretorio");
  await expect(page.getByText(`${DEMO_PROFESSIONAL.fullName.split(" ").slice(-1)}`).first()).toBeVisible();
  await page.getByText(DEMO_PROFESSIONAL.fullName).first().click();

  await expect(page).toHaveURL(/\/perfil\//);
  await page.getByRole("button", { name: "Agendar sessão" }).click();

  // Pick the first day, then the first slot that isn't already taken (struck-through / disabled
  // styling has no accessible signal, so filter by the "occupied" title Attribute the app sets).
  const dayButtons = page.locator("div.grid.grid-cols-5 button");
  await expect(dayButtons.first()).toBeVisible();
  await dayButtons.first().click();

  // Taken slots get a `title` attribute (occupied — click to join the waitlist instead); pick the
  // first slot that doesn't have one.
  const availableSlot = page.locator("div.grid.grid-cols-4 button:not([title])").first();
  await expect(availableSlot).toBeVisible();
  await availableSlot.click();

  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page).toHaveURL(/\/checkout/);

  // Step 1: dados pessoais
  await page.getByPlaceholder("Ana Beatriz").fill(DEMO_PATIENT.fullName);
  await page.getByPlaceholder("000.000.000-00").fill("123.456.789-00");
  await page.getByPlaceholder("ana@email.com").fill(DEMO_PATIENT.email);
  await page.getByPlaceholder("(11) 99999-9999").fill("(11) 90000-0001");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 2: consentimento (skips straight to "já assinado" if a prior test already signed it)
  const alreadySigned = page.getByText("Não é preciso assinar de novo.");
  if (await alreadySigned.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Continuar" }).click();
  } else {
    await page.getByPlaceholder(DEMO_PATIENT.fullName).fill(DEMO_PATIENT.fullName);
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Assinar e continuar" }).click();
  }

  // Step 3: pagamento — sem chave do Asaas configurada localmente, cai no provedor mock.
  await expect(page.getByText("Forma de pagamento")).toBeVisible();
  await page.getByRole("button", { name: "Pagar com segurança" }).click();

  // Step 4: confirmação
  await expect(page.getByText("Pagamento confirmado!")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(DEMO_PROFESSIONAL.fullName).first()).toBeVisible();
});
