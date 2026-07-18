# 雨山红木 3D 数字展厅

这是一个零依赖的静态 3D 产品展示站。商品元数据和 GLB 模型都保存在仓库内；浏览器端固定使用仓库内的 `model-viewer` 3.1.1，不依赖 Google CDN。模型贴图采用 PNG，不要求浏览器支持 WebP。

## 本地运行

需要 Node.js 20 或更高版本：

```bash
npm test
npm run serve
```

随后访问 `http://127.0.0.1:4173`。请不要直接双击 `index.html`：浏览器会阻止 `file://` 页面读取 `info.json`。

## 验证

`npm test` 使用 Node 内置测试，覆盖：

- 商品快速切换时只渲染最新请求；
- 元数据读取失败的用户可见错误；
- 商品路径构造；
- 百度统计只在明确同意后加载。
- GLB 不依赖 `EXT_texture_webp`；
- 静态商品页具备独立的产品元数据与 3D 展厅入口。

GitHub Actions 会在 push 和 pull request 中运行同一验证。

## 添加商品

新商品不需要手动修改前端文件。准备含有 `model.glb`（推荐同时包含 `info.json`）的商品包文件夹，然后执行：

```bash
npm run add-product -- --source "/商品包的完整路径"
```

完整操作、商品包格式、模型限制和回滚方式见 [商品导入说明书](./docs/商品导入说明.md)。`products/catalog.json` 是商品目录唯一来源；需要重建全部静态商品页时使用 `npm run generate-catalog`。

## 部署要求

将仓库根目录作为静态站根目录部署，并确保：

- `.glb` 返回 `Content-Type: model/gltf-binary`；
- `index.html`、`app.js`、`app-core.js`、`styles.css` 和 `vendor/` 使用短缓存；带版本号的 GLB 可使用长期缓存；
- 生产响应至少设置 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`，并将本页的 CSP 转为 HTTP 响应头；
- 全站仅通过 HTTPS 提供服务。

内置开发服务器仅用于本地预览，故意使用 `Cache-Control: no-store`，不能代替生产服务器。

## 隐私

百度统计默认关闭，只有访客点击“同意并启用”后才会加载。选择会保存在该浏览器的 localStorage；详细说明见 [隐私说明](./privacy.html)。

## 搜索与分享

首页提供通用元数据；每个商品另有静态分享页，即使抓取器不执行 JavaScript 也能读取产品标题、简介与价格：

- [臻品紫光檀·明式雕花圆底座](./products/yuanxing_dizuo/ziguangtan_tengtiao/)
- [雅韵花梨木·回纹正方底座](./products/fangxing_dizuo/hualimu_huiwen/)
