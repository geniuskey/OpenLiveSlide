// Shared room name helpers used by handlers and all service modules.
export const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
export const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;
