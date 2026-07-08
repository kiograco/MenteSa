// Sends one WhatsApp template message via the Meta Cloud API (official, no third-party
// intermediary — the provider the team picked over Twilio/Z-API). Meta requires the message body
// to come from a template pre-approved in Meta Business Manager whenever it's sent outside a 24h
// window the user themselves opened, which is always true for a reminder we send unprompted — so
// this can never send arbitrary free text, only the approved template named by
// WHATSAPP_TEMPLATE_NAME with the appointment details as template variables.
export async function sendAppointmentReminderWhatsApp(phone: string, patientName: string, professionalName: string, scheduledLabel: string): Promise<boolean> {
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  if (!phoneNumberId || !accessToken || !templateName) return false; // Not configured — best-effort, never blocks the sweep.

  const digitsOnly = phone.replace(/\D/g, "");
  if (!digitsOnly) return false;
  // Brazilian numbers are stored locally without the country code; the Cloud API needs E.164.
  const to = digitsOnly.startsWith("55") ? digitsOnly : `55${digitsOnly}`;

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: patientName },
                { type: "text", text: professionalName },
                { type: "text", text: scheduledLabel },
              ],
            },
          ],
        },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Same Cloud API call as sendAppointmentReminderWhatsApp, but its own pre-approved template
 *  (WHATSAPP_BIRTHDAY_TEMPLATE_NAME) — Meta templates are approved with a fixed wording/parameter
 *  count, so a birthday greeting can't reuse the appointment-reminder template. */
export async function sendBirthdayGreetingWhatsApp(phone: string, patientName: string, professionalName: string): Promise<boolean> {
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = Deno.env.get("WHATSAPP_BIRTHDAY_TEMPLATE_NAME");
  if (!phoneNumberId || !accessToken || !templateName) return false;

  const digitsOnly = phone.replace(/\D/g, "");
  if (!digitsOnly) return false;
  const to = digitsOnly.startsWith("55") ? digitsOnly : `55${digitsOnly}`;

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: patientName },
                { type: "text", text: professionalName },
              ],
            },
          ],
        },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
