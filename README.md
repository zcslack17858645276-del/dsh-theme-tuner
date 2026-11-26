# @local/dsh-theme-tuner

像 Codex「外观」那样自定义 DSH 的**强调色 / 背景 / 前景**。

## 功能

- 在「设置 → 通用」里注册三行配色设置（强调色、背景、前景），右侧控件模仿 Codex：
  下拉式胶囊按钮（自定义 / 默认 + 色点 + 十六进制值 + chevron），点击后在行内展开面板。
- 面板内含 10 个预设色板、十六进制输入框、应用与「恢复默认」。
- 选色后通过官方第三方主题扩展点 `ctx.theme.overrideTokens()` 注册一层 alias token 覆盖，
  宿主 `ThemePresenter` 会把合成后的 token 写成 `body` 的行内 CSS 变量，整个客户端即时换色，无需刷新。
- 配色保存在本机浏览器 `localStorage["dsh.theme-tuner.v1"]`；三色都恢复默认时移除覆盖层，
  宿主原始配色原样返回。
- 语义色（成功 / 错误 / 警告 / diff / 遮罩）保持宿主定义不动。

## 只覆盖你改了的颜色

`deriveTokens()` 把派生结果分成 `surfaces` / `text` / `accent` 三组，`syncOverrides()` 只合并
用户实际自定义的那几组：

| 用户选项 | 覆盖的 alias token |
| --- | --- |
| 强调色 | state-business-primary / link / button-info-fill / button-primary-fill / interactive-bg-hover-accent / label-primary-bluish / 焦点环 `--dsw-focus-ring-color` 等 |
| 背景 | bg-base / bg-layer-1..3 / bg-overlay / specific-sidebar-fill / specific-input-major / specific-bubble / markdown-code-block / menu-surface / toast / tooltip 等 |
| 前景 | label-primary / secondary / tertiary / caption / dimmed / menu-icon / border-l1..l4（按前景 alpha 派生）/ 滚动条等 |

这样只改强调色时，背景 token 一动不动——装了 `dsh-video-skin` 这类会把背景改成半透明的皮肤时，
视频背景不会被我们的不透明纯色盖掉。

## 与皮肤插件的相处

个别皮肤插件会用 `!important` 覆盖同一批 alias token（宿主 presenter 写的 `body` 行内样式压不过
样式表里的 `!important`）。本插件在需要时把同一份 token 镜像进自建
`<style data-plugin-css="@local/dsh-theme-tuner/hard.css">`，用
`html body[data-ds-theme-tuner][data-ds-theme-tuner]` 的更高特异性取胜；三色都恢复默认时整张表移除。

## 文件

- `index.js` — 宿主半侧：功能全在浏览器半侧，这里只保留最小 Cordis 入口。
- `client.js` — 浏览器半侧：设置行、颜色工具、token 派生与覆盖层。
- `cordis.patch.yml` — bundle patch：插入 `theme-tuner` 条目。

## 验证

打开「设置 → 通用」，三行配色出现在「外观」附近。改色会实时反映到整个界面；
`window.__DSH_THEME_TUNER_DEBUG__ = true` 后可通过 console 观察 `[theme-tuner]` 诊断输出，
`window.__DSH_THEME_TUNER__` 暴露 `store` / `defaults` / `deriveTokens` / `apply` 便于排查。
