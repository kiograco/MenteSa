export type Screen =
  | "landing" | "directory" | "profile" | "patient-dashboard"
  | "pro-dashboard" | "calendar" | "patients" | "ehr" | "ai-assistant"
  | "video" | "pricing" | "checkout" | "financial" | "library" | "admin" | "login"
  | "reset-password" | "professional-settings" | "confirm-attendance";

export type RouteParams = {
  professionalId?: string | null;
  appointmentId?: string | null;
  confirmationToken?: string | null;
};

const SCREEN_TO_PATH: Record<Screen, string> = {
  landing: "/",
  directory: "/diretorio",
  profile: "/perfil",
  login: "/entrar",
  "reset-password": "/redefinir-senha",
  "patient-dashboard": "/paciente",
  "pro-dashboard": "/profissional",
  calendar: "/profissional/agenda",
  patients: "/profissional/pacientes",
  ehr: "/profissional/prontuarios",
  "ai-assistant": "/profissional/ia",
  financial: "/profissional/financeiro",
  library: "/profissional/biblioteca",
  "professional-settings": "/profissional/configuracoes",
  video: "/video",
  pricing: "/precos",
  checkout: "/checkout",
  admin: "/admin",
  "confirm-attendance": "/confirmar",
};

/** Builds the URL path for a screen, embedding an id where the screen needs one to be restorable
 *  on refresh/deep-link (profile needs the professional, video needs the appointment). */
export function screenToPath(screen: Screen, params: RouteParams = {}): string {
  const base = SCREEN_TO_PATH[screen];
  if (screen === "profile" && params.professionalId) return `${base}/${params.professionalId}`;
  if (screen === "video" && params.appointmentId) return `${base}/${params.appointmentId}`;
  if (screen === "confirm-attendance" && params.confirmationToken) return `${base}/${params.confirmationToken}`;
  return base;
}

/** Inverse of screenToPath. Returns null for an unrecognized path (caller should fall back to "landing"). */
export function pathToScreen(pathname: string): { screen: Screen; professionalId?: string; appointmentId?: string; confirmationToken?: string } | null {
  const segments = pathname.split("/").filter(Boolean);

  // "Definir senha" is where a patient invite email (create-patient-account) lands — it reuses the
  // "esqueci minha senha" screen since both just need an authenticated session to call
  // supabase.auth.updateUser({ password }); the only difference is how that session was created.
  if (segments[0] === "definir-senha") return { screen: "reset-password" };
  if (segments[0] === "perfil") return { screen: "profile", professionalId: segments[1] };
  if (segments[0] === "video") return { screen: "video", appointmentId: segments[1] };
  if (segments[0] === "confirmar") return { screen: "confirm-attendance", confirmationToken: segments[1] };
  if (segments[0] === "profissional" && segments[1] === "agenda") return { screen: "calendar" };
  if (segments[0] === "profissional" && segments[1] === "pacientes") return { screen: "patients" };
  if (segments[0] === "profissional" && segments[1] === "prontuarios") return { screen: "ehr" };
  if (segments[0] === "profissional" && segments[1] === "ia") return { screen: "ai-assistant" };
  if (segments[0] === "profissional" && segments[1] === "financeiro") return { screen: "financial" };
  if (segments[0] === "profissional" && segments[1] === "biblioteca") return { screen: "library" };
  if (segments[0] === "profissional" && segments[1] === "configuracoes") return { screen: "professional-settings" };

  const entry = (Object.entries(SCREEN_TO_PATH) as [Screen, string][]).find(([, path]) => path === `/${segments.join("/")}`);
  return entry ? { screen: entry[0] } : null;
}
