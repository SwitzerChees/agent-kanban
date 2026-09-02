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

export interface WikiReferencePage {
  id: string;
  parentId: string | null;
  title: string;
}

export interface WikiPageReferenceItem {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface ResolvedWikiReference {
  id: string;
  char: '@' | '#' | 'seite:' | 'page:';
  kind: 'user' | 'task' | 'page';
  label: string;
  valid: boolean;
}

export function resolveWikiReference(
  attrs: WikiReferenceAttributes,
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
  pages: readonly WikiReferencePage[] = [],
): ResolvedWikiReference {
  const id = attrs.id ?? '';
  const fallbackLabel = attrs.label ?? id;

  if (isWikiPageReferenceChar(attrs.mentionSuggestionChar)) {
    const page = pages.find((candidate) => candidate.id === id);
    return {
      id,
      char: attrs.mentionSuggestionChar,
      kind: 'page',
      label: page?.title ?? fallbackLabel,
      valid: Boolean(page),
    };
  }

  if (attrs.mentionSuggestionChar === '#') {
    const task = tasks.find((candidate) => candidate.id === id);
    return {
      id,
      char: '#',
      kind: 'task',
      label: task ? `${task.key} · ${task.title}` : fallbackLabel,
      valid: Boolean(task),
    };
  }

  const member = members.find((candidate) => candidate.id === id);
  return {
    id,
    char: '@',
    kind: 'user',
    label: member?.name ?? fallbackLabel,
    valid: Boolean(member),
  };
}

export function wikiReferenceRevision(
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
  pages: readonly WikiReferencePage[] = [],
) {
  const userLabels = members
    .map((member) => [member.id, member.name] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const taskLabels = tasks
    .map((task) => [task.id, task.key, task.title] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const pageLabels = pages
    .map((page) => [page.id, page.parentId, page.title] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify([userLabels, taskLabels, pageLabels]);
}

export function wikiPageReferenceItems(
  pages: readonly WikiReferencePage[],
  locale: 'en' | 'de',
): WikiPageReferenceItem[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const descriptions = pages.map((page) => pageBreadcrumb(page, byId));
  const duplicateDescriptions = new Map<string, number>();
  for (const description of descriptions) {
    duplicateDescriptions.set(description, (duplicateDescriptions.get(description) ?? 0) + 1);
  }

  return pages.map((page, index) => {
    const breadcrumb = descriptions[index]!;
    const description = duplicateDescriptions.get(breadcrumb)! > 1
      ? `${breadcrumb} · ${page.id.slice(-8)}`
      : breadcrumb;
    return {
      id: page.id,
      label: page.title,
      description: `${locale === 'de' ? 'Seite' : 'Page'} · ${description}`,
      icon: 'i-lucide-file-text',
    };
  });
}

export function filterWikiPageReferenceItems(
  items: readonly WikiPageReferenceItem[],
  query: string,
  locale: 'en' | 'de',
) {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale === 'de' ? 'de-CH' : 'en');
  if (!normalizedQuery) return [...items];
  return items.filter((item) => item.label.toLocaleLowerCase(locale === 'de' ? 'de-CH' : 'en').includes(normalizedQuery));
}

export function isWikiPageReferenceChar(value: string | undefined): value is 'seite:' | 'page:' {
  return value === 'seite:' || value === 'page:';
}

export function canonicalizeWikiReferences(
  markdown: string,
  members: readonly WikiReferenceMember[],
  tasks: readonly WikiReferenceTask[],
) {
  const memberAliases = uniqueMemberAliases(members);
  const taskKeys = uniqueTaskKeys(tasks);

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

    const segments = line.split(/(`+[^`]*`+|\[@[^\]]+\]|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/g);
    return segments
      .map((segment, index) => {
        if (index % 2) return segment;
        let normalized = canonicalizeWikiTextSegment(segment, memberAliases, taskKeys);
        if (segments[index - 1]?.startsWith('[@')) normalized = normalizeBoldAfterWikiReference(normalized);
        if (segments[index + 1]?.startsWith('[@')) normalized = normalizeTrailingBoldWhitespace(normalized);
        return normalized;
      })
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
  return normalizeBoldBeforeWikiReference(result);
}

function normalizeBoldBeforeWikiReference(value: string) {
  return value.replace(
    /\*\*([^*\r\n]*?\S)[ \t]+\*\*[ \t]*(?=\[@\s)/g,
    '**$1** ',
  );
}

function normalizeTrailingBoldWhitespace(value: string) {
  return value.replace(/\*\*([^*\r\n]*?\S)[ \t]+\*\*[ \t]*$/, '**$1** ');
}

function normalizeBoldAfterWikiReference(value: string) {
  if (/^\*\*[ \t]+\*\*/.test(value)) return value.replace(/^\*\*[ \t]+\*\*/, ' ');
  if (!value.startsWith('**')) return value;
  return ` ${value.replace(/^\*\*[ \t]+/, '**')}`;
}

function userReference(member: WikiReferenceMember) {
  return `[@ id="${referenceAttribute(member.id)}" label="${referenceAttribute(member.name)}"]`;
}

function taskReference(task: WikiReferenceTask) {
  return `[@ id="${referenceAttribute(task.id)}" label="${referenceAttribute(`${task.key} · ${task.title}`)}" char="#"]`;
}

function pageBreadcrumb(page: WikiReferencePage, byId: ReadonlyMap<string, WikiReferencePage>) {
  const titles = [page.title];
  const visited = new Set([page.id]);
  let parentId = page.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    titles.unshift(parent.title);
    parentId = parent.parentId;
  }
  return titles.join(' › ');
}

function referenceAttribute(value: string) {
  return value.replace(/["\r\n]/g, (character) => character === '"' ? "'" : ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
