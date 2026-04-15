/**
 * 断言目标对象上存在必需键。
 */
export const assertKey = <T extends Record<string, unknown>>(
  value: T,
  key: string
): unknown => {
  if (!(key in value)) {
    throw new Error(`Milkdown API 缺少必需导出: ${key}`);
  }

  return value[key];
};
