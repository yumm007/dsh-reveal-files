# dsh-reveal-files

[English](README.md) | [简体中文](README.zh.md)

DeepSeek Harness 双面插件:在每条助手消息的「产物」行(产出文件行)旁边
添加一个**文件夹图标按钮**,点击后在**系统文件浏览器**中定位这些文件。

- 🍎 macOS → Finder 中显示(`open -R`,会选中文件)
- 🐧 Linux → 打开文件所在文件夹(`xdg-open`)
- 🪟 Windows → Explorer 中选中(`explorer /select,`)

原有的「点击文件名打开文件」行为保持不变。

## 功能特性

- 内联单行图标按钮,紧贴产物文件的 chips,不额外占行。
- Tooltip(「在文件浏览器中显示」)与 `aria-label` 无障碍标注。
- 标签跟随界面语言(简体中文 / 英文)。
- 一个回合产出多个文件时会全部定位(每个文件一个 Finder 窗口,或 Linux
  下每个父目录打开一个文件夹)。
- 相对路径按会话工作目录解析。
- 出错时(如沙箱拒绝、平台不支持)图标变红,原因在 Tooltip 中显示;
  定位中图标禁用。
- 除 Harness 自身外零运行时依赖:Host 仅用 `node:child_process`,
  Client 仅用平台的 `react` 种子。

## 环境要求

- DeepSeek Harness Web(`web` profile),即 `dsh web`。
- Node.js `>= 22.6.0`。
- 桌面环境可被系统打开器触达(macOS 与 Windows 始终可以;Linux 需要
  显示服务器或 WSL)。

## 安装

```bash
# 从 GitHub 安装(pnpm 的 git spec;#main 固定主分支):
dsh plugin --profile web add github:yumm007/dsh-reveal-files#main
```

`dsh plugin` 会在 profile 目录内把参数转发给 pnpm,随后自动对账
`dsh.profile.bundles`。因为包声明了 `dsh.bundle.patch`,它会自动加入
profile 层栈——无需手动编辑 `cordis.yml`。

安装后重启 web profile:

```bash
dsh web
```

插件作为 bundle 在启动时加载:Host 半部注册 `POST /api/reveal-files` 路由,
Client 半部在产物文件行挂载图标。

## 使用方法

1. 让助手在一个回合内产出若干文件(任意 `write` / `edit` / 变更类工具结果)。
2. 在该消息下方找到带文件 chips 的「产物」行。
3. 点击 chips 旁的文件夹图标——文件在系统文件浏览器中打开并被选中或定位。
4. 悬停图标可看 Tooltip;若定位失败,Tooltip 会显示错误原因,图标变红。

## 配置

`cordis.patch.yml` 中的插件行可配置:

```yaml
- insert:
    - id: dsh-reveal-files
      name: 'dsh-reveal-files'
      config:
        enabled: true          # 是否注册 reveal 路由(默认 true)
        revealTimeoutMs: 10000 # 单条系统命令超时(毫秒,默认 10000)
```

如需覆盖,可在 profile 自己的 `cordis.patch.yml` 中修改。

## 工作原理

| 层 | 文件 | 说明 |
| --- | --- | --- |
| Host | `lib/index.js` | Cordis 插件行 `dsh-reveal-files`(注入 `webServer` 与 `sessions`),注册 `POST /api/reveal-files`。按平台执行 `open -R` / `xdg-open` / `explorer /select,`,相对路径按会话 cwd 解析,返回 JSON 结果。 |
| Client | `client/client.js` | web 模块(`window.__ModuleLoader__.load`),由 Harness 客户端模块系统注册。以 `priority: -1` 认领 `conversation.chat.turnTail` 链条,`select` 读取回合的 `deliverables` 数据(与内置行同一数据源),渲染 chips 行与定位图标。 |

### 为什么用 `priority: -1`?

turn-tail 插槽是一条**链条**:条目按 priority 升序尝试,第一个 `select`
返回非 null 的胜出。内置的「产物」行注册在 `priority: 0`。注册为 `-1`
使本插件的条目排在最前,从而渲染出定位图标,同时文件检测行为与内置
完全一致。若不显式指定 priority,两条目同为 `0` 并列,内置行会静默胜出。

## 卸载

```bash
dsh plugin --profile web remove dsh-reveal-files
```

对账步骤也会将该包从 `dsh.profile.bundles` 移除;随后重启 web profile。

## 开发

本地开发时可直接安装工作区副本(从磁盘安装,编辑后通过
`dsh plugin --profile web update dsh-reveal-files` 更新):

```bash
dsh plugin --profile web add file:/绝对路径/dsh-reveal-files
# 编辑后: dsh plugin --profile web update dsh-reveal-files
```

webServer 以 rev 哈希 URL 从磁盘提供 client bundle,刷新即可看到 Client
改动;Host 路由改动需要重启。

## 变更日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

[MIT](./LICENSE)
