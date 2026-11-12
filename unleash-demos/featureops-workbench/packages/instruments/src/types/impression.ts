export interface ImpressionEvent {
  type: "impression";
  flag: string;
  enabled: boolean;
  variant?: { name: string; payload?: { type: string; value: string } };
  context?: { userId?: string; sessionId?: string; [key: string]: unknown };
  timestamp: string;
  source?: string;
}
