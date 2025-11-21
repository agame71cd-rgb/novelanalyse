
import React, { useState } from 'react';
import { Chunk, AnalysisStatus, ChatMessage, AppSettings, ChapterOutline } from '../types';
import { analyzeChunkText, askQuestionAboutContext, generateChapterOutlines } from '../services/geminiService';
import { Sparkles, Users, TrendingUp, MessageSquare, Loader2, BrainCircuit, Share2, Lock, RotateCcw, CheckCircle, FileType, ChevronDown, ChevronUp, Eye, RefreshCw, ArrowRightCircle, Play } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AnalysisPanelProps {
  chunk: Chunk;
  settings: AppSettings;
  onAnalysisComplete: (chunkId: number, analysis: any) => void;
  previousSummary?: string;
  canAnalyze?: boolean; // Enforce sequential analysis
  isAutoAnalyzing?: boolean; // State from parent
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ 
    chunk, 
    settings, 
    onAnalysisComplete, 
    previousSummary, 
    canAnalyze = true,
    isAutoAnalyzing = false
}) => {
  const [status, setStatus] = useState<AnalysisStatus>(chunk.analysis ? AnalysisStatus.SUCCESS : AnalysisStatus.IDLE);
  const [activeTab, setActiveTab] = useState<'insights' | 'chat'>('insights');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isChatThinking, setIsChatThinking] = useState(false);
  
  // New States
  const [showContext, setShowContext] = useState(false);
  const [isOutlining, setIsOutlining] = useState(false);

  // Trigger analysis for current chunk
  const handleAnalyze = async () => {
    // If already analyzed, we can regenerate without checking sequential lock strictly for previous chunks
    if (!canAnalyze && !chunk.analysis) return; 
    
    setStatus(AnalysisStatus.LOADING);
    try {
      const result = await analyzeChunkText(chunk.content, settings, previousSummary || "");
      onAnalysisComplete(chunk.id, result);
      setStatus(AnalysisStatus.SUCCESS);
    } catch (e) {
      console.error(e);
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleGenerateOutlines = async () => {
      if (!chunk.analysis) return;
      setIsOutlining(true);
      try {
          const outlines = await generateChapterOutlines(chunk.content, settings);
          const updatedAnalysis = { ...chunk.analysis, chapterOutlines: outlines };
          onAnalysisComplete(chunk.id, updatedAnalysis);
      } catch (e) {
          alert("生成章节细纲失败，请重试。");
          console.error(e);
      } finally {
          setIsOutlining(false);
      }
  };

  const handleRegenerateOutlines = async () => {
      if (!chunk.analysis) return;
      if (!window.confirm("确定要重新生成细纲吗？这将覆盖当前的细纲列表。")) return;
      
      setIsOutlining(true);
      try {
          const outlines = await generateChapterOutlines(chunk.content, settings);
          const updatedAnalysis = { ...chunk.analysis, chapterOutlines: outlines };
          onAnalysisComplete(chunk.id, updatedAnalysis);
      } catch (e) {
          alert("重新生成细纲失败。");
      } finally {
          setIsOutlining(false);
      }
  };

  // Handle Chat
  const handleSendMessage = async () => {
    if (!inputMsg.trim()) return;
    const userMsg = inputMsg;
    setInputMsg('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatThinking(true);

    try {
      const answer = await askQuestionAboutContext(
        userMsg, 
        chunk.content, 
        settings,
        chunk.analysis?.summary || previousSummary
      );
      setChatHistory(prev => [...prev, { role: 'model', text: answer }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'model', text: "获取回复失败。" }]);
    } finally {
      setIsChatThinking(false);
    }
  };

  // Render Methods
  const renderInsights = () => {
    // Auto Analyzing State (Prop driven) - Only show loader if we don't have data yet
    if (isAutoAnalyzing && !chunk.analysis) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
                <p className="text-gray-600 font-medium">自动分析队列中...</p>
                <p className="text-xs text-gray-400 mt-1">请稍候，正在后台分析前序章节</p>
            </div>
        );
    }

    if (status === AnalysisStatus.IDLE) {
        if (!canAnalyze) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6 border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
                    <Lock className="w-10 h-10 text-gray-400 mb-3" />
                    <h3 className="text-gray-600 font-medium mb-2">分析已锁定</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                        为了保证剧情连贯性，AI 需要前一章的上下文记忆。请先分析上一章节。
                    </p>
                    <p className="text-xs text-indigo-500 mt-2 font-medium">
                        建议使用左侧的“一键全书分析”
                    </p>
                    {previousSummary && (
                        <button 
                            onClick={() => setShowContext(!showContext)}
                            className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600"
                        >
                            <Eye className="w-3 h-3" /> 查看前情提要
                        </button>
                    )}
                </div>
            );
        }

      return (
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <BrainCircuit className="w-12 h-12 text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">获取本章节的 AI 深度分析</p>
          <button 
            onClick={handleAnalyze}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            开始分析
          </button>
          {previousSummary && (
            <div className="mt-6 pt-4 border-t border-gray-100 w-full">
                 <button 
                    onClick={() => setShowContext(!showContext)}
                    className="text-xs text-gray-400 hover:text-indigo-600 flex items-center justify-center gap-1 w-full"
                 >
                     {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                     前情提要 (上下文)
                 </button>
                 {showContext && (
                     <div className="mt-2 text-left p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed border border-gray-100 max-h-40 overflow-y-auto">
                         {previousSummary}
                     </div>
                 )}
            </div>
          )}
        </div>
      );
    }

    if (status === AnalysisStatus.LOADING) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">AI 正在分析中...</p>
          <p className="text-xs text-gray-400 mt-1">
            使用模型: {settings.provider === 'gemini' ? settings.geminiModelName : settings.openaiModelName}
          </p>
        </div>
      );
    }

    if (status === AnalysisStatus.ERROR) {
      return (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg text-center text-sm">
          分析失败，请检查 API Key 或网络设置。
          <button onClick={handleAnalyze} className="block mx-auto mt-2 font-semibold underline">重试</button>
        </div>
      );
    }

    // SUCCESS STATE
    const data = chunk.analysis!;
    
    // Prepare Chart Data
    const sentimentData = [
      { name: 'Sentiment', value: data.sentimentScore }
    ];

    return (
      <div className="space-y-6 animate-fadeIn pb-10">
        {/* Header: Status & Actions */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <div className="text-xs font-medium text-green-600 flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-full">
               <CheckCircle className="w-3 h-3" /> 分析已完成
            </div>
            
            <button 
               onClick={() => {
                  if(window.confirm('重新分析将覆盖当前结果，且可能影响后续章节的连贯性。确定要重新生成吗？')) {
                      handleAnalyze();
                  }
               }} 
               className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all"
               title="重新分析此章节"
            >
                 <RotateCcw className="w-3.5 h-3.5" /> 重新生成
            </button>
        </div>

        {/* Previous Context Toggle (Visible even after analysis) */}
        {previousSummary && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                 <button 
                    onClick={() => setShowContext(!showContext)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                 >
                     <span className="flex items-center gap-1.5"><BrainCircuit className="w-3 h-3" /> 前情提要</span>
                     {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                 </button>
                 {showContext && (
                     <div className="px-3 py-2 text-xs text-gray-600 border-t border-gray-200 leading-relaxed bg-white">
                         {previousSummary}
                     </div>
                 )}
            </div>
        )}

        {/* Summary Card */}
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
          <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileTextIcon className="w-4 h-4" /> 剧情概要
          </h3>
          <p className="text-gray-700 text-sm leading-relaxed text-justify">{data.summary}</p>
        </div>

        {/* Chapter Outlines (Detailed Breakdown) */}
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <FileType className="w-4 h-4" /> 章节细纲 (逐章)
                </h3>
                {data.chapterOutlines && (
                    <button 
                        onClick={handleRegenerateOutlines}
                        disabled={isOutlining}
                        className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all text-[10px] font-medium disabled:opacity-50"
                        title="重新生成细纲"
                    >
                        {isOutlining ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        重做
                    </button>
                )}
            </div>
            
            {!data.chapterOutlines ? (
                <div className="bg-white p-4 rounded-xl border border-dashed border-gray-300 text-center">
                    <p className="text-xs text-gray-500 mb-3">
                        尚未生成逐章细纲。请使用左侧侧边栏的“生成全书细纲”功能。
                    </p>
                    <button 
                        onClick={handleGenerateOutlines}
                        disabled={isOutlining}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm text-xs font-medium disabled:opacity-50"
                    >
                        {isOutlining ? (
                            <> <Loader2 className="w-3 h-3 animate-spin" /> 生成中... </>
                        ) : (
                            <> <Sparkles className="w-3 h-3" /> 仅生成本段细纲 </>
                        )}
                    </button>
                </div>
            ) : (
                <div className="space-y-3 animate-fadeIn">
                    {data.chapterOutlines.map((outline, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 text-xs mb-1 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                {outline.title}
                            </h4>
                            <p className="text-xs text-gray-600 leading-relaxed pl-3 border-l border-gray-100 ml-0.5">
                                {outline.summary}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Characters */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> 关键角色
          </h3>
          <div className="space-y-3">
            {data.keyCharacters.map((char, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow transition-shadow">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-gray-800 text-sm">{char.name}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{char.role}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {char.traits.map((t, i) => (
                    <span key={i} className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Relationships Preview */}
        {data.relationships && data.relationships.length > 0 && (
            <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> 新增关系
                </h3>
                <div className="bg-white rounded-lg border border-gray-200 text-sm overflow-hidden">
                    {data.relationships.map((rel, i) => (
                        <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0 flex items-center justify-between group hover:bg-gray-50">
                            <span className="font-medium text-gray-700">{rel.source}</span>
                            <div className="flex flex-col items-center px-2">
                                <span className="text-[10px] text-gray-400">{rel.relation}</span>
                                <div className="w-12 h-px bg-indigo-200 relative top-[-1px]">
                                    <div className="absolute right-0 top-[-2px] w-1 h-1 border-t border-r border-indigo-300 rotate-45"></div>
                                </div>
                            </div>
                            <span className="font-medium text-gray-700">{rel.target}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Plot Points */}
        {data.plotPoints && data.plotPoints.length > 0 && (
            <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> 关键剧情点
                </h3>
                <ul className="list-disc list-inside space-y-1">
                    {data.plotPoints.map((point, idx) => (
                        <li key={idx} className="text-sm text-gray-600 leading-relaxed pl-1 marker:text-indigo-300">
                            {point}
                        </li>
                    ))}
                </ul>
            </div>
        )}

        {/* Sentiment */}
        <div className="grid grid-cols-1 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> 情感基调
                </h3>
                <div className="h-16 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sentimentData} layout="vertical" margin={{top:0, right:0, bottom:0, left:0}}>
                            <XAxis type="number" domain={[-1, 1]} hide />
                            <YAxis type="category" dataKey="name" hide />
                            <Tooltip 
                                cursor={{fill: 'transparent'}} 
                                contentStyle={{borderRadius: '8px', fontSize: '12px'}}
                                formatter={(val: number) => [val.toFixed(2), 'Score']}
                            />
                            <Bar dataKey="value" barSize={24} radius={[4, 4, 4, 4]}>
                                {sentimentData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.value >= 0 ? '#34D399' : '#F87171'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                    <span>负面 (-1.0)</span>
                    <span>正面 (+1.0)</span>
                </div>
            </div>
        </div>
      </div>
    );
  };

  const renderChat = () => {
    return (
      <div className="flex flex-col h-[calc(100vh-240px)]">
        <div className="flex-1 overflow-y-auto space-y-4 p-1 scrollbar-thin scrollbar-thumb-gray-200">
            {chatHistory.length === 0 && (
                <div className="text-center mt-10 px-4">
                    <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 italic">
                        您可以就本章剧情向 AI 提问。<br/>例如：“这里埋下了什么伏笔？”
                    </p>
                </div>
            )}
            {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                    <div className={`max-w-[85%] p-3 rounded-xl text-sm shadow-sm ${
                        msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                    }`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            {isChatThinking && (
                 <div className="flex justify-start animate-fadeIn">
                    <div className="bg-gray-50 p-3 rounded-xl rounded-bl-none border border-gray-100 text-gray-500 text-xs flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> 思考中...
                    </div>
                </div>
            )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="relative">
                <input
                    type="text"
                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="输入问题..."
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                    onClick={handleSendMessage}
                    disabled={isChatThinking || !inputMsg.trim()}
                    className="absolute right-2 top-2 p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                >
                    <Sparkles className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>
    );
  };

  // Tab Icons Helper
  const FileTextIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
  );

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 w-96 shrink-0 shadow-xl z-20">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 backdrop-blur">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" /> AI 助手
        </h2>
        <span className="text-xs font-mono text-gray-400 bg-white px-2 py-1 rounded border border-gray-200 truncate max-w-[150px]" title={chunk.title}>
            {chunk.title}
        </span>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button 
            onClick={() => setActiveTab('insights')}
            className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-all relative ${activeTab === 'insights' ? 'text-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
            {activeTab === 'insights' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 animate-fadeIn" />}
            <BrainCircuit className="w-4 h-4" /> 深度分析
        </button>
        <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-all relative ${activeTab === 'chat' ? 'text-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
            {activeTab === 'chat' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 animate-fadeIn" />}
            <MessageSquare className="w-4 h-4" /> 剧情问答
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
        {activeTab === 'insights' ? renderInsights() : renderChat()}
      </div>
    </div>
  );
};
