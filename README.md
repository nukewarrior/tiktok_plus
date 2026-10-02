# TikTok Plus

[English](README_en.md)

为 TikTok 网页版添加键盘快捷键和评论逐条翻译。

## 快捷键

### 播放控制

| 快捷键 | 功能 |
| --- | --- |
| `Space` | 暂停 / 播放当前视频 |
| `↑` / `↓` | 切换到上一个 / 下一个视频 |
| `←` / `→` | 后退 / 前进 5 秒 |
| `H` / `F` | 切换播放器全屏 |
| `Esc` | 退出全屏；快捷键面板打开时则关闭面板 |

### 互动

| 快捷键 | 功能 |
| --- | --- |
| `Z` | 点赞当前视频 |
| `X` | 打开评论区 |
| `C` | 收藏当前视频 |
| `V` | 复制当前页面标题和链接 |
| `B` | 开关弹幕（如果页面提供对应控件） |
| `R` | 标记为不感兴趣 |
| `G` | 关注作者 |

### 搜索与帮助

| 快捷键 | 功能 |
| --- | --- |
| `Shift + F` | 聚焦搜索框 |
| `Shift + ?` | 显示 / 隐藏快捷键面板 |

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 在脚本管理器中新建用户脚本，将 [`tiktok_plus.js`](tiktok_plus.js) 的全部内容粘贴进去并保存。
3. 打开或刷新 [TikTok 网页版](https://www.tiktok.com/)。

## 使用说明

- 脚本仅匹配 `https://www.tiktok.com/*`。
- 多数快捷键在输入框等可编辑控件聚焦时会停用，以免干扰输入；`Esc`、`Shift + F` 和 `Shift + ?` 仍可触发。
- 互动操作依赖 TikTok 页面当前提供的控件；TikTok 更新页面后，个别快捷键可能需要适配。

## 评论翻译

- 主评论和展开后的回复正文下方会出现“翻译”按钮；空评论、纯图片和纯表情不显示。
- 点击后使用 Google 翻译为简体中文；“查看原文” / “查看译文”可来回切换，同一评论节点内的切换不会重复请求。
- 翻译失败时保留原文，点击“翻译失败，重试”手动重试。只翻译正文，用户名、图片和原有操作不受影响。
- 每次点击翻译会将该条评论正文发送到 `translate.googleapis.com`，匿名请求不携带 Cookie。脚本仅申请 `GM_xmlhttpRequest` 和该域名的跨域连接权限，无需 API Key。
- 使用的是 Google 免 Key 非正式接口，可能限流或失效；翻译质量及服务可用性没有保证，需要网络能够访问该域名。
- 更新已安装脚本时，保存新版本并刷新 TikTok 页面；若脚本管理器提示连接权限，仅允许 `translate.googleapis.com`。

## 验证

用浏览器打开 [`tests/comment-translation.html`](tests/comment-translation.html)，自动运行翻译交互和快捷键回归检查。测试使用模拟响应，不向 Google 发送请求；刷新页面可重新运行。该测试不能替代 TikTok 实际页面及脚本管理器中的验收。

## 许可

[MIT](LICENSE)
