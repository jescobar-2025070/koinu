export interface User {
  id: string;
  email: string;
  isActive: boolean;
  roles: string[];
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  sessionIdleTimeoutMs?: number;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string | null;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export const TERMINAL_SESSION_CODES = [
  'TOKEN_EXPIRED',
  'REFRESH_TOKEN_EXPIRED',
  'REFRESH_TOKEN_INVALID',
  'SESSION_IDLE_EXPIRED',
] as const;

export function isTerminalSessionError(error: unknown): boolean {
  const code = (error as { error?: { error?: { code?: string } } } | undefined)?.error?.error?.code;
  return TERMINAL_SESSION_CODES.some((c) => c === code);
}