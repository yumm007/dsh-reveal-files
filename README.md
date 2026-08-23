# dsh-reveal-files

DeepSeek Harness 双面插件:在每条助手消息的「产物」行(产出文件行)旁边
添加一个**文件夹图标按钮**,点击后在**系统文件浏览器**中定位这些文件。

- 🍎 macOS → Finder 中显示(`open -R`,会选中文件)
- 🐧 Linux → 打开文件所在文件夹(`xdg-open`)
- 🪟 Windows → Explorer 中选中(`explorer /select,`)

原有的「点击文件名打开文件」行为保持不变。

## 安装

```bash
# 在本插件目录安装到 web profile(推荐使用 file:/ 绝对路径)
dsh plugin --profile web add file:/绝对路径/dsh-reveal-files
```

安装后重启 `dsh web`(或你的 web profile 进程),插件即随 bundle 加载。

## 卸载

```bash
dsh plugin --profile web remove dsh-reveal-files
```

## 工作原理

| 端 | 内容 |
| --- | --- |
| Host(`lib/index.js`) | cordis 插件行 `dsh-reveal-files`,注入 `webServer` + `sessions`,注册 `POST /api/reveal-files` 路由;用 `open -R` / `xdg-open` / `explorer /select,` 定位文件,相对路径按会话 cwd 解析 |
| Client(`client/client.js`) | web 模块(`window.__ModuleLoader__.load`),在 `conversation.chat.turnTail` 链上以 `select` 匹配「本回合产出的文件」(复用 `deliverables` 回合数据),渲染产物行 + 图标按钮,点击后 fetch Host 路由 |

## 配置

`cordis.patch.yml` 中的插件行可配置:

```yaml
- insert:
    - id: dsh-reveal-files
      name: 'dsh-reveal-files'
      config:
        enabled: true          # 是否注册 reveal 路由
        revealTimeoutMs: 10000 # 单条系统命令超时(毫秒)
```

## 许可

MIT
