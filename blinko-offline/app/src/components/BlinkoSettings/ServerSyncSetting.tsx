import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Input, Switch, Divider } from "@heroui/react";
import { useTranslation } from "react-i18next";
import axiosInstance from "@/lib/axios";
import { Item } from "./Item";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { UserStore } from "@/store/user";

type ServerSyncEndpointDraft = {
  key: string;
  id: string;
  url: string;
  token: string;
  enabled: boolean;
};

type ServerSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  limit: number;
  endpoints: Array<{
    id: string;
    url: string;
    token: string;
    enabled?: boolean;
  }>;
};

type ServerSyncEndpointState = {
  lastPullCursor: string | null;
  lastPushCursor: string | null;
  lastSyncAt: string | null;
  status: string | null;
};

type ServerSyncState = {
  deviceId: string;
  endpoints: Record<string, ServerSyncEndpointState>;
};

const normalizeRemoteUrl = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeRemoteToken = (value: string) => value.trim().replace(/^bearer\s+/i, "");
const validateRemoteUrl = (value: string) => value.startsWith("http://") || value.startsWith("https://");

export type ServerSyncPanelProps = {
  /**
   * When set, the panel targets a remote Blinko server (Tauri mobile/desktop case).
   * Example: https://your-blinko.example.com
   */
  apiBaseUrl?: string;
  /** Bearer token for the targeted server (superadmin required for /api/server-sync/*). */
  bearerToken?: string;
  /** Optional reason to disable the panel (shown to the user). */
  disabledReason?: string;
};

const makeKey = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

const defaultSettings: ServerSyncSettings = {
  enabled: false,
  intervalMinutes: 5,
  limit: 500,
  endpoints: [],
};

const joinUrl = (base: string, pathname: string) => {
  const b = String(base || "").trim().replace(/\/+$/, "");
  const p = String(pathname || "").trim();
  return new URL(p.startsWith("/") ? p : `/${p}`, `${b}/`).toString();
};

