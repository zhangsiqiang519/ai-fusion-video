"use client";

import type { CSSProperties } from "react";
import { XMarkdown } from "@ant-design/x-markdown";
import { cn } from "@/lib/utils";

interface StreamMarkdownProps {
  content: string;
  streaming?: boolean;
  compact?: boolean;
  className?: string;
}

export function StreamMarkdown({
  content,
  streaming = false,
  compact = false,
  className,
}: StreamMarkdownProps) {
  const markdownStyle = {
    "--font-size": compact ? "11px" : "12px",
    "--code-inline-text": compact ? "0.82em" : "0.84em",
    lineHeight: compact ? 1.6 : 1.65,
  } as CSSProperties;

  return (
    <XMarkdown
      content={content}
      streaming={
        streaming
          ? { hasNextChunk: true, tail: true, enableAnimation: true }
          : undefined
      }
      style={markdownStyle}
      className={cn(
        "min-w-0 break-words text-foreground/90",
        compact
          ? "[&_ol]:my-1.5 [&_p]:my-1.5 [&_pre]:my-1.5 [&_ul]:my-1.5"
          : "[&_ol]:my-2 [&_p]:my-2 [&_pre]:my-2 [&_ul]:my-2",
        "[&_ol:first-child]:mt-0 [&_ol:last-child]:mb-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre:first-child]:mt-0 [&_pre:last-child]:mb-0 [&_ul:first-child]:mt-0 [&_ul:last-child]:mb-0",
        className
      )}
    />
  );
}