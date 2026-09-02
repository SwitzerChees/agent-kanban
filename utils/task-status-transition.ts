export interface TaskStatusColumn {
  id: string;
  key: string;
  done: boolean;
}

export type AgentTaskStatus = 'idle' | 'queued' | 'running' | 'waiting_external' | 'failed' | 'done';

/**
 * Completed agent tasks are handed back in review. The detail view may finish
 * that hand-off through the same column update endpoint used by Kanban DnD,
 * without unlocking any of the task's other post-run fields or transitions.
 */
export function canCompleteReviewedAgentTask(
  agentStatus: AgentTaskStatus,
  currentColumn: TaskStatusColumn | null | undefined,
  targetColumn: TaskStatusColumn | null | undefined,
) {
  return agentStatus === 'done'
    && currentColumn?.key === 'in_review'
    && targetColumn?.done === true;
}
