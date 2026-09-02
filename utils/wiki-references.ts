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

export function canonicalizeWikiReferences(
  markdown: string,
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
) {
  const memberAliases = uniqueMemberAliases(members);
  const taskKeys = uniqueTaskKeys(tasks);
  if (!memberAliases.length && !taskKeys.length) return markdown;

  let fence: string | null = null;
  return markdown.split('\n').map((line) => {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      return line;
    }
    if (fence) return line;

    return line.split(/(`+[^`]*`+|\[@[^\]]+\]|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/g)
      .map((segment, index) => index % 2 ? segment : canonicalizeWikiTextSegment(segment, memberAliases, taskKeys))
      .join('');
  }).join('\n');
}

interface MemberAlias {
  alias: string;
  member: WikiReferenceMember;
}

function uniqueMemberAliases(members: readonly WikiReferenceMember[]) {
  const candidates = new Map<string, MemberAlias[]>();
  for (const member of members) {
    const fullName = member.name.trim().replace(/\s+/g, ' ');
    if (!fullName) continue;
    const firstName = fullName.split(' ')[0]!;
    for (const alias of new Set([fullName, firstName])) {
      const key = alias.toLocaleLowerCase();
      const matches = candidates.get(key) ?? [];
      matches.push({ alias, member });
      candidates.set(key, matches);
    }
  }
  return [...candidates.values()]
    .filter((matches) => matches.length === 1)
    .map(([match]) => match!)
    .sort((left, right) => right.alias.length - left.alias.length);
}

function uniqueTaskKeys(tasks: readonly WikiReferenceTask[]) {
  const candidates = new Map<string, WikiReferenceTask[]>();
  for (const task of tasks) {
    const key = task.key.trim().toLocaleLowerCase();
    if (!key) continue;
    const matches = candidates.get(key) ?? [];
    matches.push(task);
    candidates.set(key, matches);
  }
  return [...candidates.values()]
    .filter((matches) => matches.length === 1)
    .map(([task]) => task!)
    .sort((left, right) => right.key.length - left.key.length);
}

function canonicalizeWikiTextSegment(
  segment: string,
  memberAliases: readonly MemberAlias[],
  tasks: readonly WikiReferenceTask[],
) {
  let result = segment;
  for (const { alias, member } of memberAliases) {
    const escapedAlias = escapeRegExp(alias).replace(/ /g, '\\s+');
    const reference = userReference(member);
    result = result.replace(new RegExp(`\\*\\*\\s*${escapedAlias}\\s*:\\s*\\*\\*`, 'giu'), `${reference}:`);
    result = result.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}._+\\/-])@${escapedAlias}(?![\\p{L}\\p{N}_-])`, 'giu'),
      (_, prefix: string) => `${prefix}${reference}`,
    );
  }
  for (const task of tasks) {
    const escapedKey = escapeRegExp(task.key);
    const reference = taskReference(task);
    result = result.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}._+\\/-])#${escapedKey}(?![\\p{L}\\p{N}_-])`, 'giu'),
      (_, prefix: string) => `${prefix}${reference}`,
    );
  }
  return result;
}

function userReference(member: WikiReferenceMember) {
  return `[@ id="${referenceAttribute(member.id)}" label="${referenceAttribute(member.name)}"]`;
}

function taskReference(task: WikiReferenceTask) {
  return `[@ id="${referenceAttribute(task.id)}" label="${referenceAttribute(`${task.key} · ${task.title}`)}" char="#"]`;
}

function referenceAttribute(value: string) {
  return value.replace(/["\r\n]/g, (character) => character === '"' ? "'" : ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
