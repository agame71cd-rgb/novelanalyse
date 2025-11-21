
import React, { useEffect, useRef, useState } from 'react';
import { GlobalGraph } from '../types';
import { Network, Share2, ZoomIn, ZoomOut } from 'lucide-react';

interface KnowledgeGraphProps {
  graphData: GlobalGraph;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ graphData }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [simulationNodes, setSimulationNodes] = useState<any[]>([]);
  const [simulationLinks, setSimulationLinks] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Initialize simulation
  useEffect(() => {
    // Basic Force Directed Layout Logic (Custom implementation to avoid heavy d3 dependency for just this)
    // We start with random positions and let them cool down
    const nodes = graphData.nodes.map(n => ({ ...n, x: Math.random() * 800, y: Math.random() * 600, vx: 0, vy: 0 }));
    const links = graphData.links.map(l => ({ ...l }));
    
    setSimulationNodes(nodes);
    setSimulationLinks(links);

    // A simple iterative layout solver
    let iterations = 0;
    const maxIterations = 300;
    const width = 800;
    const height = 600;
    const repulsion = 5000;
    const springLength = 150;
    const springStrength = 0.05;
    const damping = 0.9;
    const centerStrength = 0.02;

    const interval = setInterval(() => {
        if (iterations > maxIterations) {
            clearInterval(interval);
            return;
        }
        iterations++;

        setSimulationNodes(prevNodes => {
            const newNodes = [...prevNodes];
            
            // 1. Repulsion (Node vs Node)
            for (let i = 0; i < newNodes.length; i++) {
                for (let j = i + 1; j < newNodes.length; j++) {
                    const n1 = newNodes[i];
                    const n2 = newNodes[j];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const distSq = dx*dx + dy*dy + 0.1;
                    const dist = Math.sqrt(distSq);
                    const force = repulsion / distSq;
                    
                    const fx = (dx/dist) * force;
                    const fy = (dy/dist) * force;

                    n1.vx += fx;
                    n1.vy += fy;
                    n2.vx -= fx;
                    n2.vy -= fy;
                }
            }

            // 2. Spring (Links)
            links.forEach(link => {
                const s = newNodes.find(n => n.id === link.source);
                const t = newNodes.find(n => n.id === link.target);
                if (s && t) {
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const force = (dist - springLength) * springStrength;
                    
                    const fx = (dx/dist) * force;
                    const fy = (dy/dist) * force;

                    s.vx += fx;
                    s.vy += fy;
                    t.vx -= fx;
                    t.vy -= fy;
                }
            });

            // 3. Center Gravity + Update
            newNodes.forEach(n => {
                const dx = width/2 - n.x;
                const dy = height/2 - n.y;
                n.vx += dx * centerStrength;
                n.vy += dy * centerStrength;

                n.vx *= damping;
                n.vy *= damping;
                n.x += n.vx;
                n.y += n.vy;
            });

            return newNodes;
        });

    }, 16);

    return () => clearInterval(interval);

  }, [graphData]);

  const handleZoom = (delta: number) => {
    setTransform(prev => ({ ...prev, k: Math.max(0.1, Math.min(5, prev.k + delta)) }));
  };

  if (graphData.nodes.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-10">
              <Network className="w-16 h-16 mb-4 opacity-20" />
              <p>暂无人物关系数据。请分析更多章节。</p>
          </div>
      );
  }

  return (
    <div className="relative w-full h-full bg-slate-50 border border-gray-200 rounded-xl overflow-hidden shadow-inner">
        <div className="absolute top-4 left-4 z-10 bg-white/80 backdrop-blur p-2 rounded-lg shadow border border-gray-200">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <Share2 className="w-4 h-4" /> 全局人物图谱
            </h3>
            <p className="text-xs text-gray-500">
                {graphData.nodes.length} 人物 · {graphData.links.length} 关系
            </p>
        </div>

        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <button onClick={() => handleZoom(0.1)} className="p-2 bg-white rounded shadow hover:bg-gray-50 text-gray-600">
                <ZoomIn className="w-5 h-5" />
            </button>
            <button onClick={() => handleZoom(-0.1)} className="p-2 bg-white rounded shadow hover:bg-gray-50 text-gray-600">
                <ZoomOut className="w-5 h-5" />
            </button>
        </div>

        <svg 
            ref={svgRef}
            className="w-full h-full cursor-move"
            viewBox="0 0 800 600"
        >
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                {/* Links */}
                {simulationLinks.map((link, i) => {
                    const s = simulationNodes.find(n => n.id === link.source);
                    const t = simulationNodes.find(n => n.id === link.target);
                    if (!s || !t) return null;
                    return (
                        <g key={i}>
                            <line 
                                x1={s.x} y1={s.y} x2={t.x} y2={t.y} 
                                stroke="#cbd5e1" 
                                strokeWidth="1.5" 
                            />
                            <text 
                                x={(s.x + t.x)/2} y={(s.y + t.y)/2} 
                                fontSize="10" 
                                fill="#94a3b8"
                                textAnchor="middle"
                                alignmentBaseline="middle"
                                className="select-none bg-white"
                            >
                                {link.label}
                            </text>
                        </g>
                    );
                })}

                {/* Nodes */}
                {simulationNodes.map((node, i) => (
                    <g 
                        key={i} 
                        transform={`translate(${node.x}, ${node.y})`}
                        onMouseEnter={() => setSelectedNode(node.id)}
                        onMouseLeave={() => setSelectedNode(null)}
                    >
                        <circle 
                            r={Math.max(5, Math.min(20, 5 + node.value / 2))} 
                            fill={selectedNode === node.id ? '#4f46e5' : '#818cf8'}
                            stroke="#fff"
                            strokeWidth="2"
                            className="transition-colors duration-300"
                        />
                        <text 
                            dy={Math.max(5, Math.min(20, 5 + node.value / 2)) + 12} 
                            fontSize="12" 
                            textAnchor="middle" 
                            fill="#334155"
                            fontWeight="500"
                            className="select-none"
                        >
                            {node.id}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    </div>
  );
};
