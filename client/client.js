// dsh-reveal-files client half — web module format consumed by the client
// module system (`window.__ModuleLoader__.load`). Registers the turn-tail
// chain entry that renders the produced-files row with a reveal-in-folder
// icon button; the button asks the Host route `POST /api/reveal-files`.
window.__ModuleLoader__.load({ id: "dsh-reveal-files", factory: (require) => {
  "use strict";
  var module = { exports: {} };
  var exports = module.exports;
  var React = require("react");

  var NS = "dsh-reveal-files";

  /** Locale dictionaries registered against the client locale service. */
  var zh = {
    "reveal.label": "产物",
    "reveal.inFolder": "在文件浏览器中显示",
    "reveal.inTerminal": "在终端中显示路径",
    "reveal.error": "在文件浏览器中显示失败",
    "reveal.errorTerminal": "在终端中显示失败",
    "reveal.unknownError": "操作失败"
  };
  var en = {
    "reveal.label": "Produced",
    "reveal.inFolder": "Show in file browser",
    "reveal.inTerminal": "Show paths in terminal",
    "reveal.error": "Failed to show in file browser",
    "reveal.errorTerminal": "Failed to show in terminal",
    "reveal.unknownError": "Operation failed"
  };

  /** Last path segment — the part that identifies the file at a glance. */
  function basename(path) {
    var at = Math.max(String(path).lastIndexOf("/"), String(path).lastIndexOf("\\"));
    return at === -1 ? String(path) : String(path).slice(at + 1);
  }

  /**
   * Produced paths for the closing assistant of one Turn — the same vocabulary
   * the built-in deliverables row uses (turn data key "deliverables",
   * `produced: [{ seq, path }]`), with the same seq filter and de-duplication.
   */
  function producedForClosing(data, seq) {
    if (data === undefined || data === null) return [];
    var paths = [];
    var seen = new Set();
    var list = Array.isArray(data.produced) ? data.produced : [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (item === null || typeof item !== "object") continue;
      var path = item.path;
      if (typeof path !== "string" || (typeof seq === "number" && item.seq > seq) || seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
    return paths;
  }

  /** Chain selector: claim the turn-tail only when the turn produced files. */
  function selectProducedFiles(owner) {
    try {
      var turn = owner !== null && owner !== undefined && typeof owner === "object" ? owner.turn : undefined;
      if (turn === undefined || turn === null || turn.data === undefined || turn.data.get === undefined) return null;
      var paths = producedForClosing(turn.data.get("deliverables"), owner.seq);
      return paths.length === 0 ? null : paths;
    } catch (error) {
      return null;
    }
  }

  /** Reveal-in-folder icon (line-art folder, theme colors via currentColor). */
  function FolderIcon() {
    return React.createElement(
      "svg",
      {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true
      },
      React.createElement("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" })
    );
  }

  /** Show-in-terminal icon (line-art terminal, `>_` inside a rounded frame). */
  function TerminalIcon() {
    return React.createElement(
      "svg",
      {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true
      },
      React.createElement("polyline", { points: "4 17 10 11 4 5" }),
      React.createElement("line", { x1: "12", y1: "19", x2: "20", y2: "19" })
    );
  }

  /**
   * The produced-files row: label + openable file chips + two icon buttons
   * (reveal in file browser / show paths in terminal). Standard props provide
   * sessionId and useSessions; the icons POST the paths to the Host routes,
   * which resolve them against the session cwd.
   */
  function ProducedFilesReveal(props) {
    var paths = Array.isArray(props.matched) ? props.matched : [];
    var t = typeof props.t === "function" ? props.t : function (key) { return key; };
    var openFile = typeof props.openFile === "function" ? props.openFile : undefined;
    var sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
    var cwd = undefined;
    if (typeof props.useSessions === "function" && typeof sessionId === "string" && sessionId !== "") {
      try {
        var sessionsSnapshot = props.useSessions(function (s) {
          return s !== null && s !== undefined && s.byId && s.byId[sessionId] ? s.byId[sessionId].cwd : undefined;
        });
        if (typeof sessionsSnapshot === "string") cwd = sessionsSnapshot;
      } catch (error) { /* cwd stays undefined */ }
    }

    /** POST paths to one Host route; resolves to { ok, error } outcome. */
    function post(url, failKey) {
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paths: paths, sessionId: sessionId, cwd: cwd })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || data === null || data.ok !== true) {
            return { ok: false, error: data !== null && typeof data === "object" && typeof data.error === "string" ? data.error : t(failKey) };
          }
          return { ok: true };
        });
      }, function () {
        return { ok: false, error: t("reveal.unknownError") };
      });
    }

    var state = React.useState({ folders: false, foldersError: null, terminal: false, terminalError: null });
    var foldersBusy = state[0].folders;
    var foldersError = state[0].foldersError;
    var terminalBusy = state[0].terminal;
    var terminalError = state[0].terminalError;
    var setState = state[1];

    var reveal = function () {
      if (foldersBusy) return;
      setState({ folders: true, foldersError: null, terminal: terminalBusy, terminalError: terminalError });
      post("/api/reveal-files", "reveal.error").then(function (outcome) {
        setState({ folders: false, foldersError: outcome.ok ? null : outcome.error, terminal: terminalBusy, terminalError: terminalError });
      });
    };

    var showTerminal = function () {
      if (terminalBusy) return;
      setState({ folders: foldersBusy, foldersError: foldersError, terminal: true, terminalError: null });
      post("/api/show-in-terminal", "reveal.errorTerminal").then(function (outcome) {
        setState({ folders: foldersBusy, foldersError: foldersError, terminal: false, terminalError: outcome.ok ? null : outcome.error });
      });
    };

    var folderLabel = t("reveal.inFolder");
    var folderTitle = foldersError === null ? folderLabel : String(foldersError);
    var termLabel = t("reveal.inTerminal");
    var termTitle = terminalError === null ? termLabel : String(terminalError);

    return React.createElement(
      "div",
      { className: "rfv-root" },
      React.createElement("span", { className: "rfv-label" }, t("reveal.label")),
      React.createElement(
        "div",
        { className: "rfv-row", "data-produced-files-row": true },
        paths.map(function (path) {
          return React.createElement(
            "button",
            {
              type: "button",
              key: path,
              className: "rfv-file",
              title: path,
              onClick: function () { if (openFile !== undefined) openFile(path); }
            },
            basename(path)
          );
        }),
        React.createElement(
          "button",
          {
            type: "button",
            className: "rfv-reveal" + (foldersBusy ? " is-busy" : "") + (foldersError !== null ? " is-error" : ""),
            disabled: foldersBusy,
            title: folderTitle,
            "aria-label": folderLabel,
            onClick: reveal
          },
          React.createElement(FolderIcon, null)
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "rfv-reveal" + (terminalBusy ? " is-busy" : "") + (terminalError !== null ? " is-error" : ""),
            disabled: terminalBusy,
            title: termTitle,
            "aria-label": termLabel,
            onClick: showTerminal
          },
          React.createElement(TerminalIcon, null)
        )
      )
    );
  }

  var css = [
    ".rfv-root{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:6px 8px;margin-top:16px;font-size:13px;line-height:22px;position:relative}",
    ".rfv-label{color:var(--dsw-alias-label-tertiary);grid-area:1/1}",
    ".rfv-row{flex-wrap:nowrap;grid-area:1/2;align-items:center;gap:8px;min-width:0;display:flex;overflow:hidden}",
    ".rfv-file{text-overflow:ellipsis;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover);max-width:320px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:none;border-radius:6px;flex:none;margin:0;padding:0 8px;overflow:hidden}",
    ".rfv-file:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}",
    ".rfv-file:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l3);outline:none}",
    ".rfv-reveal{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;border-radius:4px;cursor:pointer;padding:0;margin:0}",
    ".rfv-reveal:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".rfv-reveal:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l3);outline:none}",
    ".rfv-reveal.is-busy{opacity:.6;cursor:wait}",
    ".rfv-reveal.is-error{color:#ef4444}"
  ].join("");

  var tagId = "dsh-reveal-files/style.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-reveal-files";
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  var inject = ["slots", "locale"];

  /** Client plugin body: register dictionaries and the turn-tail entry. */
  function apply(ctx) {
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en });
    }, "dsh-reveal-files: dictionaries");
    ctx.slots.inject("conversation.chat.turnTail", function () {
      return ctx.slots.register({
        name: "conversation.chat.turnTail",
        priority: -1,
        select: selectProducedFiles,
        locale: NS
      }, ProducedFilesReveal);
    });
  }

  module.exports = {
    apply: apply,
    inject: inject,
    selectProducedFiles: selectProducedFiles
  };
  return module.exports;
} });
