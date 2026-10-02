# TikTok Plus

[English](README_en.md)

为 TikTok 网页版添加键盘快捷键，用于播放控制、视频互动和搜索。

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

## 许可

[MIT](LICENSE)
