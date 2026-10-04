export type ToolErrorCode = 'INVALID_ARGS' | 'PRODUCT_NOT_FOUND' | 'AMBIGUOUS_PRODUCT' | 'BUDGET_EXCEEDED' | 'INTERNAL';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  candidates?: { id: string; name: string }[];
}

export type ToolResult<T> =
  | { ok: true; tool: string; data: T; notes: string[] }
  | { ok: false; tool: string; error: ToolError };

export function success<T>(tool: string, data: T, notes: string[] = []): ToolResult<T> {
  return { ok: true, tool, data, notes };
}

export function failure(tool: string, code: ToolErrorCode, message: string, candidates?: ToolError['candidates']): ToolResult<never> {
  return { ok: false, tool, error: { code, message, ...(candidates ? { candidates } : {}) } };
}
