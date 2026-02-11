import { GatewayResponseError, type GatewayClient } from "@/lib/gateway/GatewayClient";
import { isLocalGatewayUrl } from "@/lib/gateway/local-gateway";

type GatewayConfigSnapshot = {
  config?: Record<string, unknown>;
  hash?: string;
  exists?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const shouldRetryConfigWrite = (err: unknown) => {
  if (!(err instanceof GatewayResponseError)) return false;
  return /re-run config\.get|config changed since last load/i.test(err.message);
};

export async function ensureGatewayReloadModeHotForLocalStudio(params: {
  client: GatewayClient;
  upstreamGatewayUrl: string;
}): Promise<void> {
  if (!isLocalGatewayUrl(params.upstreamGatewayUrl)) {
    return;
  }

  const attemptWrite = async (attempt: number): Promise<void> => {
    const snapshot = await params.client.call<GatewayConfigSnapshot>("config.get", {});
    const exists = snapshot.exists !== false;
    const baseHash = exists ? snapshot.hash?.trim() : undefined;
    if (exists && !baseHash) {
      throw new Error("Gateway config hash unavailable; re-run config.get.");
    }

    const baseConfig = isRecord(snapshot.config) ? snapshot.config : {};
    const gateway = isRecord(baseConfig.gateway) ? baseConfig.gateway : {};
    const reload = isRecord(gateway.reload) ? gateway.reload : {};
    const mode = typeof reload.mode === "string" ? reload.mode.trim() : "";

    if (mode === "hot" || mode === "off") {
      return;
    }

    const nextConfig: Record<string, unknown> = {
      ...baseConfig,
      gateway: {
        ...gateway,
        reload: {
          ...reload,
          mode: "hot",
        },
      },
    };

    const payload: Record<string, unknown> = {
      raw: JSON.stringify(nextConfig, null, 2),
    };
    if (baseHash) {
      payload.baseHash = baseHash;
    }

    try {
      await params.client.call("config.set", payload);
    } catch (err) {
      if (attempt < 1 && shouldRetryConfigWrite(err)) {
        await attemptWrite(attempt + 1);
        return;
      }
      throw err;
    }
  };

  await attemptWrite(0);
}

