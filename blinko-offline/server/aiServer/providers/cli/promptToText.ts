import type {
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
} from '@ai-sdk/provider';

function renderUserContentParts(
  parts: Array<
    | LanguageModelV1TextPart
    | { type: 'image'; image: Uint8Array | URL; mimeType?: string }
    | { type: 'file'; data: string | URL; mimeType: string; filename?: string }
  >,
): string {
  return parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'image') return '[image omitted]';
      if (part.type === 'file') return `[file omitted: ${part.mimeType}]`;
      return '[unknown part omitted]';
    })
    .join('');
}

function renderAssistantContentParts(
  parts: Array<
    | LanguageModelV1TextPart
    | { type: 'file'; data: string | URL; mimeType: string; filename?: string }
    | { type: 'reasoning'; text: string }
    | { type: 'redacted-reasoning'; data: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  >,
): string {
  return parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'reasoning') return part.text;
      if (part.type === 'redacted-reasoning') return '[redacted reasoning omitted]';
      if (part.type === 'file') return `[file omitted: ${part.mimeType}]`;
      if (part.type === 'tool-call') return `[tool-call omitted: ${part.toolName}]`;
      return '[unknown part omitted]';
    })
    .join('');
}

export function promptToPlainText(prompt: LanguageModelV1Prompt): string {
  const lines: string[] = [];

  for (const message of prompt as LanguageModelV1Message[]) {
    if (message.role === 'system') {
      lines.push(`System: ${message.content}`);
      continue;
    }

    if (message.role === 'user') {
      lines.push(`User: ${renderUserContentParts(message.content as any)}`);
      continue;
    }

    if (message.role === 'assistant') {
      lines.push(`Assistant: ${renderAssistantContentParts(message.content as any)}`);
      continue;
    }

    if (message.role === 'tool') {
      const toolSummaries = (message.content as any[]).map((part) => {
        if (part?.type !== 'tool-result') return '[tool-result omitted]';
        const toolName = part.toolName ?? 'unknown-tool';
        const isError = part.isError ? ' error' : '';
        return `[tool-result${isError}: ${toolName}]`;
      });
      lines.push(`Tool: ${toolSummaries.join(' ')}`);
      continue;
    }
  }

  return lines.join('\n');
}

