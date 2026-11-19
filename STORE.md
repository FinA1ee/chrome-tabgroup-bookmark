# Chrome Web Store 上架材料

## 基本信息

- 名称：Tab 组收录
- 短描述（建议）：把标签组中选中的页面归档成书签，支持日期文件夹和重新打开为标签组。
- 分类：Productivity
- 语言：中文（可后续补英文 `_locales`）
- 版本：1.1.0
- 官网/仓库：https://github.com/FinA1ee/chrome-tabgroup-bookmark
- 隐私说明：https://github.com/FinA1ee/chrome-tabgroup-bookmark/blob/main/PRIVACY.md

## 详细描述

用 Chrome 标签组管理项目很方便，但整理完标签后，重要链接容易一起被删掉。Tab 组收录可以把标签组按选中页面归档到书签：

- 展开标签组，只选择需要保留的页面
- 按「日期 + 组名」创建书签文件夹
- 默认归档到「书签栏 / 需求归档」，也可以选择任意书签文件夹
- 同名文件夹复用，同 URL 去重，重复收录不会产生重复书签
- 归档成功后可以自动删除已收录页面；未选页面和有写入失败的页面会保留
- 历史归档可以一键重新打开为标签组

扩展完全在本机运行，不读取网页正文，不发起网络请求，不上传数据。

## 权限用途

- `tabs`：读取标签组内页面的标题和 URL；重新打开归档时创建标签页
- `tabGroups`：读取标签组名称；重新打开归档时创建标签组
- `bookmarks`：创建、复用归档文件夹和书签
- `storage`：保存归档位置和开关设置

没有 `host_permissions`，没有内容脚本，没有远程代码。

## 隐私实践

- 是否收集用户数据：否
- 是否向第三方传输数据：否
- 是否使用远程代码：否
- 是否使用广告/分析：否
- 详细说明：见 `PRIVACY.md`

## 截图清单

建议准备 1280×800 或商店要求的尺寸：

1. 弹窗列出多个标签组、展开页面选择
2. 只勾选部分页面并显示「收录选中 N」
3. 归档结果（新增/跳过/失败/删除）
4. 书签栏中的日期归档文件夹
5. 历史归档点击「以标签组打开」后的标签组

## 打包

扩展目录即发布目录，无需构建。打包时只包含运行文件：

```text
manifest.json
background.js
popup.html
popup.css
popup.js
lib.js
icons/
PRIVACY.md
```

不要把 `test.mjs`、`test-background.mjs`、`design.md`、`tasks.md`、`.git/` 或开发截图打进商店包。
