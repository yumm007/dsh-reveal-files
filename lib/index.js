// dsh-reveal-files — a dual-face DeepSeek Harness plugin: one cordis row, one
// apply, two capabilities:
//   1. Host: a webServer route `POST /api/reveal-files` that reveals paths in
//      the native file browser — Finder on macOS (`open -R`), a file manager on
//      Linux (`xdg-open` on the parent directory), Explorer on Windows
//      (`explorer /select,`). Relative paths resolve against the session cwd.
//   2. Web client: an icon button beside each turn's produced-files row.
//      Clicking it asks the Host to reveal the turn's produced files, exactly
//      where the built-in chips row already lists them.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import z from '@deepseek-ai/schemastery';

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'dsh-reveal-files';

/** Services required by this plugin. */
export const inject = ['webServer', 'sessions'];

/** Row config. */
export const Config = z.object({
    /** Whether the reveal route is registered. */
    enabled: z.boolean().default(true),
    /** Per-command timeout in milliseconds. */
    revealTimeoutMs: z.number().default(TIMEOUT_MS),
});

/** Absolute POSIX or Windows root path. */
function isAbsolutePath(path) {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

/**
 * Reveal one set of targets in the native file browser.
 * @param ctx - plugin context.
 * @param targets - absolute filesystem paths to reveal.
 * @param timeoutMs - per-command timeout.
 * @returns the platform-specific command list actually spawned (report only).
 */
async function reveal(ctx, targets, timeoutMs) {
    const platform = process.platform;
    const commands = [];
    if (platform === 'darwin') {
        // One Finder window per target, each with the file selected.
        for (const target of targets) {
            commands.push(['open', ['-R', target], `open -R ${target}`]);
        }
    } else if (platform === 'win32') {
        for (const target of targets) {
            commands.push(['explorer', [`/select,${target}`], `explorer /select,${target}`]);
        }
    } else if (platform === 'linux') {
        // Reveal-by-selection has no portable equivalent; open the parent.
        const dirs = [...new Set(targets.map((target) => {
            const at = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'));
            return at > 0 ? dirname(target) : '.';
        }))];
        for (const dir of dirs) {
            commands.push(['xdg-open', [dir], `xdg-open ${dir}`]);
        }
    } else {
        throw new Error(`native reveal is unsupported on ${platform}`);
    }
    const failures = [];
    for (const [file, args, label] of commands) {
        try {
            await execFileAsync(file, args, { timeout: timeoutMs });
        } catch (error) {
            const detail = error && typeof error === 'object' && typeof error.message === 'string'
                ? error.message.slice(0, 300)
                : String(error);
            failures.push(`${label}: ${detail}`);
        }
    }
    return { count: targets.length, failures };
}

/**
 * Plugin body: register the reveal route.
 * @param ctx - host context.
 * @param config - row config (schemastery-validated defaults applied).
 */
export function apply(ctx, config = {}) {
    if (config.enabled !== true) return;

    function sessionCwd(sessionId) {
        if (typeof sessionId !== 'string' || sessionId === '') return undefined;
        const session = ctx.sessions.get(sessionId);
        return session === undefined ? undefined : session.header?.cwd;
    }

    function resolveTargets(payload, cwd) {
        const raw = Array.isArray(payload?.paths)
            ? payload.paths.filter((item) => typeof item === 'string' && item.length > 0)
            : [];
        return raw.map((item) => (isAbsolutePath(item) || cwd === undefined ? item : join(cwd, item)));
    }

    async function handle(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
            return;
        }
        const chunks = [];
        let total = 0;
        for await (const chunk of req) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > MAX_BODY_BYTES) {
                res.writeHead(413, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
                return;
            }
            chunks.push(buf);
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
            return;
        }
        const cwd = sessionCwd(payload?.sessionId);
        const targets = resolveTargets(payload, cwd);
        if (targets.length === 0) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'no paths to reveal' }));
            return;
        }
        let outcome;
        try {
            outcome = await reveal(ctx, targets, config.revealTimeoutMs ?? TIMEOUT_MS);
            if (outcome.failures.length > 0) throw new Error(outcome.failures.join('; '));
        } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(error instanceof Error ? error.message : error) }));
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: outcome.count }));
    }

    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/api/reveal-files',
        handler: async (req, res) => {
            try {
                await handle(req, res);
            } catch (error) {
                if (!res.headersSent) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: String(error instanceof Error ? error.message : error) }));
                }
            }
        },
    }));
}
