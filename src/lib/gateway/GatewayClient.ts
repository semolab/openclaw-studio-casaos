import {
  GatewayBrowserClient,
  type GatewayHelloOk,
} from "./openclaw/GatewayBrowserClient";

export type ReqFrame = {
  type: "req";
  id: string;
  method: string;
  params: unknown;
};

export type ResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

export type GatewayStateVersion = {
  presence: number;
  health: number;
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: GatewayStateVersion;
};

export type GatewayFrame = ReqFrame | ResFrame | EventFrame;

export const parseGatewayFrame = (raw: string): GatewayFrame | null => {
  try {
    return JSON.parse(raw) as GatewayFrame;
  } catch {
    return null;
  }
};

export const buildAgentMainSessionKey = (agentId: string, mainKey: string) => {
  const trimmedAgent = agentId.trim();
  const trimmedKey = mainKey.trim() || "main";
  return `agent:${trimmedAgent}:${trimmedKey}`;
};

export const parseAgentIdFromSessionKey = (sessionKey: string): string | null => {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : null;
};

export const isSameSessionKey = (a: string, b: string) => {
  const left = a.trim();
  const right = b.trim();
  return left.length > 0 && left === right;
};

type StatusHandler = (status: GatewayStatus) => void;

type EventHandler = (event: EventFrame) => void;

export type GatewayStatus = "disconnected" | "connecting" | "connected";

export type GatewayConnectOptions = {
  gatewayUrl: string;
  token?: string;
};

export type GatewayErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

export class GatewayResponseError extends Error {
  code: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;

  constructor(payload: GatewayErrorPayload) {
    super(payload.message || "Gateway request failed");
    this.name = "GatewayResponseError";
    this.code = payload.code;
    this.details = payload.details;
    this.retryable = payload.retryable;
    this.retryAfterMs = payload.retryAfterMs;
  }
}

export class GatewayClient {
  private client: GatewayBrowserClient | null = null;
  private statusHandlers = new Set<StatusHandler>();
  private eventHandlers = new Set<EventHandler>();
  private status: GatewayStatus = "disconnected";
  private pendingConnect: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private manualDisconnect = false;
  private lastHello: GatewayHelloOk | null = null;

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  onEvent(handler: EventHandler) {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async connect(options: GatewayConnectOptions) {
    if (!options.gatewayUrl.trim()) {
      throw new Error("Gateway URL is required.");
    }
    if (this.client) {
      throw new Error("Gateway is already connected or connecting.");
    }

    this.manualDisconnect = false;
    this.updateStatus("connecting");

    this.pendingConnect = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });

    this.client = new GatewayBrowserClient({
      url: options.gatewayUrl,
      token: options.token,
      onHello: (hello) => {
        this.lastHello = hello;
        this.updateStatus("connected");
        this.resolveConnect?.();
        this.clearConnectPromise();
      },
      onEvent: (event) => {
        this.eventHandlers.forEach((handler) => handler(event));
      },
      onClose: ({ code, reason }) => {
        const err = new Error(`Gateway closed (${code}): ${reason}`);
        if (this.rejectConnect) {
          this.rejectConnect(err);
          this.clearConnectPromise();
        }
        this.updateStatus(this.manualDisconnect ? "disconnected" : "connecting");
        if (this.manualDisconnect) {
          console.info("Gateway disconnected.");
        }
      },
      onGap: ({ expected, received }) => {
        console.warn(`Gateway event gap expected ${expected}, received ${received}.`);
      },
    });

    this.client.start();

    try {
      await this.pendingConnect;
    } catch (err) {
      this.client.stop();
      this.client = null;
      this.updateStatus("disconnected");
      throw err;
    }
  }

  disconnect() {
    if (!this.client) {
      return;
    }

    this.manualDisconnect = true;
    this.client.stop();
    this.client = null;
    this.clearConnectPromise();
    this.updateStatus("disconnected");
    console.info("Gateway disconnected.");
  }

  async call<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!method.trim()) {
      throw new Error("Gateway method is required.");
    }
    if (!this.client || !this.client.connected) {
      throw new Error("Gateway is not connected.");
    }

    const payload = await this.client.request<T>(method, params);
    return payload as T;
  }

  getLastHello() {
    return this.lastHello;
  }

  private updateStatus(status: GatewayStatus) {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private clearConnectPromise() {
    this.pendingConnect = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }
}

export const isGatewayDisconnectLikeError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (!msg) return false;
  if (
    msg.includes("gateway not connected") ||
    msg.includes("gateway is not connected") ||
    msg.includes("gateway client stopped")
  ) {
    return true;
  }

  const match = msg.match(/gateway closed \\((\\d+)\\)/);
  if (!match) return false;
  const code = Number(match[1]);
  return Number.isFinite(code) && code === 1012;
};

type SessionSettingsPatchPayload = {
  key: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export type SyncGatewaySessionSettingsParams = {
  client: GatewayClient;
  sessionKey: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export const syncGatewaySessionSettings = async ({
  client,
  sessionKey,
  model,
  thinkingLevel,
}: SyncGatewaySessionSettingsParams) => {
  const key = sessionKey.trim();
  if (!key) {
    throw new Error("Session key is required.");
  }
  const includeModel = model !== undefined;
  const includeThinkingLevel = thinkingLevel !== undefined;
  if (!includeModel && !includeThinkingLevel) {
    throw new Error("At least one session setting must be provided.");
  }
  const payload: SessionSettingsPatchPayload = { key };
  if (includeModel) {
    payload.model = model ?? null;
  }
  if (includeThinkingLevel) {
    payload.thinkingLevel = thinkingLevel ?? null;
  }
  await client.call("sessions.patch", payload);
};
