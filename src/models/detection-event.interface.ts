export interface DetectionEvent {
  splitNumber: number;
  clientId: string;
  timestamp: number;
  detectionData: any; // Structure from the existing detection component
}
