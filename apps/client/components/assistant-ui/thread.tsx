import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { PresentTerminalTool } from "@/components/assistant-ui/present-terminal-tool";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import {
  CommandConsoleChips,
  RecentCommandsStrip,
} from "@/components/chat/CommandConsole";
import { SlashCommandPanel } from "@/components/chat/SlashCommandPanel";
import { Button } from "@darkflow/ui/button";
import { Badge } from "@darkflow/ui/badge";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useEffect, useState, type FC } from "react";

const COMPOSER_INPUT_ID = "darkflow-composer-input";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "56rem",
        ["--composer-radius" as string]: "2px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-3 pb-28 pt-3">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-10 flex flex-col gap-y-8 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer pointer-events-none sticky bottom-0 z-20 mt-auto flex flex-col items-center gap-2 overflow-visible bg-gradient-to-t from-background from-45% via-background/90 to-transparent pb-3 pt-8 md:pb-4 md:pt-10">
            <div className="pointer-events-auto w-full max-w-(--thread-max-width) px-2">
              <ThreadScrollToBottom />
            </div>
            <div className="pointer-events-auto w-full max-w-(--thread-max-width) px-2">
              <Composer />
            </div>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom render={<TooltipIconButton tooltip="Scroll to bottom" variant="outline" className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent" />}><ArrowDownIcon /></ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root my-auto flex grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center gap-2.5 px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-xl tracking-tight text-foreground duration-200 md:text-2xl">
              Agent trading terminal
            </h1>
            <Badge
              variant="outline"
              className="border-border-subtle font-mono text-[9px] text-muted-foreground uppercase leading-none"
            >
              uplink
            </Badge>
            <span className="font-mono text-[9px] text-muted-foreground tabular-data">
              ~42ms · sim
            </span>
          </div>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 max-w-prose animate-in fill-mode-both text-muted-foreground text-sm delay-75 duration-200 md:text-[15px] md:leading-snug">
            Command the desk: queries stream back as structured terminal output — tape and
            intel on the left, chart and quick execution track the active symbol on the
            right.
          </p>
          <RecentCommandsStrip />
          <CommandConsoleChips />
        </div>
      </div>
      <div className="px-4 pb-2">
        <p className="mb-1.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
          Try
        </p>
        <ThreadSuggestions />
      </div>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 @lg:grid-cols-3 gap-2 pb-4">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @lg:nth-[n+4]:block nth-[n+4]:hidden animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send render={<Button variant="ghost" className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-sm border border-border-subtle bg-background px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted" />}><SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 font-medium" /><SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 text-muted-foreground empty:hidden" /></SuggestionPrimitive.Trigger>
    </div>
  );
};

const Composer: FC = () => {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [appleLike, setAppleLike] = useState(false);

  useEffect(() => {
    setAppleLike(
      typeof navigator !== "undefined" &&
        (/(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent) ||
          navigator.platform === "MacIntel"),
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key.toLowerCase() !== "k") return;
      if (e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      document.getElementById(COMPOSER_INPUT_ID)?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <SlashCommandPanel />
      <ComposerPrimitive.AttachmentDropzone
        render={
          <div
            data-slot="aui_composer-shell"
            className={cn(
              "aui-composer-shell-terminal relative flex w-full flex-col gap-1.5 rounded-(--composer-radius) border border-border-subtle bg-background/92 p-(--composer-padding) shadow-[0_14px_48px_-10px_rgba(0,0,0,0.92),0_4px_16px_-4px_rgba(0,0,0,0.75)] backdrop-blur-md transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_rgba(0,255,163,0.12),0_14px_48px_-10px_rgba(0,0,0,0.92)] focus-within:ring-1 focus-within:ring-primary/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50",
              isRunning &&
                "shadow-[0_0_0_1px_rgba(0,255,163,0.35),0_14px_48px_-10px_rgba(0,0,0,0.92)] animate-pulse",
            )}
          />
        }
      >
        <ComposerAttachments />
        <ComposerPrimitive.Input
          id={COMPOSER_INPUT_ID}
          placeholder="Message the desk… (type / for commands)"
          className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 ps-2.5 font-sans text-sm outline-none placeholder:text-muted-foreground/80"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction appleLike={appleLike} />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{ appleLike: boolean }> = ({ appleLike }) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-2">
      <ComposerAddAttachment />
      <span
        className="ms-auto hidden min-w-0 truncate font-mono text-[8px] text-muted-foreground uppercase tracking-wide sm:inline md:text-[9px]"
        title="Focus the command line"
      >
        <kbd className="rounded-sm border border-border-subtle bg-black/40 px-1 py-px font-mono text-[8px] text-muted-foreground md:text-[9px]">
          {appleLike ? "⌘" : "Ctrl"}
        </kbd>
        <kbd className="ms-0.5 rounded-sm border border-border-subtle bg-black/40 px-1 py-px font-mono text-[8px] text-muted-foreground md:text-[9px]">
          K
        </kbd>
        <span className="ms-1.5 text-muted-foreground/90">focus</span>
      </span>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send render={<TooltipIconButton tooltip="Send message" side="bottom" type="button" variant="default" size="icon" className="aui-composer-send size-8 shrink-0 rounded-full" aria-label="Send message" />}><ArrowUpIcon className="aui-composer-send-icon size-4" /></ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel render={<Button type="button" variant="default" size="icon" className="aui-composer-cancel size-8 shrink-0 rounded-full" aria-label="Stop generating" />}><SquareIcon className="aui-composer-cancel-icon size-3 fill-current" /></ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 relative animate-in duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="wrap-break-word px-2 text-foreground leading-relaxed"
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            ReasoningGroup,
            tools: {
              Fallback: ToolFallback,
              by_name: {
                present_terminal: PresentTerminalTool,
              },
            },
          }}
        />
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ms-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}><AuiIf condition={(s) => s.message.isCopied}>
                      <CheckIcon />
                    </AuiIf><AuiIf condition={(s) => !s.message.isCopied}>
                      <CopyIcon />
                    </AuiIf></ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Refresh" />}><RefreshCwIcon /></ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger render={<TooltipIconButton tooltip="More" className="data-[state=open]:bg-accent" />}><MoreHorizontalIcon /></ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown render={<ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground" />}><DownloadIcon className="size-4" />Export as Markdown
                              </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 grid animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-sm bg-muted px-3 py-2 text-foreground empty:hidden">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit render={<TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4" />}><PencilIcon /></ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root ms-auto flex w-full max-w-[85%] flex-col rounded-sm bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel render={<Button variant="ghost" size="sm" />}>Cancel
                              </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send render={<Button size="sm" />}>Update</ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root -ms-2 me-2 inline-flex items-center text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}><ChevronLeftIcon /></BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}><ChevronRightIcon /></BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
