import { describe, expect, it } from "vitest";
import { pathToScreen, screenToPath } from "./routing";

describe("screenToPath", () => {
  it("maps simple screens to their fixed path", () => {
    expect(screenToPath("landing")).toBe("/");
    expect(screenToPath("directory")).toBe("/diretorio");
    expect(screenToPath("pro-dashboard")).toBe("/profissional");
  });

  it("embeds the professional id for profile", () => {
    expect(screenToPath("profile", { professionalId: "abc-123" })).toBe("/perfil/abc-123");
  });

  it("falls back to the bare path when no id is available yet", () => {
    expect(screenToPath("profile")).toBe("/perfil");
    expect(screenToPath("video")).toBe("/video");
  });

  it("embeds the appointment id for video", () => {
    expect(screenToPath("video", { appointmentId: "appt-1" })).toBe("/video/appt-1");
  });
});

describe("pathToScreen", () => {
  it("round-trips simple screens", () => {
    expect(pathToScreen("/")).toEqual({ screen: "landing" });
    expect(pathToScreen("/diretorio")).toEqual({ screen: "directory" });
    expect(pathToScreen("/profissional")).toEqual({ screen: "pro-dashboard" });
  });

  it("recovers the id embedded in the path", () => {
    expect(pathToScreen("/perfil/abc-123")).toEqual({ screen: "profile", professionalId: "abc-123" });
    expect(pathToScreen("/video/appt-1")).toEqual({ screen: "video", appointmentId: "appt-1" });
  });

  it("resolves the nested professional sub-routes", () => {
    expect(pathToScreen("/profissional/agenda")).toEqual({ screen: "calendar" });
    expect(pathToScreen("/profissional/prontuarios")).toEqual({ screen: "ehr" });
    expect(pathToScreen("/profissional/ia")).toEqual({ screen: "ai-assistant" });
    expect(pathToScreen("/profissional/financeiro")).toEqual({ screen: "financial" });
  });

  it("returns null for an unrecognized path", () => {
    expect(pathToScreen("/nao-existe")).toBeNull();
  });
});
