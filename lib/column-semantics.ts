export function isIdentifierColumnName(name: string) {
  const normalized = name.normalize("NFKC").trim();
  const compact = normalized.replace(/[\s_-]+/g, "");

  if (/(?:番号|コード|識別子)$/.test(compact)) return true;
  if (/^(?:id|code|number|no)$/i.test(compact)) return true;
  if (/(?:[_\s-](?:id|code|number|no))$/i.test(normalized)) return true;
  return /(?:ID|Id|Code|Number|No)$/.test(normalized);
}
