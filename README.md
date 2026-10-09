# test-project

Customer management application.

## 需求与数据模型

[PM-1 设计方案](proposal.md)包含字段类型、必填与默认值、表间关系、业务规则、角色权限矩阵及页面验收清单。文件保留正式提交的方案全文。

Super Admin 已将 PM-1 从 proposal_review 推进至 in_progress，方案按工作流视为批准。proposal.md 中“待确认”和“建议”为原始提交措辞；团队成员归属和金额币种仍需在后续应用配置前明确，不在本文中推定。

后续实施沿用已有任务：PM-2 客户与联系人、PM-3 跟进记录、PM-4 销售机会、PM-5 提醒与统计、PM-6 应用角色与数据权限。权限应在目标 NocoBase 应用中实施，Studio 的团队角色配置不能替代 CRM 数据权限。

PM-2 已在 NocoBase 3 默认应用模板上实现客户及联系人管理。入口为 `/customers`，支持新增、编辑、公司名检索、负责人/状态/等级组合筛选、更新时间排序和分页；客户详情包含联系人新增与编辑。公司名允许重复并提示检查，联系人电话保留文本格式，编辑使用版本检查避免覆盖他人的更新。删除、跟进、商机、统计不在本次范围。

## 本地运行

使用 Node.js 24+ 和 pnpm（package.json 指定版本）。依赖通过仓库 `.npmrc` 中的 NocoBase registry 安装。

```sh
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm nocobase config check
pnpm nocobase db apply
pnpm dev
```

配置初始化会生成本地 `config.yml` 和应用密钥；该文件及 `storage/` 已被 Git 忽略。先在本地配置中设置 `users.initialAdmin` 的账号信息，再执行首次数据库初始化。不要提交配置、密码或数据库。应用命令使用 `pnpm nocobase`（@nocobase/app-cli）。生成并同步的 AGENTS.md 和开发 Skills 指导后续开发。

当前客户页面与 API 仅向应用的 unrestricted/root 管理员开放；普通登录用户返回 403。PM-6 将根据批准的角色矩阵加入销售/团队权限与负责人范围，团队归属仍按原方案由后续任务确认。

## 验证与构建

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

测试使用独立数据库，默认 SQLite，可由 `NOCOBASE_TEST_DB_DIALECT` 选择其他受支持方言。客户回归测试位于 `tests/logic/customers-api.test.ts`、`tests/logic/customers-migration.test.ts` 和 `tests/components/customers.test.tsx`，覆盖 CRUD、组合筛选、分页、认证/权限、邮箱校验、联系人归属及并发冲突。

浏览器回归位于 `tests/playwright/customers.test.ts`，启动应用自己的服务端和独立测试数据库，使用框架测试账号及虚构数据，结束时清理数据库，不需要个人登录凭据。先运行 `pnpm build`，在具备 Chromium 系统依赖的环境执行 `pnpm exec playwright install chromium` 和 `pnpm test:e2e`。截图写入 Git 忽略的 `storage/ui-workflow/customers/screenshots/`，不保存会话、录像或 trace。受限环境可通过 `PM2_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium；系统库和中文字体由运行环境提供。中文组合输入由 CDP 模拟，操作系统输入法候选窗仍需人工验收。

应用模板的完整运行、代理开发及插件管理说明见 [应用指南](docs/application.md)。
