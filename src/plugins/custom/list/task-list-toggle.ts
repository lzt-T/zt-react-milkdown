import { Plugin } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 任务列表项节点名。
const TASK_LIST_ITEM_NODE_NAME = 'list_item';
// 任务列表项 DOM 选择器。
const TASK_LIST_ITEM_SELECTOR = 'li[data-item-type="task"]';
// checkbox 点击热区宽度。
const CHECKBOX_HITBOX_WIDTH = 24;

/**
 * 判断点击是否落在任务 checkbox 区域。
 */
const isCheckboxClick = (event: MouseEvent, taskItem: HTMLElement): boolean => {
  // 任务列表项位置。
  const rect = taskItem.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.left + CHECKBOX_HITBOX_WIDTH &&
    event.clientY >= rect.top &&
    event.clientY <= rect.top + CHECKBOX_HITBOX_WIDTH
  );
};

/**
 * 查找点击目标所属的任务列表项。
 */
const findTaskItem = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  // 命中的任务列表项。
  const taskItem = target.closest(TASK_LIST_ITEM_SELECTOR);
  return taskItem instanceof HTMLElement ? taskItem : null;
};

/**
 * 命中任务 checkbox 热区时阻止浏览器默认选词行为。
 */
const preventCheckboxSelection = (view: EditorView, event: MouseEvent): boolean => {
  if (!view.editable) {
    return false;
  }

  // 命中的任务列表项。
  const taskItem = findTaskItem(event.target);
  if (!taskItem || !isCheckboxClick(event, taskItem)) {
    return false;
  }

  event.preventDefault();
  return true;
};

/**
 * 切换任务列表项完成状态。
 */
const toggleTaskItem = (view: EditorView, taskItem: HTMLElement): boolean => {
  // 任务列表项位置。
  const itemPosition = view.posAtDOM(taskItem, 0) - 1;
  // 任务列表项节点。
  const taskNode = view.state.doc.nodeAt(itemPosition);

  if (!taskNode || taskNode.type.name !== TASK_LIST_ITEM_NODE_NAME || taskNode.attrs.checked == null) {
    return false;
  }

  view.dispatch(
    view.state.tr.setNodeMarkup(itemPosition, undefined, {
      ...taskNode.attrs,
      checked: !taskNode.attrs.checked
    })
  );
  return true;
};

/**
 * 任务列表 checkbox 点击切换插件。
 */
export const taskListToggle = $prose(() => {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          return preventCheckboxSelection(view, event);
        },
        dblclick: (view, event) => {
          return preventCheckboxSelection(view, event);
        },
        click: (view, event) => {
          if (!view.editable) {
            return false;
          }

          // 命中的任务列表项。
          const taskItem = findTaskItem(event.target);
          if (!taskItem || !isCheckboxClick(event, taskItem)) {
            return false;
          }

          if (!toggleTaskItem(view, taskItem)) {
            return false;
          }

          event.preventDefault();
          return true;
        }
      }
    }
  });
});
