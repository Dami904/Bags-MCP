export function formatToolError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "An unknown error occurred";
}

export function buildErrorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
