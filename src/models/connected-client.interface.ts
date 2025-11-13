export interface ConnectedClient {
  id: string;
  splitNumber: number;
  ipAddress: string;
  connectedAt: number;
  lastSeen: number;
  latency?: number;
}
