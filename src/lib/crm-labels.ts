export const sourceLabels: Record<string, string> = {
  excel_import: "Excel 导入",
  product_search: "产品搜索",
  manual: "手动录入",
  mock: "模拟",
  exa: "EXA",
  tavily: "Tavily",
  you: "YOU",
  minimax: "MiniMax",
  uploaded_excel: "上传表格"
};

export const buyerFitLabels: Record<string, string> = {
  high: "高匹配",
  medium: "中匹配",
  low: "低匹配",
  unknown: "未知"
};

export const companyRoleLabels: Record<string, string> = {
  importer: "进口商",
  distributor: "经销商 / 分销商",
  trading_company: "贸易公司",
  manufacturer: "制造商",
  end_user: "终端用户",
  unknown: "未知"
};

export const suggestedActionLabels: Record<string, string> = {
  email_first: "优先邮件",
  whatsapp_first: "优先 WhatsApp",
  manual_review: "人工复核",
  skip: "跳过"
};

export const emailStatusLabels: Record<string, string> = {
  none: "无草稿",
  draft: "草稿",
  waiting_review: "待审核",
  approved: "已批准",
  skipped: "已跳过",
  saved: "已保存",
  sent: "已发送",
  failed: "失败"
};

export const companyStatusLabels: Record<string, string> = {
  new: "新客户",
  imported_candidate: "导入候选",
  product_search_candidate: "产品搜索候选",
  enriched: "已补全",
  scored: "已评分",
  drafted: "已生成草稿",
  email_approved: "邮件已批准",
  email_skipped: "邮件已跳过",
  contacted: "已联系",
  replied: "已回复",
  invalid: "无效",
  blacklist: "黑名单",
  saved_to_crm: "已入库"
};

export const evidenceTypeLabels: Record<string, string> = {
  excel_import: "Excel 导入证据",
  product_search: "产品搜索证据",
  website_search: "官网搜索证据",
  website_not_found: "未找到官网",
  email_search: "邮箱搜索证据",
  phone_search: "电话搜索证据",
  whatsapp_search: "WhatsApp 搜索证据",
  social_search: "社媒搜索证据",
  contact_search: "联系方式搜索证据",
  buyer_fit: "客户匹配评分证据",
  email_draft: "开发信草稿证据"
};

export function labelValue(
  value: string | undefined | null,
  labels: Record<string, string>,
  fallback = "-"
) {
  if (!value) return fallback;
  return labels[value] ?? value;
}

export function toLabelOptions(values: readonly string[], labels: Record<string, string>) {
  return values.map((value) => ({ value, label: labelValue(value, labels) }));
}
