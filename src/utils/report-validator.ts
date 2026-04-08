export interface ReportValidationResult {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

// Structural validator for generated reports.
// Checks for presence of mandatory fields: drives, position, stop-loss, ticker code.
export function validateReport(report: string): ReportValidationResult {
  const missingFields: string[] = [];

  // 驱动力标签
  if (!/基本面驱动|叙事驱动|政策驱动|Fundamental|Policy|Narrative/i.test(report)) {
    missingFields.push('驱动力类型标签');
  }
  // 仓位建议
  if (!/仓位|%|试探|position/i.test(report)) {
    missingFields.push('仓位建议');
  }
  // 止损条件
  if (!/止损|stop|风控|证伪/i.test(report)) {
    missingFields.push('止损条件');
  }
  // 标的代码 ($TICKER)
  if (!/\$[A-Z]{1,5}\b/.test(report)) {
    missingFields.push('标的代码($TICKER)');
  }

  const valid = missingFields.length === 0;
  const warnings = missingFields.map(field => `缺少必填字段: ${field}`);
  return { valid, missingFields, warnings };
}
