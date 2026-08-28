export function commandPaletteTaskBuckets<T extends { columnDone: boolean }>(tasks: T[], hasQuery: boolean) {
  const active = tasks.filter((task) => !task.columnDone);
  const completed = tasks.filter((task) => task.columnDone);
  return {
    active: hasQuery ? active : active.slice(0, 6),
    completed: hasQuery ? completed : completed.slice(0, 3),
  };
}
