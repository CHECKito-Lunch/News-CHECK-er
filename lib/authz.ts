// lib/authz.ts
import 'server-only';



export type Role = 'admin' | 'moderator' | 'user';
export type User = { id: string; sub?: string; role?: Role; name?: string; email?: string };


export { getUserFromRequest } from './getUserFromRequest';
