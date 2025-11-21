
import React, { useState } from 'react';
import { Chunk, AnalysisStatus, ChatMessage, AppSettings } from '../types';
import { analyzeChunkText, askQuestionAboutContext } from '../services/geminiService';
import { Sparkles, Users, TrendingUp, MessageSquare, Loader2, BrainCircuit, Share2, Lock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

  // Trigger analysis for current chunk
  const handleAnalyze = async () => {
    if (!canAnalyze) return;
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
    // Auto Analyzing State (Prop driven)
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
      <div className="space-y-6 animate-fadeIn">
        {/* Summary Card */}
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
          <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileTextIcon className="w-4 h-4" /> 剧情概要
          </h3>
          <p className="text-gray-700 text-sm leading-relaxed">{data.summary}</p>
        </div>

        {/* Characters */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> 关键角色
          </h3>
          <div className="space-y-3">
            {data.keyCharacters.map((char, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
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
                        <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0 flex items-center justify-between">
                            <span className="font-medium text-gray-700">{rel.source}</span>
                            <span className="text-xs text-gray-400 px-2">-- {rel.relation} --></span>
                            <span className="font-medium text-gray-700">{rel.target}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Sentiment & Plot */}
        <div className="grid grid-cols-1 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> 情感基调
                </h3>
                <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sentimentData} layout="vertical">
                             <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} />
                            <XAxis type="number" domain={[-1, 1]} hide />
                            <YAxis type="category" dataKey="name" hide />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                                {sentimentData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#10B981' : '#EF4444'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>消极</span>
                    <span>中性</span>
                    <span>积极</span>
                </div>
            </div>
        </div>
      </div>
    );
  };

  const renderChat = () => {
    return (
      <div className="flex flex-col h-[calc(100vh-240px)]">
        <div className="flex-1 overflow-y-auto space-y-4 p-1">
            {chatHistory.length === 0 && (
                <p className="text-sm text-gray-400 text-center mt-10 italic">
                    关于本章内容提问...
                </p>
            )}
            {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                        msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-gray-100 text-gray-800 rounded-bl-none'
                    }`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            {isChatThinking && (
                 <div className="flex justify-start">
                    <div className="bg-gray-100 p-3 rounded-lg rounded-bl-none text-gray-500 text-xs flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> 思考中...
                    </div>
                </div>
            )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="relative">
                <input
                    type="text"
                    className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    placeholder="例如：主角这一章为什么生气？"
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                    onClick={handleSendMessage}
                    disabled={isChatThinking || !inputMsg.trim()}
                    className="absolute right-2 top-2 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
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
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" /> AI 助手
        </h2>
        <span className="text-xs font-mono text-gray-400 bg-white px-2 py-1 rounded border truncate max-w-[150px]">
            {chunk.title}
        </span>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button 
            onClick={() => setActiveTab('insights')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'insights' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700'}`}
        >
            <BrainCircuit className="w-4 h-4" /> 深度分析
        </button>
        <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'chat' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700'}`}
        >
            <MessageSquare className="w-4 h-4" /> 剧情问答
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'insights' ? renderInsights() : renderChat()}
      </div>
    </div>
  );
};
