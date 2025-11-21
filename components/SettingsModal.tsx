
import React, { useState, useEffect } from 'react';
import { X, Cpu, Key, CheckCircle, AlertCircle, Server, Zap, Scissors, FileEdit, RotateCcw } from 'lucide-react';
import { AppSettings } from '../types';
import { SYSTEM_INSTRUCTION_ANALYSIS } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [tempOpenAISettings, setTempOpenAISettings] = useState({
    baseUrl: settings.openaiBaseUrl,
    apiKey: settings.openaiApiKey,
    model: settings.openaiModelName
  });
  const [tempChunkSize, setTempChunkSize] = useState(settings.targetChunkSize);
  const [tempPrompt, setTempPrompt] = useState(settings.customPrompt || SYSTEM_INSTRUCTION_ANALYSIS);

  // Update local state when settings prop changes
  useEffect(() => {
    setTempOpenAISettings({
      baseUrl: settings.openaiBaseUrl,
      apiKey: settings.openaiApiKey,
      model: settings.openaiModelName
    });
    setTempChunkSize(settings.targetChunkSize);
    setTempPrompt(settings.customPrompt || SYSTEM_INSTRUCTION_ANALYSIS);
  }, [settings]);

  const geminiModels = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: '快速，经济，适合通读。' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite', desc: '极速，轻量级分析。' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro', desc: '高智商，适合复杂剧情推理。' },
  ];

  useEffect(() => {
    if (isOpen && window.aistudio) {
      window.aistudio.hasSelectedApiKey().then(setHasKey);
    }
  }, [isOpen]);

  const handleConnectGeminiKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } catch (e: any) {
        console.error("Failed to select key", e);
        if (e.message && e.message.includes("Requested entity was not found")) {
          setHasKey(false);
          try {
             await window.aistudio.openSelectKey();
             setHasKey(true);
          } catch (retryE) {
             console.error("Retry failed", retryE);
          }
        }
      }
    }
  };

  const handleResetPrompt = () => {
    setTempPrompt(SYSTEM_INSTRUCTION_ANALYSIS);
  };

  const handleSave = () => {
    onUpdateSettings({
      ...settings,
      openaiBaseUrl: tempOpenAISettings.baseUrl,
      openaiApiKey: tempOpenAISettings.apiKey,
      openaiModelName: tempOpenAISettings.model,
      targetChunkSize: tempChunkSize,
      customPrompt: tempPrompt
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex border-b border-gray-200">
          <button 
            onClick={() => onUpdateSettings({ ...settings, provider: 'gemini' })}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${settings.provider === 'gemini' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Zap className="w-4 h-4" /> Google Gemini
          </button>
          <button 
            onClick={() => onUpdateSettings({ ...settings, provider: 'openai' })}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${settings.provider === 'openai' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Server className="w-4 h-4" /> OpenAI Compatible
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          
          {/* Chunk Size Slider (Global) */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-indigo-500" /> 分段大小设置
            </label>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between mb-2">
                    <span className="text-xs text-gray-500">最小 3万字</span>
                    <span className="text-sm font-bold text-indigo-700">{tempChunkSize.toLocaleString()} 字 / 段</span>
                    <span className="text-xs text-gray-500">最大 50万字</span>
                </div>
                <input 
                    type="range" 
                    min="30000" 
                    max="500000" 
                    step="10000" 
                    value={tempChunkSize}
                    onChange={(e) => setTempChunkSize(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <p className="text-xs text-gray-500 mt-2">
                    调整分段大小会重新处理当前小说。对于超长篇（1000万字+），建议设置较大数值以减少片段数量。
                </p>
            </div>
          </div>

          <div className="h-px bg-gray-100 w-full"></div>

          {/* Custom Prompt */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-indigo-500" /> 自定义 AI 提示词 (System Prompt)
                </label>
                <button 
                    onClick={handleResetPrompt}
                    className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors"
                    title="重置为默认"
                >
                    <RotateCcw className="w-3 h-3" /> 重置
                </button>
            </div>
            <p className="text-xs text-gray-400 mb-2">
                您可以修改 AI 分析的指令。请保留 "Simplified Chinese" 和对 JSON 格式的要求，否则分析可能失败。
            </p>
            <textarea 
                value={tempPrompt}
                onChange={(e) => setTempPrompt(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none leading-relaxed resize-y"
                placeholder="Enter custom system instruction..."
            />
          </div>

          <div className="h-px bg-gray-100 w-full"></div>

          {settings.provider === 'gemini' ? (
            <>
              {/* Gemini API Key */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-500" /> Google 账号
                </label>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">状态:</span>
                    {hasKey ? (
                      <span className="text-xs font-medium text-green-600 flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                        <CheckCircle className="w-3 h-3" /> 已连接
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                        <AlertCircle className="w-3 h-3" /> 未设置
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                     使用 Google 官方 Gemini API。需要关联付费项目以支持海量 token 分析。
                  </p>
                  <button 
                    onClick={handleConnectGeminiKey}
                    className="w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm"
                  >
                    {hasKey ? "切换账号 / Key" : "连接 Google 账号"}
                  </button>
                </div>
              </div>

              {/* Gemini Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" /> 选择模型
                </label>
                <div className="space-y-2">
                  {geminiModels.map((m) => (
                    <div 
                      key={m.id}
                      onClick={() => onUpdateSettings({ ...settings, geminiModelName: m.id })}
                      className={`
                        relative p-3 rounded-lg border cursor-pointer transition-all
                        ${settings.geminiModelName === m.id 
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}
                      `}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`text-sm font-medium ${settings.geminiModelName === m.id ? 'text-indigo-900' : 'text-gray-900'}`}>
                          {m.name}
                        </span>
                        {settings.geminiModelName === m.id && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
               {/* OpenAI Settings */}
               <div className="space-y-4">
                 <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg border border-blue-100">
                    连接到任意 OpenAI 兼容接口 (如 DeepSeek, 本地模型等)。
                    <br /><strong>注意:</strong> Key 仅存储在您的浏览器内存中。
                 </div>

                 <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Base URL</label>
                    <input 
                      type="text" 
                      value={tempOpenAISettings.baseUrl}
                      onChange={(e) => setTempOpenAISettings({...tempOpenAISettings, baseUrl: e.target.value})}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                 </div>

                 <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">API Key</label>
                    <input 
                      type="password" 
                      value={tempOpenAISettings.apiKey}
                      onChange={(e) => setTempOpenAISettings({...tempOpenAISettings, apiKey: e.target.value})}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                    />
                 </div>

                 <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">模型名称</label>
                    <input 
                      type="text" 
                      value={tempOpenAISettings.model}
                      onChange={(e) => setTempOpenAISettings({...tempOpenAISettings, model: e.target.value})}
                      placeholder="gpt-4o"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                 </div>
               </div>
            </>
          )}

        </div>

        <div className="px-6 py-4 bg-gray-50 text-right border-t border-gray-200">
          <button 
            onClick={handleSave}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
};
