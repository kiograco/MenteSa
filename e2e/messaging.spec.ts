import { test, expect } from "@playwright/test";
import { DEMO_PATIENT, DEMO_PROFESSIONAL, loginAs } from "./helpers";

// Ana and Fernanda already have a seeded appointment (supabase/seed.sql), which is what the
// messages_insert_participants RLS policy requires before either side can message the other.
test("patient and professional exchange a message", async ({ browser }) => {
  const patientContext = await browser.newContext();
  const professionalContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const professionalPage = await professionalContext.newPage();

  const outgoing = `Olá! Mensagem de teste E2E ${Date.now()}`;
  const reply = `Recebido, obrigada! ${Date.now()}`;

  await test.step("patient sends a message to the professional", async () => {
    await loginAs(patientPage, DEMO_PATIENT);
    await expect(patientPage).toHaveURL(/\/paciente/);
    // "Mensagens" labels both the sidebar nav item and the in-page tab button (same action) —
    // the sidebar one renders first in the DOM.
    await patientPage.getByRole("button", { name: "Mensagens" }).first().click();
    await expect(patientPage.getByText(DEMO_PROFESSIONAL.fullName).first()).toBeVisible();
    await patientPage.getByPlaceholder("Escreva uma mensagem...").fill(outgoing);
    await patientPage.getByPlaceholder("Escreva uma mensagem...").press("Enter");
    // Also shows up as the conversation-list preview snippet — the chat bubble is the last match.
    await expect(patientPage.getByText(outgoing).last()).toBeVisible();
  });

  await test.step("professional sees the message and replies", async () => {
    await loginAs(professionalPage, DEMO_PROFESSIONAL);
    await expect(professionalPage).toHaveURL(/\/profissional$/);
    await professionalPage.goto("/profissional/pacientes");
    await expect(professionalPage.getByText(DEMO_PATIENT.fullName).first()).toBeVisible();
    await professionalPage.getByText(DEMO_PATIENT.fullName).first().click();
    // The outgoing text also appears as the conversation-list preview snippet — the chat bubble
    // is the last match in DOM order (list column renders before the thread column).
    await expect(professionalPage.getByText(outgoing).last()).toBeVisible({ timeout: 10_000 });

    await professionalPage.getByPlaceholder("Escreva uma mensagem...").fill(reply);
    await professionalPage.getByPlaceholder("Escreva uma mensagem...").press("Enter");
    await expect(professionalPage.getByText(reply).last()).toBeVisible();
  });

  await test.step("patient receives the reply", async () => {
    await expect(patientPage.getByText(reply).last()).toBeVisible({ timeout: 10_000 });
  });

  await patientContext.close();
  await professionalContext.close();
});
