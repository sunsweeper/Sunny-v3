export type SunnyRuntimeState = Record<string, unknown> & {
  intent?: string | null;
  outcome?: string;
  needsHumanFollowup?: boolean;
};

export type SunnyRuntimeResult = {
  reply: string;
  state: SunnyRuntimeState;
};

export type SunnyRuntime = {
  handleMessage: (message: string, state?: SunnyRuntimeState) => SunnyRuntimeResult;
};

export function createSunnyRuntime(options?: {
  knowledgeDir?: string;
  outcomeLogPath?: string;
  logger?: Console;
}): SunnyRuntime;

export const SAFE_FAIL_MESSAGE: string;
