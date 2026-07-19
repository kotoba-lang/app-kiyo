import { createAuthedEtzhayyim, extractBearerToken } from "@etzhayyim/sdk-auth";
import * as kiyoRwFree from "@etzhayyim/kiyo-kotoba";
interface Env { ACTOR_DID: string; PDS_URL: string; L2_RPC_URL: string; PDS_ACCESS_JWT?: string; PDS_REFRESH_JWT?: string; }
type Handler = (e: Etzhayyim, input: unknown) => Promise<unknown>;
const NSID_BASE = "com.etzhayyim.kiyo";
interface RouteConfig { method: "POST" | "GET"; handler: Handler; }
const routes: Record<string, RouteConfig> = {};
function mapStatus(status?: string): number { if (status === "rejected" || status?.includes("invalid") || status?.includes("notFound")) return status?.includes("notFound") ? 404 : 400; return 200; }
function jsonResponse(body: unknown, status: number = 200, init?: ResponseInit): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...init?.headers }, ...init }); }
export default { async fetch(req: Request, env: Env): Promise<Response> { const url = new URL(req.url); if (!url.pathname.startsWith("/xrpc/")) return jsonResponse({ error: "NotFound" }, 404); const nsid = url.pathname.slice("/xrpc/".length); const route = routes[nsid]; if (!route) return jsonResponse({ error: "MethodNotFound", nsid }, 404); if (req.method !== route.method) return jsonResponse({ error: "MethodNotAllowed" }, 405); const bearerToken = extractBearerToken(req);
    const e = createAuthedEtzhayyim({ env, bearerToken }); try { const input = route.method === "POST" ? await req.json().catch(() => ({})) : Object.fromEntries(url.searchParams.entries()); const result = await route.handler(e, input); return jsonResponse(result, mapStatus((result as any)?.status)); } catch (err) { return jsonResponse({ error: "InternalError" }, 500); } }} satisfies ExportedHandler<Env>;
