export type TextLinkSegment = {
  kind: "text" | "link";
  value: string;
};

const httpUrlPattern = /https?:\/\/[^\s<>"'。、，．！？；：「」『』【】〈〉《》〔〕]+/giu;
const trailingPunctuation = new Set([".", ",", "!", "?", ";", ":", "。", "、", "，", "．", "！", "？", "；", "：", "」", "』"]);
const closingPairs: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "）": "（",
  "】": "【",
  "〉": "〈",
  "》": "《",
  "〕": "〔",
};

export function splitHttpLinks(text: string): TextLinkSegment[] {
  const segments: TextLinkSegment[] = [];
  let offset = 0;
  const append = (segment: TextLinkSegment) => {
    if (!segment.value) return;
    const previous = segments.at(-1);
    if (segment.kind === "text" && previous?.kind === "text") previous.value += segment.value;
    else segments.push(segment);
  };

  for (const match of text.matchAll(httpUrlPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const url = trimUrlEnd(raw);
    if (!url || !isHttpUrl(url)) continue;
    if (index > offset) append({ kind: "text", value: text.slice(offset, index) });
    append({ kind: "link", value: url });
    if (url.length < raw.length) append({ kind: "text", value: raw.slice(url.length) });
    offset = index + raw.length;
  }

  if (offset < text.length) append({ kind: "text", value: text.slice(offset) });
  return segments.length ? segments : [{ kind: "text", value: text }];
}

function trimUrlEnd(value: string) {
  let result = value;
  while (result) {
    const last = result.at(-1)!;
    if (trailingPunctuation.has(last)) {
      result = result.slice(0, -1);
      continue;
    }
    const opening = closingPairs[last];
    if (opening && occurrences(result, last) > occurrences(result, opening)) {
      result = result.slice(0, -1);
      continue;
    }
    break;
  }
  return result;
}

function occurrences(value: string, character: string) {
  return [...value].filter((candidate) => candidate === character).length;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
