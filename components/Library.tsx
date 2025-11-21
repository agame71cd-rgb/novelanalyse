
import React, { useRef } from 'react';
import { NovelMetadata } from '../types';
import { BookOpen, Trash2, Clock, Database, Plus, Download, Upload, FileJson } from 'lucide-react';
import { exportNovelAsJSON, importNovelFromJSON } from '../services/storage';

interface LibraryProps {
  novels: NovelMetadata[];
  onOpenNovel: (id: string) => void;
  onDeleteNovel: (id: string) => void;
  onImportNew: () => void;
  onLibraryRefresh?: () => void; // Callback to trigger re-render after import
}

export const Library: React.FC<LibraryProps> = ({ novels, onOpenNovel, onDeleteNovel, onImportNew, onLibraryRefresh }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const handleExport = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    try {
        const jsonStr = await exportNovelAsJSON(id);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}_backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        alert("Export failed");
    }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = event.target?.result as string;
              await importNovelFromJSON(json);
              alert("导入成功！");
              if (onLibraryRefresh) onLibraryRefresh();
          } catch (err) {
              console.error(err);
              alert("导入失败：文件格式错误");
          }
      };
      reader.readAsText(file);
      // Reset
      e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-end mb-8">
            <div>
                <h1 className="text-3xl font-serif-read font-bold text-gray-900 mb-2">我的书架</h1>
                <p className="text-gray-500">管理您的小说分析库</p>
            </div>
            <div className="flex gap-3">
                 <button 
                    onClick={handleImportClick}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm font-medium"
                >
                    <Upload className="w-4 h-4" />
                    导入备份
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".json" 
                    onChange={handleImportFile}
                />
                <button 
                    onClick={onImportNew}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium"
                >
                    <Plus className="w-5 h-5" />
                    新书分析
                </button>
            </div>
        </div>

        {novels.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-600 mb-2">书架是空的</h3>
            <p className="text-gray-400 mb-6">开始导入您的第一本长篇小说进行 AI 分析吧</p>
            <button 
                onClick={onImportNew}
                className="text-indigo-600 font-medium hover:underline"
            >
                点击导入
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {novels.map((novel) => {
                const progress = novel.chunkCount > 0 
                    ? Math.round((novel.analyzedChunkCount / novel.chunkCount) * 100) 
                    : 0;
                
                return (
                    <div key={novel.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group relative">
                        <div className="p-6 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 text-indigo-600">
                                    <BookOpen className="w-6 h-6" />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button 
                                        onClick={(e) => handleExport(e, novel.id, novel.title)}
                                        className="text-gray-300 hover:text-indigo-600 transition-colors p-1"
                                        title="导出备份"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); if(confirm('确定要删除这本小说和所有分析记录吗？')) onDeleteNovel(novel.id); }}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                        title="删除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2 h-14" title={novel.title}>
                                {novel.title}
                            </h3>
                            
                            <div className="space-y-2 text-sm text-gray-500 mb-4">
                                <div className="flex items-center gap-2">
                                    <Database className="w-4 h-4 text-gray-400" />
                                    <span>{(novel.totalCharacters / 10000).toFixed(1)} 万字 / {novel.chunkCount} 章节</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    <span>{formatDate(novel.lastUpdated)}</span>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-4">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="font-medium text-gray-700">分析进度</span>
                                    <span className="text-indigo-600 font-bold">{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end">
                            <button 
                                onClick={() => onOpenNovel(novel.id)}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                                继续阅读 <span className="text-lg">→</span>
                            </button>
                        </div>
                    </div>
                );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
