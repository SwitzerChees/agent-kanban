import { SymphonyOrchestrator } from './orchestrator';

declare global {
  // eslint-disable-next-line no-var
  var __symphonyOrchestrator: SymphonyOrchestrator | undefined;
}

export function getSymphonyService(): SymphonyOrchestrator {
  if (!globalThis.__symphonyOrchestrator) {
    globalThis.__symphonyOrchestrator = new SymphonyOrchestrator();
  }
  return globalThis.__symphonyOrchestrator;
}
