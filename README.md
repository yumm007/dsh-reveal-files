# dsh-reveal-files

[English](README.md) | [简体中文](README.zh.md)

A dual-face DeepSeek Harness plugin that adds a **folder icon** next to the
produced-files row (「产物」 in Chinese, "Produces" in English — the row of
file chips under assistant messages). Clicking the icon reveals the turn's
produced files in your **native file browser**:

- 🍎 macOS → reveals in **Finder** (`open -R`, selects the file)
- 🐧 Linux → opens the parent folder (`xdg-open`)
- 🪟 Windows → selects in **Explorer** (`explorer /select,`)

The original behavior — clicking a file chip opens it with its default
application — is preserved unchanged.

## Features

- Two inline, one-line icon buttons beside the produced-files chips; no extra row.
- 📁 **Reveal in file browser** — macOS Finder (`open -R`, selects the file),
  Linux file manager (`xdg-open` on the parent folder), Windows Explorer
  (`explorer /select,`).
- ⌨️ **Show paths in terminal** — opens a native terminal window and echoes the
  paths: Terminal.app on macOS, `x-terminal-emulator` / `gnome-terminal` /
  `konsole` on Linux, `cmd` on Windows.
- Tooltip and `aria-label` for accessibility; labels follow the UI locale
  (Simplified Chinese / English).
- Multiple produced files in one turn are all handled (one window per file,
  or one folder per parent directory on Linux).
- Relative paths are resolved against the session working directory.
- Errors (e.g. sandbox denial, unsupported platform) surface as a red icon
  with the reason in the tooltip, while the icon is disabled while busy.
- Zero runtime dependencies beyond the harness itself — Host uses only
  `node:child_process`; the client uses only the platform's `react` seed.

## Requirements

- DeepSeek Harness Web (profile `web`), i.e. `dsh web`.
- Node.js `>= 22.6.0`.
- A desktop environment the native opener can reach (macOS and Windows always;
  Linux needs a display server or WSL).

## Installation

```bash
# Install from GitHub (pnpm git spec; #main pins the default branch):
dsh plugin --profile web add github:yumm007/dsh-reveal-files#main
```

> **Building from source.** GitHub installs build the package during
> install; pnpm asks once for an `allowBuilds` grant, then proceeds. If it
> does (or if the build is blocked), add the package to
> `allowBuilds` in your profile's `pnpm-workspace.yaml` and re-run the
> command. A prebuilt npm release skips this step entirely.

`dsh plugin` forwards the arguments to pnpm inside the profile directory and
then reconciles `dsh.profile.bundles`. Because the package declares
`dsh.bundle.patch`, it joins the profile layer stack automatically — no manual
editing of `cordis.yml` is required.

After installation, restart the web profile:

```bash
dsh web
```

The plugin loads as a bundle on boot: the Host half registers the
`POST /api/reveal-files` route and the client half mounts the icon in the
produced-files row.

## Usage

1. Let the assistant produce one or more files (any `write` / `edit` /
   mutation tool result in a turn).
2. Under that message, find the produced-files row (「产物」 in Chinese, "Produces" in English) with the file chips.
3. Click the folder icon next to the chips — the file(s) open in your native
   file browser, selected or revealed; or click the terminal icon to open a
   terminal window that prints the paths.
4. Hover an icon to see the tooltip; if the operation failed, the tooltip shows
   the error instead and the icon turns red.

## Configuration

The plugin row in `cordis.patch.yml` accepts:

```yaml
- insert:
    - id: dsh-reveal-files
      name: 'dsh-reveal-files'
      config:
        enabled: true          # register the reveal route (default true)
        revealTimeoutMs: 10000 # per-command timeout, ms (default 10000)
```

Override these in the profile's own `cordis.patch.yml` if you need to.

## How it works

| Layer | File | Responsibility |
| --- | --- | --- |
| Host | `lib/index.js` | Cordis plugin row `dsh-reveal-files` (injects `webServer` and `sessions`) and registers `POST /api/reveal-files` (reveal) and `POST /api/show-in-terminal` (terminal echo). Runs `open -R` / `xdg-open` / `explorer /select,` and `osascript` / terminal emulators per platform, resolves relative paths against the session cwd, and returns JSON results. |
| Client | `client/client.js` | Web module (`window.__ModuleLoader__.load`), registered by the harness client module system. Claims the `conversation.chat.turnTail` chain with `priority: -1` and a `select` that reads the turn's `deliverables` data (the same vocabulary the built-in row uses), then renders the chips row plus the two icon buttons. |

### Why `priority: -1`?

The turn-tail slot is a *chain*: entries are tried in ascending priority order
and the first non-null `select` result wins. The built-in produced-files row
registers at priority `0`. Registering at `-1` places this plugin's entry
first, so the reveal icon is rendered while keeping identical file-detection
behavior. Without the explicit priority, the two entries would tie at `0` and
the built-in row would silently win.

## Uninstall

```bash
dsh plugin --profile web remove dsh-reveal-files
```

The reconcile step also drops the package from `dsh.profile.bundles`; restart
the web profile afterwards.

## Development

For local development against a checkout, install it from disk and re-run
the `add` after each edit — the profile's dependency is a hard link, so the
installed code follows your working tree:

```bash
dsh plugin --profile web add file:/absolute/path/to/dsh-reveal-files
# after editing:        dsh plugin --profile web add file:/absolute/path/to/dsh-reveal-files
# or force a reinstall: pnpm --dir ~/.dsh/profiles/web install --force
```

The web server serves the client bundle from disk with a rev-hashed URL, so a
refresh picks up client changes; Host route changes require a restart.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)