const parseJsonOrText = (raw: string) => {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

export const ServerSyncPanel = observer((props: ServerSyncPanelProps) => {
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);
  const user = RootStore.Get(UserStore);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [testingKeys, setTestingKeys] = useState<Record<string, boolean>>({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});

  const [syncEnabled, setSyncEnabled] = useState(false);
  const [limit, setLimit] = useState<number>(500);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(5);
  const [endpoints, setEndpoints] = useState<ServerSyncEndpointDraft[]>([]);
  const [state, setState] = useState<ServerSyncState | null>(null);

  const currentApiBaseUrl = normalizeRemoteUrl(props.apiBaseUrl || "");
  const currentBearerToken = normalizeRemoteToken(props.bearerToken || user.token || "");
  const isRemote = !!currentApiBaseUrl;

  const apiRequest = async <T,>(
    path: string,
    options: { method?: string; body?: any } = {},
  ): Promise<T> => {
    const method = (options.method || "GET").toUpperCase();
    const hasBody = options.body !== undefined;

    if (!isRemote) {
      // Web (same-origin) mode: keep axios instance semantics.
      if (method === "GET") return (await axiosInstance.get<T>(path)).data;
      if (method === "PUT") return (await axiosInstance.put<T>(path, options.body ?? {})).data;
      if (method === "POST") return (await axiosInstance.post<T>(path, options.body ?? {})).data;
      throw new Error(`Unsupported method ${method}`);
    }

    if (!currentBearerToken) {
      throw new Error(t("sync-token-required") as any);
    }

    const url = joinUrl(currentApiBaseUrl, path);
    const controller = new AbortController();
    const timeoutMs = 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${currentBearerToken}`,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text().catch(() => "");
      const data: any = parseJsonOrText(text);
      if (!res.ok) {
        const msg = (data && typeof data === "object" && data.error) ? String(data.error) : String(text || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ settings: ServerSyncSettings; state: ServerSyncState }>(
        "/api/server-sync/settings",
      );
      const s = res?.settings || defaultSettings;
      const st = res?.state || null;
      setSyncEnabled(!!s.enabled);
      setLimit(typeof s.limit === "number" && s.limit > 0 ? s.limit : 500);
      setIntervalMinutes(
        typeof s.intervalMinutes === "number" && s.intervalMinutes > 0 ? s.intervalMinutes : 5,
      );
      const drafts: ServerSyncEndpointDraft[] = (Array.isArray(s.endpoints) ? s.endpoints : []).map((e) => ({
        key: makeKey(),
        id: String(e.id || "").trim() || "default",
        url: normalizeRemoteUrl(String(e.url || "")),
        token: String(e.token || ""),
        enabled: e.enabled !== false,
      }));
      setEndpoints(drafts);
      setState(st);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load server sync settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (props.disabledReason) return;
    if (isRemote && !currentBearerToken) return;
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.disabledReason, isRemote, currentApiBaseUrl, currentBearerToken, user.isSuperAdmin]);

  const missingTokenIds = useMemo(() => {
    return endpoints
      .filter((e) => e.enabled !== false)
      .filter((e) => normalizeRemoteUrl(e.url) && !normalizeRemoteToken(e.token))
      .map((e) => e.id || "(missing id)");
  }, [endpoints]);

  const canRunNow = useMemo(() => {
    if (!syncEnabled) return false;
    if (!endpoints.length) return false;
    if (missingTokenIds.length) return false;
    return true;
  }, [syncEnabled, endpoints.length, missingTokenIds.length]);

  const save = async () => {
    if (syncEnabled && missingTokenIds.length) {
      toast.error(`Token requis pour: ${missingTokenIds.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const payload: ServerSyncSettings = {
        enabled: !!syncEnabled,
        intervalMinutes: Math.max(1, Number(intervalMinutes || 5)),
        limit: Math.max(1, Number(limit || 500)),
        endpoints: endpoints.map((e) => ({
          id: String(e.id || "").trim(),
          url: normalizeRemoteUrl(String(e.url || "")),
          token: normalizeRemoteToken(String(e.token || "")),
          enabled: e.enabled !== false,
        })),
      };
      await apiRequest("/api/server-sync/settings", { method: "PUT", body: payload });
      toast.success(t("saved-successfully") as any);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (!canRunNow) return;
    setRunning(true);
    try {
      await apiRequest("/api/server-sync/now", { method: "POST", body: {} });
      toast.success(t("sync-now") as any);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Sync failed");
    } finally {
      setRunning(false);
    }
  };

  const addEndpoint = () => {
    setEndpoints((prev) => [
      ...prev,
      {
        key: makeKey(),
        id: `server_${prev.length + 1}`,
        url: "",
        token: "",
        enabled: true,
      },
    ]);
  };

  const removeEndpoint = (key: string) => setEndpoints((prev) => prev.filter((e) => e.key !== key));

  const makePrimary = (key: string) => {
    setEndpoints((prev) => {
      const idx = prev.findIndex((e) => e.key === key);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  };

  const useCurrentToken = (key: string) => {
    const current = currentBearerToken || "";
    if (!current) {
      toast.error(t("sync-no-session-token") as any);
      return;
    }
    setEndpoints((prev) =>
      prev.map((e) => (e.key === key ? { ...e, token: normalizeRemoteToken(current) } : e)),
    );
  };

  const testEndpoint = async (e: ServerSyncEndpointDraft) => {
    const url = normalizeRemoteUrl(e.url);
    const token = normalizeRemoteToken(e.token);
    if (!validateRemoteUrl(url)) {
      toast.error("Invalid URL");
      return;
    }
    if (!token) {
      toast.error(t("sync-token-required") as any);
      return;
    }
    setTestingKeys((m) => ({ ...m, [e.key]: true }));
    setTestMessage((m) => ({ ...m, [e.key]: "" }));
    try {
      const res = await apiRequest<{ ok: boolean; message?: string }>(
        "/api/server-sync/test",
        { method: "POST", body: { url, token } },
      );
      setTestMessage((m) => ({ ...m, [e.key]: res?.message || "OK" }));
      toast.success("OK");
    } catch (error: any) {
      const msg = error?.message || "Test failed";
      setTestMessage((m) => ({ ...m, [e.key]: String(msg) }));
      toast.error(String(msg));
    } finally {
      setTestingKeys((m) => ({ ...m, [e.key]: false }));
    }
  };

  if (props.disabledReason) {
    return (
      <CollapsibleCard icon="tabler:refresh" title={t("settings-sync-server")}>
        <div className="text-sm opacity-70">{props.disabledReason}</div>
      </CollapsibleCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CollapsibleCard icon="tabler:refresh" title={t("settings-sync-server")} decorations={false}>
        <div className="flex flex-col gap-2">
          <Item
            leftContent="Activer la sync serveur"
            rightContent={<Switch isSelected={syncEnabled} onValueChange={setSyncEnabled} />}
          />

          <Item
            leftContent="Intervalle (minutes)"
            rightContent={
              <Input
                size="sm"
                type="number"
                min={1}
                value={String(intervalMinutes)}
                onChange={(ev) => setIntervalMinutes(Number(ev.target.value || 5))}
                className="w-[140px]"
              />
            }
          />

          <Item
            leftContent="Limit /changes"
            rightContent={
              <Input
                size="sm"
                type="number"
                min={1}
                value={String(limit)}
                onChange={(ev) => setLimit(Number(ev.target.value || 500))}
                className="w-[140px]"
              />
            }
          />

          <Divider className="my-2" />

          <div className="text-sm opacity-70">
            Endpoints distants (le premier est “primaire”). Token = JWT du serveur distant (pas forcément le
            même que celui d’ici si les `JWT_SECRET` diffèrent).
          </div>

          <div className="flex flex-col gap-3">
            {endpoints.map((e, idx) => {
              const url = normalizeRemoteUrl(e.url);
              const hasToken = !!normalizeRemoteToken(e.token);
              const endpointState = state?.endpoints?.[e.id] || null;
              const status = endpointState?.status || null;
              const lastSyncAt = endpointState?.lastSyncAt || null;
              const isTesting = !!testingKeys[e.key];
              const msg = testMessage[e.key] || "";
              const unauthorizedHint =
                status && (status.includes("401") || status.toLowerCase().includes("unauthorized"))
                  ? "Token invalide sur le serveur distant (reconnecte-toi sur ce serveur et copie son token)."
                  : "";

              return (
                <div key={e.key} className="rounded-xl border border-default-200 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{idx === 0 ? "Primaire" : `Secondaire #${idx}`}</div>
                    <div className="ml-auto flex items-center gap-2">
                      <Switch
                        size="sm"
                        isSelected={e.enabled !== false}
                        onValueChange={(v) =>
                          setEndpoints((prev) => prev.map((x) => (x.key === e.key ? { ...x, enabled: v } : x)))
                        }
                      />
                      <Button size="sm" variant="flat" onPress={() => makePrimary(e.key)} isDisabled={idx === 0}>
                        Définir primaire
                      </Button>
                      <Button size="sm" color="danger" variant="flat" onPress={() => removeEndpoint(e.key)}>
                        Supprimer
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      label="ID"
                      size="sm"
                      value={e.id}
                      onChange={(ev) =>
                        setEndpoints((prev) => prev.map((x) => (x.key === e.key ? { ...x, id: ev.target.value } : x)))
                      }
                    />
                    <Input
                      label="URL"
                      size="sm"
                      value={e.url}
                      placeholder="http://192.168.0.50:1111"
                      onChange={(ev) =>
                        setEndpoints((prev) =>
                          prev.map((x) => (x.key === e.key ? { ...x, url: ev.target.value } : x)),
                        )
                      }
                      isInvalid={!!e.url && !validateRemoteUrl(url)}
                    />
                    <Input
                      label="Token (JWT)"
                      size="sm"
                      type="password"
                      value={e.token}
                      placeholder={hasToken ? "••••••••" : "Token requis"}
                      onChange={(ev) =>
                        setEndpoints((prev) =>
                          prev.map((x) => (x.key === e.key ? { ...x, token: ev.target.value } : x)),
                        )
                      }
                    />
                    <div className="flex items-end gap-2">
                      <Button size="sm" variant="flat" onPress={() => useCurrentToken(e.key)}>
                        Utiliser mon token actuel
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => testEndpoint(e)}
                        isDisabled={!validateRemoteUrl(url) || !hasToken || isTesting}
                        isLoading={isTesting}
                      >
                        Tester
                      </Button>
                    </div>
                  </div>

                  {!hasToken && normalizeRemoteUrl(e.url) ? (
                    <div className="text-sm text-danger">{t("sync-token-required")}</div>
                  ) : null}

                  {lastSyncAt || status ? (
                    <div className="text-sm">
                      <div>Dernière sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "-"}</div>
                      <div className={status?.startsWith("error:") ? "text-danger" : ""}>État: {status || "-"}</div>
                      {unauthorizedHint ? <div className="opacity-70">{unauthorizedHint}</div> : null}
                    </div>
                  ) : null}

                  {msg ? <div className="text-xs opacity-70">Test: {msg}</div> : null}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={addEndpoint}>
              Ajouter un serveur
            </Button>
            <Button size="sm" variant="flat" onPress={() => load()} isDisabled={loading} isLoading={loading}>
              Rafraîchir
            </Button>
          </div>

          {missingTokenIds.length ? (
            <div className="text-sm text-danger">
              Token requis pour: {missingTokenIds.join(", ")} (actions bloquées)
            </div>
          ) : null}

          <Divider className="my-2" />

          <div className="flex gap-2">
            <Button
              color="primary"
              onPress={save}
              isLoading={saving}
              isDisabled={saving || loading}
            >
              Enregistrer
            </Button>
            <Button
              color="secondary"
              onPress={runNow}
              isLoading={running}
              isDisabled={!canRunNow || running}
            >
              Sync now (tous)
            </Button>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
});

// Backward-compatible wrapper: only superadmins can manage server replication on the web UI.
export const ServerSyncSetting = observer(() => {
  const user = RootStore.Get(UserStore);
  if (!user.isSuperAdmin) return null;
  return <ServerSyncPanel />;
});
