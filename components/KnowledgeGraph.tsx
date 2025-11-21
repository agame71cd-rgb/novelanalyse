import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GlobalGraph } from '../types';
import { Network, Share2, ZoomIn, ZoomOut, Filter } from 'lucide-react';

interface KnowledgeGraphProps {
  graphData: GlobalGraph;
  maxNodes?: number;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ graphData, maxNodes = 40 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [simulationNodes, setSimulationNodes] = useState<any[]>([]);
  const [simulationLinks, setSimulationLinks] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const requestRef = useRef<number>(0);
  const simulationNodesRef = useRef<any[]>([]);

  // Filter data for performance using useMemo
  // This is critical for 10M+ word novels where graphData might have 1000+ nodes.
  const filteredData = useMemo(() => {
    if (!graphData || !graphData.nodes) return { nodes: [], links: [] };
    
    // If already small, return as is
    if (graphData.nodes.length <= maxNodes) return graphData;

    // Sort by value (frequency) desc
    const sortedNodes = [...graphData.nodes].sort((a, b) => b.value - a.value);
    const topNodes = sortedNodes.slice(0, maxNodes);
    const topNodeIds = new Set(topNodes.map(n => n.id));

    // Filter links that connect two top nodes
    const filteredLinks = graphData.links.filter(
      l => topNodeIds.has(l.source) && topNodeIds.has(l.target)
    );

    return { nodes: topNodes, links: filteredLinks };
  }, [graphData, maxNodes]);

  // Initialize simulation
  useEffect(() => {
    if (filteredData.nodes.length === 0) {
        setSimulationNodes([]);
        setSimulationLinks([]);
        return;
    }

    // Initial Position Scatter
    const width = 800;
    const height = 600;

    const nodes = filteredData.nodes.map(n => ({ 
      ...n, 
      // If node already existed in previous frame, keep its position to avoid jumping
      x: simulationNodesRef.current.find(old => old.id === n.id)?.x || Math.random() * width, 
      y: simulationNodesRef.current.find(old => old.id === n.id)?.y || Math.random() * height, 
      vx: 0, 
      vy: 0 
    }));
    
    const links = filteredData.links.map(l => ({ ...l }));
    
    simulationNodesRef.current = nodes;
    setSimulationNodes(nodes);
    setSimulationLinks(links);

    // Physics Constants
    const repulsion = 8000;
    const springLength = 180;
    const springStrength = 0.04;
    const damping = 0.85;
    const centerStrength = 0.03;
    const maxVelocity = 15; 

    const updatePhysics = () => {
      const currentNodes = simulationNodesRef.current;
      if (currentNodes.length === 0) return;

      // 1. Repulsion (Node vs Node)
      // Optimization: Simple O(N^2) is fine for N=40.
      for (let i = 0; i < currentNodes.length; i++) {
        for (let j = i + 1; j < currentNodes.length; j++) {
          const n1 = currentNodes[i];
          const n2 = currentNodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const distSq = dx*dx + dy*dy + 1; // Avoid div/0
          const dist = Math.sqrt(distSq);
          
          if (dist < 600) { 
            const force = repulsion / distSq;
            const fx = (dx/dist) * force;
            const fy = (dy/dist) * force;

            n1.vx += fx;
            n1.vy += fy;
            n2.vx -= fx;
            n2.vy -= fy;
          }
        }
      }

      // 2. Spring (Links)
      links.forEach(link => {
        const s = currentNodes.find(n => n.id === link.source);
        const t = currentNodes.find(n => n.id === link.target);
        if (s && t) {
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const force = (dist - springLength) * springStrength;
          
          const fx = (dx/dist) * force;
          const fy = (dy/dist) * force;

          s.vx += fx;
          s.vy += fy;
          t.vx -= fx;
          t.vy -= fy;
        }
      });

      // 3. Center Gravity + Update + Velocity Cap
      currentNodes.forEach(n => {
        const dx = width/2 - n.x;
        const dy = height/2 - n.y;
        n.vx += dx * centerStrength;
        n.vy += dy * centerStrength;

        // Cap Velocity
        const v = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
        if (v > maxVelocity) {
           n.vx = (n.vx / v) * maxVelocity;
           n.vy = (n.vy / v) * maxVelocity;
        }

        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
      });

      // Trigger React Render
      setSimulationNodes([...currentNodes]);
      requestRef.current = requestAnimationFrame(updatePhysics);
    };

    requestRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };

  }, [filteredData]);

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
        <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur p-3 rounded-lg shadow-sm border border-gray-200 max-w-[200px]">
            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                <Share2 className="w-4 h-4" /> 核心人物图谱
            </h3>
            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
               显示最重要的 {filteredData.nodes.length} 位角色 (共 {graphData.nodes.length} 位)
            </p>
            {graphData.nodes.length > maxNodes && (
               <div className="flex items-center gap-1 mt-2 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                  <Filter className="w-3 h-3" /> 已自动过滤边缘角色
               </div>
            )}
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
                        <g key={`link-${i}`}>
                            <line 
                                x1={s.x} y1={s.y} x2={t.x} y2={t.y} 
                                stroke="#cbd5e1" 
                                strokeWidth="1.2" 
                            />
                             {/* Only show label if nodes are somewhat apart */}
                             {Math.abs(s.x - t.x) + Math.abs(s.y - t.y) > 60 && (
                                <text 
                                    x={(s.x + t.x)/2} y={(s.y + t.y)/2} 
                                    fontSize="8" 
                                    fill="#94a3b8"
                                    textAnchor="middle"
                                    alignmentBaseline="middle"
                                    className="select-none bg-white/80"
                                >
                                    {link.label}
                                </text>
                             )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {simulationNodes.map((node, i) => {
                    const radius = Math.max(5, Math.min(25, 5 + Math.log2(node.value || 1) * 3));
                    return (
                        <g 
                            key={`node-${node.id}`} 
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => setSelectedNode(node.id)}
                            onMouseLeave={() => setSelectedNode(null)}
                            className="transition-opacity duration-300"
                            style={{ opacity: selectedNode && selectedNode !== node.id ? 0.4 : 1 }}
                        >
                            <circle 
                                r={radius} 
                                fill={selectedNode === node.id ? '#4f46e5' : '#818cf8'}
                                stroke="#fff"
                                strokeWidth="2"
                                className="transition-colors duration-200 cursor-pointer shadow-sm"
                            />
                            <text 
                                dy={radius + 12} 
                                fontSize="11" 
                                textAnchor="middle" 
                                fill="#334155"
                                fontWeight="600"
                                className="select-none pointer-events-none"
                                style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                            >
                                {node.id}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    </div>
  );
};