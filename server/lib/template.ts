import { Liquid } from 'liquidjs';
import type { Issue } from './types';

const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
});

export async function renderPrompt(template: string, issue: Issue, attempt: number | null): Promise<string> {
  const source = template.trim() || 'You are working on an issue from Linear.';
  return engine.parseAndRender(source, {
    issue,
    attempt,
  });
}
