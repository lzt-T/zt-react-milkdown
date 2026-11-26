import type { Node as ProseNode } from '@milkdown/prose/model';
import type { NodeView, NodeViewConstructor } from '@milkdown/prose/view';

/**
 * 为表格节点提供独立的 `.tableWrapper` 横向滚动容器，避免宽表格撑出整区横向滚动条。
 */
class TableScrollNodeView implements NodeView {
  /** 外层横向滚动容器。 */
  readonly dom: HTMLDivElement;
  /** ProseMirror 渲染表格行的 `tbody` 挂载目标。 */
  readonly contentDOM: HTMLTableSectionElement;
  /** 当前绑定的表格文档节点。 */
  private node: ProseNode;

  constructor(node: ProseNode) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'tableWrapper';

    const table = document.createElement('table');
    this.contentDOM = document.createElement('tbody');
    table.append(this.contentDOM);
    this.dom.append(table);
  }

  /**
   * 节点仍为表格时原地复用容器，保留现有横向滚动位置。
   */
  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    return true;
  }
}

/**
 * 创建轻量表格横向滚动容器 NodeView 工厂。
 */
export const createTableScrollNodeView = (): NodeViewConstructor => {
  return (node) => new TableScrollNodeView(node);
};
