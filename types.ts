
export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface Chunk {
  id: number;
  title: string; 
  content: string;
  startIndex: number;
  endIndex: number;
  analysis?: ChunkAnalysis;
}

export interface CharacterProfile {
  name: string;
  role: string;
  traits: string[];
}

export interface Relationship {
  source: string;
  target: string;
  relation: string; // e.g. "friend", "enemy", "father"
}

export interface ChapterOutline {
  title: string;
  summary: string;
}

export interface ChunkAnalysis {
  summary: string;
  sentimentScore: number; 
  keyCharacters: CharacterProfile[];
  relationships: Relationship[]; // New: Extracted relationships from this chunk
  plotPoints: string[];
  chapterOutlines?: ChapterOutline[]; // New: Detailed breakdown per chapter
}

export type LLMProvider = 'gemini' | 'openai';

export interface AppSettings {
  provider: LLMProvider;
  geminiModelName: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModelName: string;
  targetChunkSize: number;
  customPrompt?: string; // New: Allow user to override system prompt
  maxOutputTokens: number; // New: Control output length
}

// Global Graph Data Structure
export interface GraphNode {
  id: string;
  group: number; // 1 for main, 2 for side, etc.
  value: number; // Frequency of appearance
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
}

export interface GlobalGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GlobalState {
  currentNovelId: string | null;
  fileName: string | null;
  fullContent: string | null;
  totalCharacters: number;
  chunks: Chunk[];
  currentChunkIndex: number;
  settings: AppSettings;
  globalGraph: GlobalGraph; // New: Store the accumulated graph
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// --- Storage Interfaces ---

export interface NovelMetadata {
  id: string;
  title: string;
  totalCharacters: number;
  chunkCount: number;
  analyzedChunkCount: number;
  currentChunkIndex: number;
  lastUpdated: number;
  settings: AppSettings;
}

export interface NovelData {
  id: string;
  content: string;
  chunks: Chunk[];
  globalGraph?: GlobalGraph; // New: Persist graph data
}

// For Export/Import
export interface NovelBackup {
  metadata: NovelMetadata;
  data: NovelData;
  version: number;
}
