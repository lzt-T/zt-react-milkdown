import { createContext, useContext } from 'react';
import type { EditorTheme } from '../../types/editor';

/**
 * 定义编辑器上下文的数据结构。
 */
export interface EditorContextValue {
  /** 当前主题。 */
  theme: EditorTheme;
}

/** 编辑器上下文默认值。 */
const defaultEditorContextValue: EditorContextValue = {
  theme: 'light'
};

/** 编辑器上下文对象。 */
const EditorContext = createContext<EditorContextValue>(defaultEditorContextValue);

/**
 * 暴露编辑器上下文读取 Hook。
 */
export const useEditorContext = (): EditorContextValue => {
  return useContext(EditorContext);
};

export default EditorContext;
