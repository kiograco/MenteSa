// Lets the admin panel suspend/reactivate/delete a patient or professional account. These are
// auth.admin operations (ban, delete user) that only work with the service role key, so they
// can't be done directly from the client — this function checks the caller is an admin, then
// performs the action with a service-role client.
// Deploy: supabase functions deploy admin-manage-user
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

type Action = "suspend" | "unsuspend" | "delete";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { action, userId } = (await req.json()) as { action: Action; userId: string };
    if (!action || !userId) return json({ error: "action and userId are required." }, 400);
    if (!["suspend", "unsuspend", "delete"].includes(action)) return json({ error: "Invalid action." }, 400);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") return json({ error: "Acesso negado." }, 403);

    if (userId === userData.user.id) {
      return json({ error: "Você não pode aplicar essa ação à sua própria conta." }, 400);
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (!targetProfile) return json({ error: "Usuário não encontrado." }, 404);
    if (targetProfile.role === "admin") return json({ error: "Não é possível aplicar essa ação a outro administrador." }, 400);

    if (action === "suspend") {
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "87600h" });
      if (error) return json({ error: error.message }, 500);
      await adminClient.from("profiles").update({ suspended_at: new Date().toISOString() }).eq("id", userId);
      return json({ ok: true });
    }

    if (action === "unsuspend") {
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return json({ error: error.message }, 500);
      await adminClient.from("profiles").update({ suspended_at: null }).eq("id", userId);
      return json({ ok: true });
    }

    // delete — cascades to professional_profiles/appointments/etc. via FK "on delete cascade"
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
