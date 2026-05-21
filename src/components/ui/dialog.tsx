import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/**
 * 渲染弹窗根节点。
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

// 弹窗触发器，支持 Radix ref 透传。
const DialogTrigger = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(
  /**
   * 渲染弹窗触发器。
   */
  function DialogTrigger({
    ...props
  }, ref) {
    return <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />
  }
)

/**
 * 渲染弹窗 Portal。
 */
function DialogPortal({
  container,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal> & {
  /** 可选 Portal 容器，未提供时默认挂载到 body。 */
  container?: HTMLElement | null
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" container={container ?? undefined} {...props} />
}

// 弹窗关闭按钮，支持 Radix ref 透传。
const DialogClose = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(
  /**
   * 渲染弹窗关闭控件。
   */
  function DialogClose({
    ...props
  }, ref) {
    return <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />
  }
)

// 弹窗遮罩，支持 Radix ref 透传。
const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(
  /**
   * 渲染弹窗遮罩。
   */
  function DialogOverlay({
    className,
    ...props
  }, ref) {
    return (
      <DialogPrimitive.Overlay
        ref={ref}
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      />
    )
  }
)

/**
 * 定义弹窗内容组件属性。
 */
type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** 是否展示默认关闭按钮。 */
  showCloseButton?: boolean
  /** 可选 Portal 容器，未提供时默认挂载到 body。 */
  container?: HTMLElement | null
}

// 弹窗内容，支持 Radix ref 透传。
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  /**
   * 渲染弹窗内容。
   */
  function DialogContent({
    container,
    className,
    children,
    showCloseButton = true,
    ...props
  }, ref) {
    return (
      <DialogPortal container={container}>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" asChild>
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              >
                <XIcon
                />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  }
)

/**
 * 渲染弹窗头部。
 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * 渲染弹窗底部。
 */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

// 弹窗标题，支持 Radix ref 透传。
const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(
  /**
   * 渲染弹窗标题。
   */
  function DialogTitle({
    className,
    ...props
  }, ref) {
    return (
      <DialogPrimitive.Title
        ref={ref}
        data-slot="dialog-title"
        className={cn(
          "text-base leading-none font-medium",
          className
        )}
        {...props}
      />
    )
  }
)

// 弹窗描述，支持 Radix ref 透传。
const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(
  /**
   * 渲染弹窗描述。
   */
  function DialogDescription({
    className,
    ...props
  }, ref) {
    return (
      <DialogPrimitive.Description
        ref={ref}
        data-slot="dialog-description"
        className={cn(
          "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          className
        )}
        {...props}
      />
    )
  }
)

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
