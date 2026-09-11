type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeWikiTodoChanges(projectId: string, listener: Listener) {
  const room = listeners.get(projectId) ?? new Set<Listener>();
  room.add(listener);
  listeners.set(projectId, room);
  return () => {
    room.delete(listener);
    if (!room.size) listeners.delete(projectId);
  };
}

export function publishWikiTodoChange(projectId: string) {
  for (const listener of [...(listeners.get(projectId) ?? [])]) listener();
}
