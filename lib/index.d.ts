import type z from '@deepseek-ai/schemastery';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name: 'dsh-reveal-files';
/** Services required by this plugin. */
export declare const inject: ['webServer', 'sessions'];
/** Row config. */
export declare const Config: z<{
    enabled?: boolean | undefined;
    revealTimeoutMs?: number | undefined;
}>;
/**
 * Plugin body: register the reveal route.
 * @param ctx - host context.
 * @param config - row config (schemastery-validated defaults applied).
 */
export declare function apply(ctx: import('@deepseek-ai/cordis').Context, config?: {
    enabled: boolean;
    revealTimeoutMs: number;
}): void;
