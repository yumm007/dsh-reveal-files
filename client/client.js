// dsh-reveal-files client half — web module format consumed by the client
// module system (`window.__ModuleLoader__.load`). Registers the turn-tail
// chain entry that renders the produced-files row; clicking a file chip opens
// a small dropdown with per-file actions: Open, Reveal in file browser, and
// Open in terminal (cd into the file's directory).
window.__ModuleLoader__.load({ id: "dsh-reveal-files", factory: (require) => {
  "use strict";
  var module = { exports: {} };
  var exports = module.exports;
  var React = require("react");

  var NS = "dsh-reveal-files";

  /** Locale dictionaries registered against the client locale service. */
  var zh = {
    "reveal.label": "产物",
    "reveal.open": "打开",
    "reveal.reveal": "在文件浏览器中显示",
    "reveal.terminal": "在终端中显示路径",
    "reveal.errorReveal": "在文件浏览器中显示失败",
    "reveal.errorTerminal": "在终端中显示失败",
    "reveal.err.method-not-allowed": "请求方式不允许",
    "reveal.err.invalid-body": "请求内容无效",
    "reveal.err.no-paths": "没有可显示的路径",
    "reveal.err.unsupported-platform": "当前系统平台不支持该操作",
    "reveal.err.operation-failed": "操作失败"
  };
  var en = {
    "reveal.label": "Produced",
    "reveal.open": "Open",
    "reveal.reveal": "Show in file browser",
    "reveal.terminal": "Show paths in terminal",
    "reveal.errorReveal": "Failed to show in file browser",
    "reveal.errorTerminal": "Failed to show in terminal",
    "reveal.err.method-not-allowed": "Method not allowed",
    "reveal.err.invalid-body": "Invalid request body",
    "reveal.err.no-paths": "No paths to show",
    "reveal.err.unsupported-platform": "Unsupported platform",
    "reveal.err.operation-failed": "Operation failed"
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

  /**
   * The produced-files row: label + file chips, each with a per-file dropdown
   * (Open / Reveal in file browser / Open in terminal). Standard props provide
   * sessionId and useSessions; the reveal/terminal actions POST to the Host
   * routes, which resolve the path against the session cwd.
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

    /** POST one path to a Host route; resolves to { ok, error } outcome.
     *  The Host answers { ok:false, code, error }; the stable `code` localizes
     *  here, the raw `error` string stays as diagnostics. */
    function post(path, url, failKey) {
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paths: [path], sessionId: sessionId, cwd: cwd })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || data === null || data.ok !== true) {
            var code = data !== null && typeof data === "object" && typeof data.code === "string" ? data.code : "";
            if (code !== "") {
              var localized = t("reveal.err." + code);
              if (typeof localized === "string" && localized.indexOf("reveal.err.") !== 0) {
                return { ok: false, error: localized };
              }
            }
            return { ok: false, error: data !== null && typeof data === "object" && typeof data.error === "string" ? data.error : t(failKey) };
          }
          return { ok: true };
        });
      }, function () {
        return { ok: false, error: t(failKey) };
      });
    }

    // Which chip's dropdown is open; per-open busy/error state.
    var state = React.useState({ menuFor: null, busy: false, error: null });
    var menuFor = state[0].menuFor;
    var busy = state[0].busy;
    var error = state[0].error;
    var setState = state[1];

    var toggleMenu = function (path) {
      if (busy) return;
      setState({ menuFor: menuFor === path ? null : path, busy: false, error: null });
    };

    var closeMenu = function () {
      setState({ menuFor: null, busy: false, error: null });
    };

    var runAction = function (path, url, failKey) {
      if (busy) return;
      setState({ menuFor: path, busy: true, error: null });
      post(path, url, failKey).then(function (outcome) {
        setState(outcome.ok
          ? { menuFor: null, busy: false, error: null }
          : { menuFor: path, busy: false, error: outcome.error });
      });
    };

    var openPath = function (path) {
      if (busy) return;
      closeMenu();
      if (openFile !== undefined) openFile(path);
    };

    // Clicking anywhere outside a chip closes the open dropdown.
    var outsideRef = React.useRef(null);
    React.useEffect(function () {
      function onDocClick(event) {
        var ref = outsideRef.current;
        if (ref === null || ref === undefined) return;
        if (ref.contains(event.target)) return;
        setState({ menuFor: null, busy: false, error: null });
      }
      document.addEventListener("mousedown", onDocClick);
      return function () { document.removeEventListener("mousedown", onDocClick); };
    }, []);

    return React.createElement(
      "div",
      { className: "rfv-root" },
      React.createElement("span", { className: "rfv-label" }, t("reveal.label")),
      React.createElement(
        "div",
        { className: "rfv-row", "data-produced-files-row": true },
        paths.map(function (path) {
          var open = menuFor === path;
          return React.createElement(
            "div",
            { key: path, className: "rfv-chip", ref: outsideRef },
            React.createElement(
              "button",
              {
                type: "button",
                className: "rfv-file" + (open ? " is-open" : ""),
                title: path,
                "aria-haspopup": "menu",
                "aria-expanded": open,
                onClick: function () { toggleMenu(path); }
              },
              basename(path)
            ),
            open && React.createElement(
              "div",
              { className: "rfv-menu", role: "menu" },
              React.createElement(
                "button",
                { type: "button", role: "menuitem", className: "rfv-item", disabled: busy, onClick: function () { openPath(path); } },
                t("reveal.open")
              ),
              React.createElement(
                "button",
                { type: "button", role: "menuitem", className: "rfv-item", disabled: busy, onClick: function () { runAction(path, "/api/reveal-files", "reveal.errorReveal"); } },
                t("reveal.reveal")
              ),
              React.createElement(
                "button",
                { type: "button", role: "menuitem", className: "rfv-item", disabled: busy, onClick: function () { runAction(path, "/api/show-in-terminal", "reveal.errorTerminal"); } },
                t("reveal.terminal")
              ),
              error !== null && React.createElement("div", { className: "rfv-error", role: "alert" }, String(error)),
              busy && React.createElement("div", { className: "rfv-busy" }, "…")
            )
          );
        })
      )
    );
  }

  var css = [
    ".rfv-root{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:6px 8px;margin-top:16px;font-size:13px;line-height:22px;position:relative}",
    ".rfv-label{color:var(--dsw-alias-label-tertiary);grid-area:1/1}",
    ".rfv-row{flex-wrap:nowrap;grid-area:1/2;align-items:center;gap:8px;min-width:0;display:flex;overflow:visible}",
    ".rfv-chip{position:relative;flex:none;min-width:0}",
    ".rfv-file{text-overflow:ellipsis;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover);max-width:320px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:none;border-radius:6px;margin:0;padding:0 8px;overflow:hidden}",
    ".rfv-file:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}",
    ".rfv-file.is-open{color:var(--dsw-alias-label-primary);text-decoration:underline}",
    ".rfv-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:30;display:flex;flex-direction:column;gap:2px;min-width:150px;width:max-content;max-width:240px;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.22)}",
    ".rfv-item{text-align:left;font:inherit;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:6px;cursor:pointer;margin:0;padding:5px 10px}",
    ".rfv-item:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".rfv-item:disabled{opacity:.55;cursor:wait}",
    ".rfv-error{color:#ef4444;font-size:12px;line-height:18px;padding:2px 10px 4px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".rfv-busy{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:0 10px 2px}"
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
