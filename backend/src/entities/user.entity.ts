export type AuthProvider = 'local' | 'google';

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  googleSub: string | null;
  authProvider: AuthProvider;
}
