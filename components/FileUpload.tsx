
import React, { useCallback, useState } from 'react';
import { Upload, BookOpen, FileText, Library } from 'lucide-react';

interface FileUploadProps {
  onFileLoaded: (name: string, content: string) => void;
  onGoToLibrary: () => void;
  hasBooks: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded, onGoToLibrary, hasBooks }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = (file: File) => {
    setIsLoading(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        let content = '';
        
        // Strategy: Try UTF-8 strictly first. If it fails (throws due to invalid byte sequences),
        // fallback to GB18030 (which covers GBK and GB2312) commonly used in Chinese novels.
        try {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            content = decoder.decode(buffer);
        } catch (err) {
            console.log('Detected non-UTF-8 file, attempting GB18030/GBK decode...');
            try {
                // GB18030 is the superset of GB2312 and GBK
                const decoder = new TextDecoder('gb18030', { fatal: true });
                content = decoder.decode(buffer);
            } catch (err2) {
                // Fallback to non-fatal UTF-8 if both specific attempts fail
                console.warn('Decoding failed, falling back to loose UTF-8');
                const decoder = new TextDecoder('utf-8'); 
                content = decoder.decode(buffer);
            }
        }

        // Simulate a small delay for better UX on small files
        setTimeout(() => {
          onFileLoaded(file.name, content);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Failed to process file. Please ensure it is a valid text file.");
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      alert("Error reading file");
      setIsLoading(false);
    };

    // Read as ArrayBuffer to allow manual decoding control
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'text/plain') {
      processFile(file);
    } else {
        alert("Please upload a .txt file");
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4 relative">
      {/* Library Navigation (Top Right) - Always visible now */}
      <div className="absolute top-6 right-6">
          <button 
            onClick={onGoToLibrary}
            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg shadow-sm border border-indigo-100 hover:shadow-md hover:bg-indigo-50 transition-all font-medium"
          >
              <Library className="w-4 h-4" />
              我的书架
          </button>
      </div>

      <div className="text-center mb-12">
        <h1 className="text-5xl font-serif-read font-bold text-gray-900 mb-4 tracking-tight">NovelMind AI (小说脑)</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          长篇小说深度分析工具。上传您的txt小说文件 (支持百万字以上)，AI 将为您逐章拆解剧情、人物和伏笔。
        </p>
      </div>

      <div 
        className={`
          w-full max-w-xl h-80 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 cursor-pointer
          ${isDragging ? 'border-indigo-600 bg-indigo-50 scale-105' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50'}
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center animate-pulse">
            <BookOpen className="w-16 h-16 text-indigo-600 mb-4" />
            <p className="text-xl font-semibold text-gray-700">正在处理小说...</p>
            <p className="text-sm text-gray-500 mt-2">检测编码并智能分章中</p>
          </div>
        ) : (
          <div className="flex flex-col items-center p-8 text-center">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6">
              <Upload className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">拖拽小说文件到这里</h3>
            <p className="text-gray-500 mb-6">支持 .txt 文件 (UTF-8, GB2312/GBK)</p>
            <button className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
              选择文件
            </button>
            <p className="mt-4 text-xs text-gray-400">专为长篇内容设计 (100万字+)</p>
          </div>
        )}
        <input 
          type="file" 
          id="fileInput" 
          className="hidden" 
          accept=".txt" 
          onChange={handleFileInput}
        />
      </div>
    </div>
  );
};
