# 商品目录一键导入能力

## CAPABILITY

运营人员在本机选择一个商品的 3D 文件和目标类目，填写一次商品信息后，导入器自动建立商品目录、生成商品元数据与静态分享页、更新展厅目录，并在验证通过后给出可提交到 Git 的变更清单。前台访客无需知道该流程，仍通过分类菜单浏览商品。

## CONSTRAINTS

- 当前项目是纯静态站，没有后台、数据库或登录系统；浏览器页面不能安全地直接写入 Git 仓库。
- 一个商品在 MVP 中只属于一个类目；商品 ID 和目录名必须是小写字母、数字、下划线组成的稳定 slug。
- 每个已发布商品必须有 `model.glb` 和 `info.json`；导入时验证 GLB、JSON、贴图格式、模型体积与法线贴图所需的切线数据。
- `products/catalog.json` 将成为前台目录的唯一数据源；前端不得再硬编码商品清单。
- 导入不自动部署。导入成功后仍由运营人员确认 Git diff、提交并推送，避免误发商品。

## IMPLEMENTATION CONTRACT

### Actors

- 运营人员：在 Mac 本机执行导入器，选择类目和商品文件。
- 前台访客：浏览自动生成的目录、商品详情、静态分享页和 3D 模型。

### Data model

`products/catalog.json`：

```json
{
  "categories": [
    {
      "id": "yuanxing_dizuo",
      "name": "圆形底座",
      "products": [
        {
          "id": "ziguangtan_tengtiao",
          "name": "紫光檀藤条/回纹圆底座",
          "path": "yuanxing_dizuo/ziguangtan_tengtiao"
        }
      ]
    }
  ]
}
```

商品目录：

```text
products/<category-id>/<product-id>/
  info.json
  model.glb
  index.html             # 自动生成的静态分享页
```

### Import command

默认使用交互式命令，避免记忆参数：

```bash
npm run add-product
```

流程：

1. 终端显示现有类目并让运营人员用数字选择；也可新建类目。
2. 选择一个商品包文件夹（内有 `model.glb`，推荐同时有 `info.json`）；只在缺少信息时输入商品名称、价格和描述。
3. 导入器建议 slug，运营人员确认后创建商品目录。
4. 复制模型到临时目录，修复零长度切线并验证 GLB；不兼容的 WebP 贴图或缺失的法线切线会被拒绝，避免发布后才发现浏览器无法显示。
5. 更新 `products/catalog.json`，生成静态分享页和无脚本目录。
6. 运行 `npm test`，打印变更文件和下一步 Git 命令。

非交互模式供批量导入或自动化使用：

```bash
npm run add-product -- --source /absolute/path/product-package --category yuanxing_dizuo --product-id xinyue --name "商品名" --price "¥ 88" --description "商品简介"
```

### States and recovery

`source selected` → `metadata entered` → `model validated` → `catalog generated` → `tests passed` → `ready to commit`。

任何验证或测试失败时，导入器恢复 `catalog.json` 和首页，并删除本次新建的目标商品目录；原始商品包不会被移动或修改。

## NON-GOALS

- 不在静态前台直接上传文件或自动推送 Git。
- 不处理库存、下单、支付、客户账号或多商家权限。
- 不负责原始 3D 建模；导入器只做格式、贴图与规范校验。

## OPEN QUESTIONS

- 一个商品未来是否需要同时出现在多个类目？MVP 按单类目实现。
- 商品是否需要独立海报图和多个尺寸/颜色变体？MVP 只要求 GLB。
- 部署是否固定 GitHub Pages？确定域名后可自动生成 canonical 和 sitemap。

## HANDOFF

已可直接进入实现。下一步应增加 `products/catalog.json`、目录生成器和 `npm run add-product`；完成后，新增商品只需选择类目和商品文件，不再手改前端代码。
