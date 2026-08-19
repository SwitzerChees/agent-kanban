export function formDataText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export function formDataFiles(formData: FormData, name: string) {
  return formData.getAll(name).filter((value): value is File => typeof value !== 'string');
}
