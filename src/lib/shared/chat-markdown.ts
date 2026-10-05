// Perender subset markdown untuk balon chat Copilot, tanpa dependensi.
// HTML jawaban LLM selalu di-escape: tag hanya berasal dari fungsi ini.
export function renderChatMarkdown(text: string): string {
  const lines = escapeHtml(text).split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isTableHead(line, lines[i + 1])) {
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(renderTable(splitRow(line), rows));
      continue;
    }
    if (/^\s*([-•*]|\d+[.)])\s+\S/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+\S/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-•*]|\d+[.)])\s+\S/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*([-•*]|\d+[.)])\s+/, '')));
        i++;
      }
      out.push(ordered ? `<ol>${items.map((item) => `<li>${item}</li>`).join('')}</ol>` : `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length === 1 ? 'h3' : 'h4';
      out.push(`<${level}>${inline(heading[2].trim())}</${level}>`);
      i++;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isTableHead(lines[i], lines[i + 1]) && !/^\s*([-•*]|\d+[.)])\s+\S/.test(lines[i]) && !/^\s*#{1,3}\s+/.test(lines[i])) {
      para.push(inline(lines[i].trim()));
      i++;
    }
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(value: string): string {
  return value
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^\n*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^\n*]+)\*/g, '$1<em>$2</em>');
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => inline(cell.trim()));
}

function isTableHead(line: string | undefined, next: string | undefined): boolean {
  return !!line && !!next && line.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(next);
}

function renderTable(head: string[], rows: string[][]): string {
  const thead = `<thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="md-table"><table>${thead}${tbody}</table></div>`;
}
