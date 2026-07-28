export const createUnifiedDiff = (params: {
  filePath: string;
  oldContent: string;
  newContent: string;
  contextLines?: number;
}): string => {
  const contextLines = params.contextLines ?? 3;
  const oldLines = params.oldContent.split('\n');
  const newLines = params.newContent.split('\n');
  const maxLength = Math.max(oldLines.length, newLines.length);
  const changedIndexes = new Set<number>();

  for (let index = 0; index < maxLength; index += 1) {
    if ((oldLines[index] ?? '') !== (newLines[index] ?? '')) changedIndexes.add(index);
  }

  if (!changedIndexes.size) return `--- ${params.filePath}\n+++ ${params.filePath}\n`;

  const visibleIndexes = new Set<number>();
  changedIndexes.forEach((index) => {
    for (let current = Math.max(0, index - contextLines); current <= Math.min(maxLength - 1, index + contextLines); current += 1) {
      visibleIndexes.add(current);
    }
  });

  const lines = [`--- ${params.filePath}`, `+++ ${params.filePath}`];
  let previousIndex = -1;

  Array.from(visibleIndexes).sort((a, b) => a - b).forEach((index) => {
    if (previousIndex >= 0 && index > previousIndex + 1) lines.push('@@');
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      lines.push(` ${oldLine ?? ''}`);
    } else {
      if (oldLine !== undefined) lines.push(`-${oldLine}`);
      if (newLine !== undefined) lines.push(`+${newLine}`);
    }
    previousIndex = index;
  });

  return lines.join('\n');
};
