import React, { useState, useMemo, useEffect, useRef } from 'react';
import { processFileContent } from './utils/textProcessing';
import { GlobalState, ChunkAnalysis, AppSettings, NovelMetadata, GlobalGraph, Relationship } from './types';
import { FileUpload } from './components/FileUpload';
import { AnalysisPanel } from './components/AnalysisPanel';
import { SettingsModal } from './components/SettingsModal';
import { Library } from './components/Library';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { saveNewNovel, getAllNovels, loadNovel, updateNovelChunks, updateNovelSettings, deleteNovel, updateNovelProgress } from './services/storage';
import { ChevronLeft, ChevronRight, Menu, Book, Settings, Home, Loader2, Network, PlayCircle, StopCircle } from 'lucide-react';
import { SYSTEM_INSTRUCTION_ANALYSIS, analyzeChunkText } from './services/geminiService';

type ViewState = 'loading' | 'library' | 'upload' | 'reader';
type ReaderTab = 'text' | 'graph';

const App: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [readerTab, setReaderTab] = useState<ReaderTab>('text');
  const [libraryNovels, setLibraryNovels] = useState<NovelMetadata[]>([]);
  
  const [appState, setAppState] = useState<GlobalState>({
    currentNovelId: null,
    fileName: null,
    fullContent: null,
    totalCharacters: 0,
    chunks: [],
    currentChunkIndex: 0,
    settings: {
      provider: 'gemini',
      geminiModelName: 'gemini-2.5-flash',
      openaiBaseUrl: 'https://api.openai.com/v1',
      openaiApiKey: '',
      openaiModelName: 'gpt-4o',
      targetChunkSize: 30000, // Reduced default to improve stability (was 50000)
      customPrompt: SYSTEM_INSTRUCTION_ANALYSIS,
    },
    globalGraph: { nodes: [], links: [] }
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Auto Analysis State
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const autoAnalysisRef = useRef(false);

  // --- Initialization ---
  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
        const novels = await getAllNovels();
        setLibraryNovels(novels);
        
        // Auto-resume logic
        const lastNovelId = localStorage.getItem('lastNovelId');
        
        if (lastNovelId && novels.some(n => n.id === lastNovelId)) {
            // If we have a history and the book still exists, open it
            await handleOpenNovel(lastNovelId);
        } else {
            // Otherwise go to library or upload
            setViewState(novels.length > 0 ? 'library' : 'upload');
        }
    } catch (e) {
        console.error("Failed to load library", e);
        setViewState('upload');
    }
  };

  const refreshLibrary = async () => {
    try {
        const novels = await getAllNovels();
        setLibraryNovels(novels);
    } catch (e) {
        console.error("Failed to refresh library", e);
    }
  };

  // --- Actions ---

  const handleFileLoaded = async (name: string, content: string) => {
    setViewState('loading');
    const chunks = processFileContent(content, appState.settings.targetChunkSize);
    
    try {
        // Save to DB immediately
        const newId = await saveNewNovel(name, content, chunks, appState.settings);
        
        // Set local storage for auto-resume
        localStorage.setItem('lastNovelId', newId);

        setAppState(prev => ({
            ...prev,
            currentNovelId: newId,
            fileName: name,
            fullContent: content,
            totalCharacters: content.length,
            chunks: chunks,
            currentChunkIndex: 0,
            globalGraph: { nodes: [], links: [] }
        }));
        
        await refreshLibrary();
        setViewState('reader');
    } catch (e) {
        console.error("Failed to save new novel", e);
        alert("Failed to save novel to database.");
        setViewState('upload');
    }
  };

  const handleOpenNovel = async (id: string) => {
      setViewState('loading');
      try {
          const { metadata, data } = await loadNovel(id);
          setAppState({
              currentNovelId: metadata.id,
              fileName: metadata.title,
              fullContent: data.content,
              totalCharacters: metadata.totalCharacters,
              chunks: data.chunks,
              currentChunkIndex: metadata.currentChunkIndex || 0,
              settings: metadata.settings,
              globalGraph: data.globalGraph || { nodes: [], links: [] }
          });
          
          // Save state for next reload
          localStorage.setItem('lastNovelId', id);
          
          setViewState('reader');
      } catch (e) {
          console.error("Failed to open novel", e);
          alert("Could not load novel.");
          localStorage.removeItem('lastNovelId'); // Clear invalid ID
          setViewState('library');
      }
  };

  const handleDeleteNovel = async (id: string) => {
      await deleteNovel(id);
      if (localStorage.getItem('lastNovelId') === id) {
          localStorage.removeItem('lastNovelId');
      }
      refreshLibrary();
      if (appState.currentNovelId === id) {
          setViewState('library');
      }
  };

  const handleBackToLibrary = () => {
      // Stop analysis if running
      stopAutoAnalysis();
      // Explicitly going back clears the auto-resume
      localStorage.removeItem('lastNovelId');
      
      refreshLibrary();
      setViewState('library');
      setReaderTab('text');
  };

  const mergeRelationshipsIntoGraph = (currentGraph: GlobalGraph, newRelations: Relationship[]): GlobalGraph => {
      const nodes = [...currentGraph.nodes];
      const links = [...currentGraph.links];

      newRelations.forEach(rel => {
          const sourceId = rel.source.trim();
          const targetId = rel.target.trim();
          
          if (!sourceId || !targetId) return;

          // Add Source Node
          if (!nodes.find(n => n.id === sourceId)) {
              nodes.push({ id: sourceId, group: 1, value: 1 });
          } else {
              const n = nodes.find(x => x.id === sourceId);
              if(n) n.value++;
          }

          // Add Target Node
          if (!nodes.find(n => n.id === targetId)) {
              nodes.push({ id: targetId, group: 1, value: 1 });
          } else {
              const n = nodes.find(x => x.id === targetId);
              if(n) n.value++;
          }

          // Add Link (Unique Check - undirected logic for simplicity)
          const linkExists = links.find(
              l => (l.source === sourceId && l.target === targetId) || 
                   (l.source === targetId && l.target === sourceId)
          );
          
          if (!linkExists) {
              links.push({ source: sourceId, target: targetId, label: rel.relation });
          }
      });

      return { nodes, links };
  };

  const handleAnalysisComplete = async (chunkId: number, analysis: ChunkAnalysis) => {
    
    setAppState(prevState => {
        let updatedGraph = prevState.globalGraph;

        // Merge new relationships if available
        if (analysis.relationships && analysis.relationships.length > 0) {
            updatedGraph = mergeRelationshipsIntoGraph(prevState.globalGraph, analysis.relationships);
        }

        // 1. Update Local State
        const updatedChunks = prevState.chunks.map(c => c.id === chunkId ? { ...c, analysis } : c);
        
        // Fire and forget DB update with correct values
        const analyzedCount = updatedChunks.filter(c => !!c.analysis).length;
        updateNovelChunks(prevState.currentNovelId!, updatedChunks, analyzedCount, updatedGraph);

        return {
            ...prevState,
            chunks: updatedChunks,
            globalGraph: updatedGraph
        };
    });
  };

  // --- Auto Analysis Logic ---

  const startAutoAnalysis = async () => {
    if (isAutoAnalyzing) return;
    setIsAutoAnalyzing(true);
    autoAnalysisRef.current = true;

    // We iterate through chunks. 
    // CRITICAL: We must maintain the context (summary) chain.
    // Since we run in background, we maintain a local `runningSummary`.
    
    let runningSummary = "";

    // We assume chunks are ordered by ID.
    const chunksToAnalyze = [...appState.chunks];
    
    // Find the last analyzed chunk to pick up context
    let startIndex = 0;
    for(let i = 0; i < chunksToAnalyze.length; i++) {
        if(chunksToAnalyze[i].analysis) {
            runningSummary = chunksToAnalyze[i].analysis!.summary;
        } else {
            startIndex = i;
            break;
        }
    }
    
    for (let i = startIndex; i < chunksToAnalyze.length; i++) {
        if (!autoAnalysisRef.current) break;

        const chunk = chunksToAnalyze[i];
        
        try {
            // NOTE: We do NOT change setAppState.currentChunkIndex here. 
            // This allows the user to read other chapters while analysis runs in background.
            
            const result = await analyzeChunkText(chunk.content, appState.settings, runningSummary);
            
            // Update DB & UI State
            await handleAnalysisComplete(chunk.id, result);

            // Update local loop variables
            chunk.analysis = result; // Update local snapshot so next iteration sees it
            runningSummary = result.summary;

            // Small delay to breathe
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`Error analyzing chunk ${i}`, error);
            // Retry loop handling inside analyzeChunkText handles network glitches. 
            // If it bubbles up here, it's likely a hard failure or stopped.
            if (autoAnalysisRef.current) {
                 const errorMsg = (error as any).message || "Unknown error";
                 alert(`全书分析在第 ${i+1} 章 (${chunk.title}) 中断: ${errorMsg}\n请检查网络连接或重试。`);
                 stopAutoAnalysis();
            }
            break;
        }
    }

    setIsAutoAnalyzing(false);
    autoAnalysisRef.current = false;
  };

  const stopAutoAnalysis = () => {
      autoAnalysisRef.current = false;
      setIsAutoAnalyzing(false);
  };

  const updateSettings = async (newSettings: AppSettings) => {
    let updatedState = { ...appState, settings: newSettings };
    let chunksChanged = false;

    // --- Smart Re-segmentation Logic ---
    if (
      appState.fullContent && 
      appState.settings.targetChunkSize !== newSettings.targetChunkSize
    ) {
      // If re-segmenting, we must stop any running analysis
      stopAutoAnalysis();

      const firstUnanalyzedIndex = appState.chunks.findIndex(c => !c.analysis);
      
      if (firstUnanalyzedIndex !== -1) {
          const preservedChunks = appState.chunks.slice(0, firstUnanalyzedIndex);
          const startOffset = preservedChunks.length > 0 
              ? preservedChunks[preservedChunks.length - 1].endIndex 
              : 0;

          const remainingText = appState.fullContent.slice(startOffset);
          const newChunksRaw = processFileContent(remainingText, newSettings.targetChunkSize);
          
          const startingId = preservedChunks.length > 0 
              ? preservedChunks[preservedChunks.length - 1].id + 1 
              : 0;

          const newChunks = newChunksRaw.map((c, idx) => ({
              ...c,
              id: startingId + idx,
              startIndex: c.startIndex + startOffset,
              endIndex: c.endIndex + startOffset,
          }));

          updatedState = {
              ...updatedState,
              chunks: [...preservedChunks, ...newChunks],
              currentChunkIndex: updatedState.currentChunkIndex >= firstUnanalyzedIndex 
                  ? firstUnanalyzedIndex 
                  : updatedState.currentChunkIndex
          };
          chunksChanged = true;
      }
    }

    setAppState(updatedState);

    if (appState.currentNovelId) {
        if (chunksChanged) {
             const analyzedCount = updatedState.chunks.filter(c => !!c.analysis).length;
             await updateNovelChunks(appState.currentNovelId, updatedState.chunks, analyzedCount, updatedState.globalGraph);
        }
        await updateNovelSettings(appState.currentNovelId, newSettings);
    }
  };

  const saveProgress = async (index: number) => {
      if (appState.currentNovelId) {
          await updateNovelProgress(appState.currentNovelId, index);
      }
  };

  const navigateChunk = (direction: 'next' | 'prev') => {
    setAppState(prev => {
      const newIndex = direction === 'next' 
        ? Math.min(prev.currentChunkIndex + 1, prev.chunks.length - 1)
        : Math.max(prev.currentChunkIndex - 1, 0);
      
      if (newIndex !== prev.currentChunkIndex) {
          saveProgress(newIndex);
          const readerElement = document.getElementById('reader-view');
          if (readerElement) readerElement.scrollTop = 0;
      }
      return { ...prev, currentChunkIndex: newIndex };
    });
  };

  const selectChunk = (index: number) => {
    setAppState(prev => {
        if (prev.currentChunkIndex !== index) {
            saveProgress(index);
        }
        return { ...prev, currentChunkIndex: index };
    });
    const readerElement = document.getElementById('reader-view');
    if (readerElement) readerElement.scrollTop = 0;
    setReaderTab('text'); // Switch back to text when selecting a chunk
  };

  // --- Context Construction ---
  const getPreviousContext = () => {
      if (appState.currentChunkIndex > 0) {
          const prevChunk = appState.chunks[appState.currentChunkIndex - 1];
          if (prevChunk && prevChunk.analysis) {
              return prevChunk.analysis.summary;
          }
      }
      return "";
  };

  // --- Render Helpers ---
  const currentChunk = useMemo(() => 
    appState.chunks[appState.currentChunkIndex], 
    [appState.chunks, appState.currentChunkIndex]
  );

  // Sequential Check:
  // Can analyze if it's the first chunk OR previous chunk is analyzed.
  const prevChunk = appState.currentChunkIndex > 0 ? appState.chunks[appState.currentChunkIndex - 1] : null;
  const canAnalyze = appState.currentChunkIndex === 0 || (!!prevChunk && !!prevChunk.analysis);

  const readingProgress = useMemo(() => {
      if(appState.chunks.length === 0) return 0;
      return Math.round(((appState.currentChunkIndex + 1) / appState.chunks.length) * 100);
  }, [appState]);


  // --- Views ---

  if (viewState === 'loading') {
      return (
          <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
              <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-gray-500">正在加载...</p>
              </div>
          </div>
      );
  }

  if (viewState === 'library') {
      return (
          <Library 
            novels={libraryNovels}
            onOpenNovel={handleOpenNovel}
            onDeleteNovel={handleDeleteNovel}
            onImportNew={() => setViewState('upload')}
            onLibraryRefresh={refreshLibrary}
          />
      );
  }

  if (viewState === 'upload') {
    return (
        <FileUpload 
            onFileLoaded={handleFileLoaded} 
            onGoToLibrary={() => setViewState('library')}
            hasBooks={libraryNovels.length > 0}
        />
    );
  }

  // Reader View
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={appState.settings}
        onUpdateSettings={updateSettings}
      />

      {/* Sidebar */}
      <div className={`
          ${isSidebarOpen ? 'w-72' : 'w-0'} 
          bg-gray-900 text-gray-300 flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col
      `}>
        <div className="p-5 border-b border-gray-800 bg-gray-950 flex justify-between items-start shrink-0">
          <div className="overflow-hidden">
             <button 
                onClick={handleBackToLibrary} 
                className="text-white font-bold text-lg truncate flex items-center gap-2 hover:text-indigo-400 transition-colors mb-1"
                title="返回书架"
             >
                <Book className="w-5 h-5" />
                NovelMind
             </button>
             <p className="text-xs text-gray-500 truncate w-full" title={appState.fileName || ''}>{appState.fileName}</p>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="text-gray-500 hover:text-white transition-colors ml-2"
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
        
        {/* Auto Analyze Control */}
        <div className="p-4 border-b border-gray-800 bg-gray-900/50">
            {!isAutoAnalyzing ? (
                <button 
                    onClick={startAutoAnalysis}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-900/20"
                >
                    <PlayCircle className="w-4 h-4" /> 一键全书分析
                </button>
            ) : (
                <button 
                    onClick={stopAutoAnalysis}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium transition-all animate-pulse"
                >
                    <StopCircle className="w-4 h-4" /> 停止分析
                </button>
            )}
             <p className="text-[10px] text-gray-500 mt-2 text-center">
                {isAutoAnalyzing ? "AI 正在后台逐章分析..." : "自动从第一章开始顺序分析"}
             </p>
        </div>

        <div className="p-3 border-b border-gray-800 flex gap-2">
             <button 
                onClick={handleBackToLibrary}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 py-2 rounded text-xs text-gray-400 transition-colors"
             >
                 <Home className="w-3 h-3" /> 书架
             </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-gray-700">
            {appState.chunks.map((chunk, idx) => (
                <button
                    key={chunk.id}
                    onClick={() => selectChunk(idx)}
                    className={`w-full text-left px-5 py-3 text-sm border-l-2 transition-colors hover:bg-gray-800 ${
                        appState.currentChunkIndex === idx 
                        ? 'border-indigo-500 bg-gray-800 text-white' 
                        : 'border-transparent text-gray-400'
                    }`}
                >
                    <div className="flex justify-between items-start">
                        <div className="font-medium truncate pr-2">{chunk.title}</div>
                        {chunk.analysis && (
                             <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 mt-1.5 shadow-[0_0_5px_rgba(34,197,94,0.6)]" title="已分析"></div>
                        )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-gray-600">
                            {chunk.startIndex.toLocaleString()} - {chunk.endIndex.toLocaleString()}
                        </span>
                    </div>
                </button>
            ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
            >
                <Menu className="w-5 h-5" />
            </button>
            {/* View Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                    onClick={() => setReaderTab('text')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${readerTab === 'text' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    正文阅读
                </button>
                <button 
                    onClick={() => setReaderTab('graph')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${readerTab === 'graph' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Network className="w-4 h-4" /> 关系图谱
                </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                 <span className="font-medium text-gray-900">{readingProgress}%</span>
                 <div className="w-20 h-1.5 bg-gray-300 rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-indigo-600 transition-all duration-500" 
                        style={{ width: `${readingProgress}%`}}
                     ></div>
                 </div>
             </div>
             <div className="flex items-center border border-gray-200 rounded-lg bg-white p-0.5 shadow-sm">
                <button 
                    onClick={() => navigateChunk('prev')}
                    disabled={appState.currentChunkIndex === 0}
                    className="p-2 hover:bg-gray-50 rounded-md text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button 
                    onClick={() => navigateChunk('next')}
                    disabled={appState.currentChunkIndex === appState.chunks.length - 1}
                    className="p-2 hover:bg-gray-50 rounded-md text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
             </div>
          </div>
        </header>

        <main 
            id="reader-view"
            className="flex-1 overflow-y-auto bg-[#fdfbf7] scroll-smooth relative"
        >
            {readerTab === 'text' ? (
                <div className="p-8 sm:p-16 max-w-3xl mx-auto">
                    {currentChunk ? (
                        <article className="prose prose-lg prose-stone max-w-none font-serif-read leading-loose text-gray-800">
                            <h2 className="text-2xl font-bold text-gray-900 mb-8 font-sans-ui">
                                {currentChunk.title}
                            </h2>
                            <div className="whitespace-pre-wrap text-lg">
                                {currentChunk.content}
                            </div>
                            
                            <div className="mt-16 pt-8 border-t border-gray-200 flex justify-center pb-20">
                                <button 
                                    onClick={() => navigateChunk('next')}
                                    disabled={appState.currentChunkIndex === appState.chunks.length - 1}
                                    className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-full hover:bg-gray-50 hover:border-indigo-300 transition-all shadow-sm disabled:hidden"
                                >
                                    阅读下一章 <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </article>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                            内容加载中...
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full p-4">
                    <KnowledgeGraph graphData={appState.globalGraph} />
                </div>
            )}
        </main>

      </div>

      {/* Right Panel - Analysis - Only show when in Text mode and chunk exists */}
      {readerTab === 'text' && currentChunk && (
          <div className="hidden lg:block">
            <AnalysisPanel 
                key={`${currentChunk.id}-${currentChunk.analysis ? 'analyzed' : 'raw'}`} 
                chunk={currentChunk}
                settings={appState.settings}
                onAnalysisComplete={handleAnalysisComplete}
                previousSummary={getPreviousContext()}
                canAnalyze={canAnalyze}
                isAutoAnalyzing={isAutoAnalyzing && !currentChunk.analysis}
            />
          </div>
      )}

    </div>
  );
};

export default App;