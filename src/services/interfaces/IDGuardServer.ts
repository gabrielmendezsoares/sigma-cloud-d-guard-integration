export interface IDGuardServer {
  id: number;
  ip: string;
  port: number;
  username: Uint8Array;
  password: Uint8Array;
  created_at: Date;
  updated_at: Date;
}
