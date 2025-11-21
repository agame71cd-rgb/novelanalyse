
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { processFileContent } from './utils/textProcessing';
import { GlobalState, ChunkAnalysis, AppSettings, NovelMetadata, GlobalGraph, Relationship } from './types';
import { FileUpload } from './components/FileUpload';
import { AnalysisPanel } from './components/AnalysisPanel';
import { SettingsModal } from './components/SettingsModal';
import { Library } from './components/Library';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { saveNewNovel, getAllNovels, loadNovel, updateNovelChunks, updateNovelSettings, deleteNovel, updateNovelProgress } from './services/storage';
import { ChevronLeft, ChevronRight, Menu, Book, Settings, Home, Loader2, Network, PlayCircle, StopCircle, FileDown, ListOrdered } from 'lucide-react';
import { SYSTEM_INSTRUCTION_ANALYSIS, analyzeChunkText, generateChapterOutlines } from './services/geminiService';

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
      targetChunkSize: 25000,
      customPrompt: SYSTEM_INSTRUCTION_ANALYSIS,
      maxOutputTokens: 16384,
    },
    globalGraph: { nodes: [], links: [] }
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Background Process States
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const autoAnalysisRef = useRef(false);
  
  const [isAutoOutlining, setIsAutoOutlining] = useState(false);
  const autoOutliningRef = useRef(false);

  // --- Initialization ---
  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
        const novels = await getAllNovels();
        setLibraryNovels(novels);
        const lastNovelId = localStorage.getItem('lastNovelId');
        if (lastNovelId && novels.some(n => n.id === lastNovelId)) {
            await handleOpenNovel(lastNovelId);
        } else {
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
        const newId = await saveNewNovel(name, content, chunks, appState.settings);
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
              settings: {
                  ...metadata.settings,
                  maxOutputTokens: metadata.settings.maxOutputTokens || 16384
              },
              globalGraph: data.globalGraph || { nodes: [], links: [] }
          });
          localStorage.setItem('lastNovelId', id);
          setViewState('reader');
      } catch (e) {
          console.error("Failed to open novel", e);
          alert("Could not load novel.");
          localStorage.removeItem('lastNovelId');
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
      stopAutoAnalysis();
      stopAutoOutlining();
      localStorage.removeItem('lastNovelId');
      refreshLibrary();
      setViewState('library');
      setReaderTab('text');
  };

  const handleAnalysisComplete = async (chunkId: number, analysis: ChunkAnalysis) => {
    setAppState(prevState => {
        let updatedGraph = prevState.globalGraph;
        if (analysis.relationships && analysis.relationships.length > 0) {
            // Simple merge logic here (simplified for brevity, real implementation in previous files)
            // We just return the existing graph for now as the main logic is in the state update flow
            // But we need to persist it. 
            // Re-implement merge helper locally or assume it works:
            const nodes = [...prevState.globalGraph.nodes];
            const links = [...prevState.globalGraph.links];
            analysis.relationships.forEach(rel => {
                if(!nodes.find(n => n.id === rel.source)) nodes.push({id: rel.source, group:1, value:1});
                if(!nodes.find(n => n.id === rel.target)) nodes.push({id: rel.target, group:1, value:1});
                if(!links.find(l => l.source === rel.source && l.target === rel.target)) {
                    links.push({source: rel.source, target: rel.target, label: rel.relation});
                }
            });
            updatedGraph = { nodes, links };
        }

        const updatedChunks = prevState.chunks.map(c => c.id === chunkId ? { ...c, analysis } : c);
        const analyzedCount = updatedChunks.filter(c => !!c.analysis).length;
        updateNovelChunks(prevState.currentNovelId!, updatedChunks, analyzedCount, updatedGraph);

        return { ...prevState, chunks: updatedChunks, globalGraph: updatedGraph };
    });
  };

  // --- Outline Only Update ---
  const handleOutlineUpdate = async (chunkId: number, outlines: any[]) => {
      setAppState(prevState => {
          const updatedChunks = prevState.chunks.map(c => {
              if (c.id === chunkId) {
                  const existingAnalysis = c.analysis || { 
                      summary: "Outline generated.", 
                      sentimentScore: 0, 
                      keyCharacters: [], 
                      relationships: [], 
                      plotPoints: [] 
                  };
                  return { ...c, analysis: { ...existingAnalysis, chapterOutlines: outlines } };
              }
              return c;
          });
          // Persist
          const analyzedCount = updatedChunks.filter(c => !!c.analysis).length;
          updateNovelChunks(prevState.currentNovelId!, updatedChunks, analyzedCount, prevState.globalGraph);
          return { ...prevState, chunks: updatedChunks };
      });
  };

  // --- Auto Outline Logic ---
  const startAutoOutlining = async () => {
      if (isAutoOutlining) return;
      setIsAutoOutlining(true);
      autoOutliningRef.current = true;

      const chunksToProcess = [...appState.chunks];
      
      for (let i = 0; i < chunksToProcess.length; i++) {
          if (!autoOutliningRef.current) break;
          
          const chunk = chunksToProcess[i];
          
          // Skip if already has outlines
          if (chunk.analysis?.chapterOutlines && chunk.analysis.chapterOutlines.length > 0) {
              continue;
          }

          try {
              // Scroll sidebar to show progress
              const btn = document.getElementById(`chunk-btn-${i}`);
              if(btn) btn.scrollIntoView({block: 'nearest'});

              const outlines = await generateChapterOutlines(chunk.content, appState.settings);
              await handleOutlineUpdate(chunk.id, outlines);
              
              // Update local Ref for loop
              chunk.analysis = { 
                  ...(chunk.analysis as any), 
                  chapterOutlines: outlines 
              };

              await new Promise(r => setTimeout(r, 500));
          } catch (e) {
              console.error(`Outlining failed for chunk ${i}`, e);
              // Continue to next chunk even if one fails? Yes, robust.
          }
      }
      setIsAutoOutlining(false);
      autoOutliningRef.current = false;
  };

  const stopAutoOutlining = () => {
      autoOutliningRef.current = false;
      setIsAutoOutlining(false);
  };

  // --- Auto Analysis Logic ---
  const startAutoAnalysis = async () => {
    if (isAutoAnalyzing) return;
    setIsAutoAnalyzing(true);
    autoAnalysisRef.current = true;
    
    let runningSummary = "";
    const chunksToAnalyze = [...appState.chunks];
    
    let startIndex = 0;
    for(let i = 0; i < chunksToAnalyze.length; i++) {
        if(chunksToAnalyze[i].analysis && chunksToAnalyze[i].analysis!.summary !== "Outline generated.") {
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
            // If chunk only has outlines (from Auto Outlining), we preserve them!
            const existingOutlines = chunk.analysis?.chapterOutlines;
            
            const result = await analyzeChunkText(chunk.content, appState.settings, runningSummary);
            
            // Merge outlines back if new analysis didn't generate them (which analyzeChunkText doesn't do by default)
            if (existingOutlines && !result.chapterOutlines) {
                result.chapterOutlines = existingOutlines;
            }

            await handleAnalysisComplete(chunk.id, result);
            chunk.analysis = result; 
            runningSummary = result.summary;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
             console.error(`Error analyzing chunk ${i}`, error);
             if (autoAnalysisRef.current) {
                 await new Promise(resolve => setTimeout(resolve, 3000));
                 if (!autoAnalysisRef.current) break;
                 // Simple retry once
                 try {
                      const result = await analyzeChunkText(chunk.content, appState.settings, runningSummary);
                      await handleAnalysisComplete(chunk.id, result);
                      chunk.analysis = result;
                      runningSummary = result.summary;
                 } catch (e) {
                     stopAutoAnalysis();
                     alert(`分析中断于第 ${i+1} 部分。`);
                     break;
                 }
             } else {
                break;
             }
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
    setAppState(prev => ({ ...prev, settings: newSettings }));
    if (appState.currentNovelId) {
        await updateNovelSettings(appState.currentNovelId, newSettings);
    }
  };

  const navigateChunk = (direction: 'next' | 'prev') => {
    setAppState(prev => {
      const newIndex = direction === 'next' 
        ? Math.min(prev.currentChunkIndex + 1, prev.chunks.length - 1)
        : Math.max(prev.currentChunkIndex - 1, 0);
      
      if (newIndex !== prev.currentChunkIndex) {
          if(appState.currentNovelId) updateNovelProgress(appState.currentNovelId, newIndex);
          document.getElementById('reader-view')?.scrollTo(0,0);
      }
      return { ...prev, currentChunkIndex: newIndex };
    });
  };

  const handleExportOutlines = () => {
      let md = `# ${appState.fileName || 'Novel Analysis'} - Chapter Outlines\n\n`;
      appState.chunks.forEach(chunk => {
          if (chunk.analysis?.chapterOutlines && chunk.analysis.chapterOutlines.length > 0) {
              chunk.analysis.chapterOutlines.forEach(outline => {
                  md += `### ${outline.title}\n${outline.summary}\n\n`;
              });
              md += `---\n\n`;
          } else if (chunk.analysis) {
               md += `## Segment ${chunk.id + 1}: ${chunk.title}\n> ${chunk.analysis.summary}\n\n---\n\n`;
          }
      });
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appState.fileName || 'novel'}_outlines.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // --- Render ---

  if (viewState === 'loading') return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  if (viewState === 'library') return <Library novels={libraryNovels} onOpenNovel={handleOpenNovel} onDeleteNovel={handleDeleteNovel} onImportNew={() => setViewState('upload')} onLibraryRefresh={refreshLibrary} />;
  if (viewState === 'upload') return <FileUpload onFileLoaded={handleFileLoaded} onGoToLibrary={() => setViewState('library')} hasBooks={libraryNovels.length > 0} />;

  const currentChunk = appState.chunks[appState.currentChunkIndex];
  const canAnalyze = appState.currentChunkIndex === 0 || (!!appState.chunks[appState.currentChunkIndex - 1]?.analysis);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={appState.settings} onUpdateSettings={updateSettings} />
      
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-gray-900 text-gray-300 flex-shrink-0 transition-all duration-300 flex flex-col`}>
        <div className="p-4 bg-gray-950 border-b border-gray-800 flex justify-between items-center shrink-0">
          <div className="overflow-hidden">
             <button onClick={handleBackToLibrary} className="text-white font-bold flex items-center gap-2 hover:text-indigo-400" title="Back to Library">
                <Book className="w-4 h-4" /> NovelMind
             </button>
             <p className="text-xs text-gray-500 truncate mt-1" title={appState.fileName || ''}>{appState.fileName}</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="text-gray-500 hover:text-white"><Settings className="w-4 h-4" /></button>
        </div>
        
        {/* Control Panel */}
        <div className="p-3 bg-gray-900/80 border-b border-gray-800 space-y-2 shrink-0">
            {/* Full Auto Analysis */}
            {!isAutoAnalyzing ? (
                <button onClick={startAutoAnalysis} disabled={isAutoOutlining} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded text-xs font-medium transition-all disabled:opacity-30">
                    <PlayCircle className="w-3.5 h-3.5" /> 一键全书分析 (深度)
                </button>
            ) : (
                <button onClick={stopAutoAnalysis} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 rounded text-xs font-medium animate-pulse">
                    <StopCircle className="w-3.5 h-3.5" /> 停止深度分析
                </button>
            )}

            {/* Auto Outlining (New Feature) */}
            {!isAutoOutlining ? (
                <button onClick={startAutoOutlining} disabled={isAutoAnalyzing} className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-2 rounded text-xs font-medium transition-all disabled:opacity-30">
                    <ListOrdered className="w-3.5 h-3.5" /> 生成全书细纲 (快速)
                </button>
            ) : (
                <button onClick={stopAutoOutlining} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2 rounded text-xs font-medium animate-pulse">
                    <StopCircle className="w-3.5 h-3.5" /> 停止生成细纲
                </button>
            )}
            
            <button onClick={handleExportOutlines} className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded text-xs border border-gray-700">
                <FileDown className="w-3.5 h-3.5" /> 导出细纲
            </button>
            <div className="text-[10px] text-gray-500 text-center h-4">
                {isAutoAnalyzing ? "正在进行深度分析..." : isAutoOutlining ? "正在提取章节细纲..." : "就绪"}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-gray-700">
            {appState.chunks.map((chunk, idx) => (
                <button
                    key={chunk.id}
                    id={`chunk-btn-${idx}`}
                    onClick={() => { setAppState(p => ({...p, currentChunkIndex: idx})); setReaderTab('text'); }}
                    className={`w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-gray-800 ${appState.currentChunkIndex === idx ? 'border-indigo-500 bg-gray-800 text-white' : 'border-transparent text-gray-400'}`}
                >
                    <div className="flex justify-between items-center mb-1">
                        <div className="font-medium truncate text-xs w-32">{chunk.title}</div>
                        <div className="flex gap-1">
                            {/* Outline Status Dot */}
                            {chunk.analysis?.chapterOutlines && chunk.analysis.chapterOutlines.length > 0 && (
                                <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_4px_rgba(45,212,191,0.6)]" title="细纲已生成"></div>
                            )}
                            {/* Full Analysis Status Dot */}
                            {chunk.analysis && chunk.analysis.summary !== "Outline generated." && (
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.6)]" title="深度分析完成"></div>
                            )}
                        </div>
                    </div>
                </button>
            ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm z-10 shrink-0">
           <div className="flex items-center gap-3">
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><Menu className="w-5 h-5"/></button>
             <div className="flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setReaderTab('text')} className={`px-3 py-1 text-xs font-medium rounded ${readerTab === 'text' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>正文</button>
                <button onClick={() => setReaderTab('graph')} className={`px-3 py-1 text-xs font-medium rounded flex gap-1 items-center ${readerTab === 'graph' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}><Network className="w-3 h-3"/> 图谱</button>
             </div>
           </div>
           <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 mr-2">
                 {Math.round(((appState.currentChunkIndex + 1) / appState.chunks.length) * 100)}%
              </div>
              <button onClick={() => navigateChunk('prev')} disabled={appState.currentChunkIndex===0} className="p-1.5 hover:bg-gray-50 border rounded text-gray-600 disabled:opacity-30"><ChevronLeft className="w-4 h-4"/></button>
              <button onClick={() => navigateChunk('next')} disabled={appState.currentChunkIndex===appState.chunks.length-1} className="p-1.5 hover:bg-gray-50 border rounded text-gray-600 disabled:opacity-30"><ChevronRight className="w-4 h-4"/></button>
           </div>
        </header>
        
        <main id="reader-view" className="flex-1 overflow-y-auto bg-[#fdfbf7] relative">
            {readerTab === 'text' ? (
                <div className="max-w-3xl mx-auto p-8 sm:p-12 pb-32">
                     {currentChunk ? (
                        <article className="prose prose-lg prose-stone max-w-none font-serif-read">
                            <h2 className="text-2xl font-bold text-gray-900 mb-8">{currentChunk.title}</h2>
                            <div className="whitespace-pre-wrap text-lg leading-loose text-gray-800">{currentChunk.content}</div>
                        </article>
                     ) : <div className="flex h-full items-center justify-center text-gray-400">Empty</div>}
                </div>
            ) : (
                <div className="w-full h-full p-4"><KnowledgeGraph graphData={appState.globalGraph} /></div>
            )}
        </main>
      </div>

      {/* Analysis Panel */}
      {readerTab === 'text' && currentChunk && (
          <div className="hidden lg:block border-l border-gray-200 w-96 bg-white shrink-0 shadow-xl z-20">
             <AnalysisPanel 
                key={currentChunk.id} 
                chunk={currentChunk} 
                settings={appState.settings} 
                onAnalysisComplete={handleAnalysisComplete}
                previousSummary={appState.currentChunkIndex > 0 && appState.chunks[appState.currentChunkIndex-1].analysis ? appState.chunks[appState.currentChunkIndex-1].analysis!.summary : ""}
                canAnalyze={canAnalyze}
                isAutoAnalyzing={isAutoAnalyzing && (!currentChunk.analysis || currentChunk.analysis.summary === "Outline generated.")}
             />
          </div>
      )}
    </div>
  );
};

export default App;
