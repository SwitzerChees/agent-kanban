export interface WikiReferenceAttributes {
  id?: string | null;
  label?: string | null;
  mentionSuggestionChar?: string;
}

export interface WikiReferenceMember {
  id: string;
  name: string;
}

export interface WikiReferenceTask {
  id: string;
  key: string;
  title: string;
}

export interface ResolvedWikiReference {
  id: string;
  char: '@' | '#';
  kind: 'user' | 'task';
  label: string;
}

export function resolveWikiReference(
  attrs: WikiReferenceAttributes,
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
): ResolvedWikiReference {
  const id = attrs.id ?? '';
  const fallbackLabel = attrs.label ?? id;

  if (attrs.mentionSuggestionChar === '#') {
    const task = tasks.find((candidate) => candidate.id === id);
    return {
      id,
      char: '#',
      kind: 'task',
      label: task ? `${task.key} · ${task.title}` : fallbackLabel,
    };
  }

  const member = members.find((candidate) => candidate.id === id);
  return {
    id,
    char: '@',
    kind: 'user',
    label: member?.name ?? fallbackLabel,
  };
}

export function wikiReferenceRevision(
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
) {
  const userLabels = members
    .map((member) => [member.id, member.name] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const taskLabels = tasks
    .map((task) => [task.id, task.key, task.title] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify([userLabels, taskLabels]);
}
