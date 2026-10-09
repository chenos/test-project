# test-project

Customer management application.

## 需求与数据模型

[PM-1 设计方案](proposal.md)包含字段类型、必填与默认值、表间关系、业务规则、角色权限矩阵及页面验收清单。文件保留正式提交的方案全文。

Super Admin 已将 PM-1 从 proposal_review 推进至 in_progress，方案按工作流视为批准。proposal.md 中“待确认”和“建议”为原始提交措辞；团队成员归属和金额币种仍需在后续应用配置前明确，不在本文中推定。

后续实施沿用已有任务：PM-2 客户与联系人、PM-3 跟进记录、PM-4 销售机会、PM-5 提醒与统计、PM-6 应用角色与数据权限。权限应在目标 NocoBase 应用中实施，Studio 的团队角色配置不能替代 CRM 数据权限。

当前仓库仅包含设计文档，没有依赖安装或自动化测试要求。业务数据表、页面及权限配置由后续任务交付。
