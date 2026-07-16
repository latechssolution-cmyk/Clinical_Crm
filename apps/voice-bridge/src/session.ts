import type { TenantContext } from './tenant.js';
import type { ServiceMode } from './instructions.js';

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
  at: string; // ISO timestamp
}

/** Mutable state shared across one live call (bridge, tools, finalize). */
export interface CallSession {
  callId: string;
  callSid: string | null;
  tenant: TenantContext;
  fromNumber: string;
  mode: ServiceMode;
  startedAt: number; // epoch ms (media stream start)
  transcript: TranscriptTurn[];
  /** Set when a tool positively identifies/creates a patient. */
  patientId: string | null;
  /** Set by the end_call tool; bridge hangs up after the final audio. */
  endRequested: boolean;
  /** Set by flag_spam. */
  flaggedSpam: boolean;
  toolCallCount: number;
}
