export interface WebSocketMessage {
  type:
    | 'register'
    | 'detection-event'
    | 'heartbeat'
    | 'welcome'
    | 'clients-update'
    | 'detection-broadcast'
    | 'error';
  data?: any;
  timestamp: number;
  clientId?: string;
  splitNumber?: number;
  detectionData?: any;
  fromSplit?: number;
}
