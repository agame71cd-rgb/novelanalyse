
import { Chunk } from '../types';

// Regex to identify common novel chapter headers
// Matches start of line (or file), optional whitespace, then patterns like "第1章", "Chapter 1", "序章"
// Uses (?:^|\n) to ensure we match start of lines.
export const CHAPTER_REGEX = /(?:^|\n)\s*(?:第\s*[0-9零一二三四五六七八九十百千]+\s*[章回节卷]|Chapter\s*\d+|序章|引子|尾声)(?:[^\n]*)/g;

// Helper to split large text blocks simply by length (fallback or sub-splitting)
const splitByLength = (text: string, targetChunkSize: number, absoluteStartOffset = 0, startIdIndex = 0, baseTitlePrefix = ""): Chunk[] => {
  const chunks: Chunk[] = [];
  let cursor = 0;
  let localIndex = 0;
  const len = text.length;

  // If text is empty, return empty
  if (len === 0) return [];

  while (cursor < len) {
    let end = Math.min(cursor + targetChunkSize, len);
    
    // Try to break at newline to avoid cutting words in half
    if (end < len) {
      const lastNewLine = text.lastIndexOf('\n', end);
      // Only go back if it's not too far (e.g. within last 20% of the chunk size)
      // ensuring we don't create extremely small chunks just to find a newline
      if (lastNewLine > cursor + (targetChunkSize * 0.8)) {
        end = lastNewLine;
      }
    }

    const chunkContent = text.slice(cursor, end);
    
    // Generate title
    let title = "";
    if (baseTitlePrefix.startsWith("Segment")) {
       // Pure length based fallback naming
       title = `Segment ${startIdIndex + localIndex + 1}`;
    } else {
       // Chapter based naming.
       // If the text required splitting (len > targetChunkSize), we add (Part X)
       // Otherwise just use the chapter title
       title = `${baseTitlePrefix} ${len > targetChunkSize ? `(Part ${localIndex + 1})` : ''}`;
    }

    chunks.push({
      id: 0, // Placeholder, will be assigned by caller
      title: title.trim(),
      content: chunkContent.trim(),
      startIndex: absoluteStartOffset + cursor,
      endIndex: absoluteStartOffset + end,
    });

    cursor = end;
    localIndex++;
  }
  return chunks;
};

export const splitTextIntoChapters = (text: string): { title: string; content: string }[] => {
  const matches = [...text.matchAll(CHAPTER_REGEX)];
  
  // If no chapters found, return the whole text as one "chapter" (or fragment)
  if (matches.length === 0) {
    return [{ title: "Fragment", content: text }];
  }

  const results: { title: string; content: string }[] = [];
  
  // Handle pre-chapter text (Prologue or Front Matter without header)
  if (matches[0].index && matches[0].index > 0) {
    results.push({
      title: "Front Matter",
      content: text.slice(0, matches[0].index).trim()
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    
    const start = currentMatch.index!;
    // The regex match includes the title line, so we keep it in content usually? 
    // Or we separate title. Let's keep title separate but include it in content context if needed.
    // Ideally, content is the body.
    
    // Let's extract the title cleanly
    const titleLine = currentMatch[0].trim();
    
    // The content starts AFTER the match, or we include the match?
    // Usually better to include the title in the content for LLM context, 
    // but here we want to list titles.
    
    const contentStart = start + currentMatch[0].length;
    const contentEnd = nextMatch ? nextMatch.index! : text.length;
    
    const body = text.slice(contentStart, contentEnd).trim();
    
    results.push({
      title: titleLine,
      content: body
    });
  }

  return results.filter(r => r.content.length > 0); // Filter empty chapters
};

export const processFileContent = (content: string, targetChunkSize: number): Chunk[] => {
  const totalLength = content.length;
  
  // 1. Attempt to find Chapter Headers using Regex
  const matches = [...content.matchAll(CHAPTER_REGEX)];
  
  // If very few chapters found (likely just a raw text dump or standard formatting not found), 
  // fallback to pure length-based splitting
  if (matches.length < 2 && totalLength > targetChunkSize) {
     const simpleChunks = splitByLength(content, targetChunkSize, 0, 0, "Segment");
     return simpleChunks.map((c, i) => ({...c, id: i}));
  }

  // 2. Prepare split points map
  const splitIndices = matches.map(m => ({ 
    index: m.index || 0, 
    // Clean up the title: remove newlines, trim extra spaces
    title: m[0].replace(/^\n/, '').trim() 
  }));

  // Ensure we have a start point
  // If the first match isn't at 0, it means there is a Prologue or front matter
  if (splitIndices.length === 0 || splitIndices[0].index > 0) {
    splitIndices.unshift({ index: 0, title: "Start" });
  }
  // Add an end sentinel
  splitIndices.push({ index: totalLength, title: "End" });

  const finalChunks: Chunk[] = [];
  let chunkIdCounter = 0;

  let accumulatedStart = splitIndices[0].index;
  let accumulatedTitle = splitIndices[0].title;

  // Helper to finalize and add chunks to the list
  const addChunks = (start: number, end: number, title: string) => {
      const text = content.slice(start, end);
      if (!text.trim()) return; // skip empty sections (e.g. double newlines)

      // Use splitByLength to handle size limits. 
      // If text < targetChunkSize, it returns 1 chunk.
      // If text > targetChunkSize, it splits it into Parts.
      const subChunks = splitByLength(text, targetChunkSize, start, chunkIdCounter, title);
      
      subChunks.forEach(c => {
          c.id = chunkIdCounter++;
          finalChunks.push(c);
      });
  };

  // Iterate through identified chapters and group/split them
  for (let i = 0; i < splitIndices.length - 1; i++) {
    const currentHeader = splitIndices[i];
    const nextHeader = splitIndices[i+1];

    const currentSectionLength = nextHeader.index - currentHeader.index;
    const pendingLength = currentHeader.index - accumulatedStart;

    // Case A: The specific chapter we are looking at is HUGE (> Target).
    // Example: A 200k word chapter vs 50k target.
    if (currentSectionLength > targetChunkSize) {
        // 1. Flush any pending small chapters accumulated before this one
        if (pendingLength > 0 && accumulatedStart !== currentHeader.index) {
            addChunks(accumulatedStart, currentHeader.index, accumulatedTitle);
        }
        
        // 2. Process this huge chapter independently (it will get sub-split)
        addChunks(currentHeader.index, nextHeader.index, currentHeader.title);
        
        // 3. Reset accumulation to start AFTER this huge section
        accumulatedStart = nextHeader.index;
        accumulatedTitle = nextHeader.title;
        continue;
    }

    // Case B: Adding this chapter to our pile would make the pile too big.
    // Example: We have 40k accumulated, and this chapter is 20k. Total 60k > 50k target.
    if (pendingLength + currentSectionLength > targetChunkSize) {
        // Flush the current pile
        if (pendingLength > 0) {
            addChunks(accumulatedStart, currentHeader.index, accumulatedTitle);
        }
        // Start a new pile with this chapter
        accumulatedStart = currentHeader.index;
        accumulatedTitle = currentHeader.title;
    }

    // Case C: It fits. 
    // We continue the loop. effectively "merging" this section into the accumulation.
    // We keep `accumulatedTitle` as the title of the FIRST chapter in the group.
  }

  // Flush any remaining content at the end of the file
  if (accumulatedStart < totalLength) {
      addChunks(accumulatedStart, totalLength, accumulatedTitle);
  }

  return finalChunks;
};
