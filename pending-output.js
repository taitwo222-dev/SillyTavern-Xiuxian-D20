// Only remove the actual UI block, never cross a preceding details element.
export function stripPendingInteractionBlocks(text) {
    if (typeof text !== 'string' || !text.includes('[D20_REQUEST]')) return text;
    const protectedRanges = [...text.matchAll(/\[D20_REQUEST\][\s\S]*?(?:\[\/D20_REQUEST\]|$)/g)]
        .map(match => [match.index, match.index + match[0].length]);
    const removals = [];
    const stack = [];
    const consider = (node, end) => {
        const content = text.slice(node.contentStart, end);
        const summary = content.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i)?.[1];
        const isMessage = summary?.replace(/<[^>]*>/g, '').includes('小猫之神的留言');
        if (node.tag !== 'options' && !isMessage) return;
        if (protectedRanges.some(([start, stop]) => node.start < stop && end > start)) return;
        removals.push([node.start, end]);
    };
    for (const match of text.matchAll(/<(\/?)(details|options)\b[^>]*>/gi)) {
        const tag = match[2].toLowerCase();
        if (!match[1]) {
            stack.push({ tag, start: match.index, contentStart: match.index + match[0].length });
        } else {
            const index = stack.findLastIndex(node => node.tag === tag);
            if (index < 0) continue;
            const [node] = stack.splice(index, 1);
            consider(node, match.index + match[0].length);
        }
    }
    for (const node of stack) consider(node, text.length);
    if (!removals.length) return text;
    // Merge nested intervals, then remove them from right to left.
    const merged = [];
    for (const range of removals.sort((a, b) => a[0] - b[0])) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push([...range]);
    }
    for (const [start, end] of merged.reverse()) text = text.slice(0, start) + text.slice(end);
    return text;
}
