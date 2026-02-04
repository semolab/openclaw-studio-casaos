import { fetchJson } from "@/lib/http";
import type { StudioSettingsPatch } from "@/lib/studio/settings";
import {
  StudioSettingsCoordinator,
  type StudioSettingsResponse,
} from "@/lib/studio/coordinator";

let studioSettingsCoordinator: StudioSettingsCoordinator | null = null;

export const fetchStudioSettings = async (): Promise<StudioSettingsResponse> => {
  return fetchJson<StudioSettingsResponse>("/api/studio", { cache: "no-store" });
};

export const updateStudioSettings = async (
  patch: StudioSettingsPatch
): Promise<StudioSettingsResponse> => {
  return fetchJson<StudioSettingsResponse>("/api/studio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
};

export const getStudioSettingsCoordinator = (): StudioSettingsCoordinator => {
  if (studioSettingsCoordinator) {
    return studioSettingsCoordinator;
  }
  studioSettingsCoordinator = new StudioSettingsCoordinator({
    fetchSettings: fetchStudioSettings,
    updateSettings: updateStudioSettings,
  });
  return studioSettingsCoordinator;
};

export const resetStudioSettingsCoordinator = () => {
  if (!studioSettingsCoordinator) return;
  studioSettingsCoordinator.dispose();
  studioSettingsCoordinator = null;
};
