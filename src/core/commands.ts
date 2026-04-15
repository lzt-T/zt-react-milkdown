/**
 * 创建 replaceAll 命令执行器。
 */
export const createReplaceAllExecutor = (
  replaceAllExport: unknown,
  editor: {
    action: (handler: unknown) => void;
  }
): ((markdown: string) => void) => {
  if (typeof replaceAllExport !== 'function') {
    return () => undefined;
  }

  return (markdown: string): void => {
    editor.action((replaceAllExport as (value: string) => unknown)(markdown));
  };
};
