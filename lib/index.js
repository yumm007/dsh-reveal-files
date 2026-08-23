// dsh-reveal-files — a dual-face DeepSeek Harness plugin: one cordis row, one
// apply, three capabilities:
//   1. Host: a webServer route `POST /api/reveal-files` that reveals paths in
//      the native file browser — Finder on macOS (`open -R`), a file manager on
//      Linux (`xdg-open` on the parent directory), Explorer on Windows
//      (`explorer /select,`). Relative paths resolve against the session cwd.
//   2. Host: a webServer route `POST /api/show-in-terminal` that displays paths
//      in a native terminal window — Terminal.app on macOS (`osascript` +
//      `echo`), `x-terminal-emulator`/`gnome-terminal`/`konsole` on Linux,
//      `cmd /k` on Windows.
//   3. Web client: two icon buttons beside each turn's produced-files row —
//      reveal in the file browser, and show the paths in a terminal.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import z from '@deepseek-ai/schemastery';

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;
/** Linux terminal emulators that accept `-e <command>`, tried in order. */
const LINUX_TERMINALS = ['x-terminal-emulator', 'gnome-terminal', 'konsole'];

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'dsh-reveal-files';

/** Services required by this plugin. */
export const inject = ['webServer', 'sessions'];

/** Row config. */
export const Config = z.object({
    /** Whether the reveal/terminal routes are registered. */
    enabled: z.boolean().default(true),
    /** Per-command timeout in milliseconds. */
    revealTimeoutMs: z.number().default(TIMEOUT_MS),
});

/** Absolute POSIX or Windows root path. */
function isAbsolutePath(path) {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

/** Shell-single-quote a value for use inside a POSIX shell command string. */
function shQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Reveal one set of targets in the native file browser.
 * @param targets - absolute filesystem paths to reveal.
 * @param timeoutMs - per-command timeout.
 * @returns the platform-specific command list actually spawned (report only).
 */
async function reveal(targets, timeoutMs) {
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
 * Open a native terminal window and cd' into the first target's directory.
 * No echo — the window simply stays in that directory for further work.
 * @param targets - absolute filesystem paths.
 * @param timeoutMs - per-command timeout.
 * @returns the command list actually spawned (report only).
 */
async function showInTerminal(targets, timeoutMs) {
    const platform = process.platform;
    const commands = [];
    // The parent of the first target is the window's cwd (one turn typically
    // writes into one directory).
    const at = Math.max(targets[0].lastIndexOf('/'), targets[0].lastIndexOf('\\'));
    const dir = at > 0 ? targets[0].slice(0, at) : '.';
    const script = `cd ${shQuote(dir)}`;
    if (platform === 'darwin') {
        // osascript + Terminal.app: activate first (so the window comes to
        // the front), then a new window runs `cd <dir>`.
        const osaScript = `tell application "Terminal"\n\tactivate\n\tdo script "${script.replace(/"/g, '\\"')}"\nend tell`;
        commands.push(['osascript', ['-e', osaScript], script]);
    } else if (platform === 'win32') {
        const winScript = `cd /d "${String(dir).replace(/"/g, '"^"')}"`;
        commands.push(['cmd', ['/c', 'start', 'cmd', '/k', winScript], winScript]);
    } else if (platform === 'linux') {
        // Try known emulators in order; the first that exists wins. The
        // command keeps the window open until the user presses Enter.
        const linuxScript = `${script}; read -p 'Press Enter to close'`;
        for (const bin of LINUX_TERMINALS) {
            commands.push([bin, ['-e', linuxScript], `${bin} -e ${linuxScript}`]);
        }
    } else {
        throw new Error(`terminal is unsupported on ${platform}`);
    }
    const failures = [];
    for (const [file, args, label] of commands) {
        try {
            await execFileAsync(file, args, { timeout: timeoutMs });
            // One successful spawn is enough; stop trying further emulators.
            break;
        } catch (error) {
            const code = error && typeof error === 'object' ? error.code : undefined;
            // ENOENT = emulator not installed; not a real failure, keep trying.
            if (code === 'ENOENT') continue;
            const detail = error && typeof error === 'object' && typeof error.message === 'string'
                ? error.message.slice(0, 300)
                : String(error);
            failures.push(`${label}: ${detail}`);
        }
    }
    return { count: targets.length, failures };
}

/**
 * Plugin body: register the reveal and show-in-terminal routes.
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

    async function readBody(req) {
        const chunks = [];
        let total = 0;
        for await (const chunk of req) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > MAX_BODY_BYTES) {
                const error = new Error('payload too large');
                error.status = 413;
                throw error;
            }
            chunks.push(buf);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }

    /**
     * Shared route handler: decode { paths, sessionId }, resolve against the
     * session cwd, run the operation, answer JSON.
     *
     * Errors carry a stable `code` (client-localized) plus a raw English
     * `error` string (diagnostics): e.g. { ok:false, code:'unsupported-platform',
     * error:'native reveal is unsupported on freebsd' }.
     * @param req - incoming request.
     * @param res - server response.
     * @param operation - the platform operation (reveal / showInTerminal).
     */
    async function handle(req, res, operation) {
        const fail = (status, code, message) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, code, error: message }));
        };
        if (req.method !== 'POST') {
            fail(405, 'method-not-allowed', 'method not allowed');
            return;
        }
        let payload;
        try {
            payload = await readBody(req);
        } catch (error) {
            fail(error && error.status === 413 ? 413 : 400, 'invalid-body', String(error instanceof Error ? error.message : error));
            return;
        }
        const cwd = sessionCwd(payload?.sessionId);
        const targets = resolveTargets(payload, cwd);
        if (targets.length === 0) {
            fail(400, 'no-paths', 'no paths');
            return;
        }
        let outcome;
        try {
            outcome = await operation(targets, config.revealTimeoutMs ?? TIMEOUT_MS);
            if (outcome.failures.length > 0) throw new Error(outcome.failures.join('; '));
        } catch (error) {
            const message = String(error instanceof Error ? error.message : error);
            const code = /unsupported/.test(message) ? 'unsupported-platform' : 'operation-failed';
            fail(500, code, message);
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: outcome.count }));
    }

    const registerRoute = (path, operation) => {
        ctx.effect(() => ctx.webServer.register({
            kind: 'exact',
            path,
            handler: async (req, res) => {
                try {
                    await handle(req, res, operation);
                } catch (error) {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: String(error instanceof Error ? error.message : error) }));
                    }
                }
            },
        }));
    };

    registerRoute('/api/reveal-files', reveal);
    registerRoute('/api/show-in-terminal', showInTerminal);
}
