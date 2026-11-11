import { createMcpHandler } from 'agents/mcp/server';
import { Session } from './session';
import { authorizeMcp, openSession, type Deps } from './routes';
import { buildServer } from './server';
import { hashSecret, newSecret, newSessionId, parseToken } from './token';
import site from '../src/cloudflare';

export { Session };

// src/cloudflare.ts already maps the /projects/ URL onto the static files. This entry adds the MCP routes
// in front of it, and hands every other request to it unchanged.
const PREFIX = '/projects/pottery-rib-maker';

interface Env {
  ASSETS: Fetcher;
  SESSIONS: DurableObjectNamespace<Session>;
  SESSION_RATE?: RateLimit;
  CALL_RATE?: RateLimit;
  TURNSTILE_SECRET: string;
}

const stub = (env: Env, session: string) => env.SESSIONS.get(env.SESSIONS.idFromName(session));

function deps(env: Env): Deps {
  return {
    async verifyTurnstile(token, ip) {
      const body = new FormData();
      body.set('secret', env.TURNSTILE_SECRET); body.set('response', token); body.set('remoteip', ip);
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
      const v = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
      return { success: v.success === true, codes: v['error-codes'] };
    },
    limitSession: async (ip) => !env.SESSION_RATE || (await env.SESSION_RATE.limit({ key: ip })).success,
    async createSession() {
      const session = newSessionId(), tabSecret = newSecret(), mcpSecret = newSecret();
      await stub(env, session).init(await hashSecret(tabSecret), await hashSecret(mcpSecret));
      return { session, tabSecret, token: `${session}.${mcpSecret}` };
    },
    async checkToken(token) {
      const t = parseToken(token);
      return t && (await stub(env, t.session).verifyMcp(await hashSecret(t.secret))) ? t.session : null;
    },
    limitCalls: async (session) => !env.CALL_RATE || (await env.CALL_RATE.limit({ key: session })).success,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${PREFIX}/`)) url.pathname = url.pathname.slice(PREFIX.length);
    const req = new Request(url, request), d = deps(env);

    if (url.pathname === '/session/new') return openSession(req, d);
    if (url.pathname === '/session/ws') return stub(env, url.searchParams.get('session') ?? '-').fetch(req);
    if (url.pathname === '/mcp') {
      const auth = await authorizeMcp(req, d);
      if (auth instanceof Response) return auth;
      const s = stub(env, auth.session);
      return createMcpHandler(() => buildServer((m, p) => s.call(m, p)), {
        route: '/mcp', allowedHostnames: ['localhost', '127.0.0.1', 'aasimsani.net'],
      })(req, env, ctx);
    }
    return site.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
