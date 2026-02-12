/**
 * Knowledge Graph - Main React Flow Component
 * Implements advanced features: MiniMap, Controls, Background, NodeToolbar, Dagre layout
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { EntityNodeComponent } from './EntityNode';
import { getLayoutedElements, relayout, type LayoutDirection } from './layout';
import type { EntityNode, RelationEdge, ExtensionMessage } from './types';
import { vscode } from './vscode';

// Register custom node types
const nodeTypes = {
  entity: EntityNodeComponent,
};

/**
 * Inner component - must be wrapped in ReactFlowProvider
 */
function KnowledgeGraphInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationEdge>([]);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('TB');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { fitView } = useReactFlow();
  const initialLoadRef = useRef(false);

  // Load initial graph data
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    vscode.postMessage({ type: 'loadGraph' });

    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'graphData': {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            message.nodes,
            message.edges,
            { direction: layoutDirection }
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setIsLoading(false);

          // Fit view after a short delay to ensure rendering is complete
          setTimeout(() => {
            fitView({ padding: 0.2, duration: 400 });
          }, 100);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [layoutDirection, setNodes, setEdges, fitView]);

  // Handle layout direction change
  const handleLayoutChange = useCallback(
    (direction: LayoutDirection) => {
      setLayoutDirection(direction);
      const { nodes: relayoutedNodes, edges: relayoutedEdges } = relayout(
        nodes,
        edges,
        direction
      );
      setNodes(relayoutedNodes);
      setEdges(relayoutedEdges);
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
    },
    [nodes, edges, setNodes, setEdges, fitView]
  );

  // Handle edge connections
  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        type: 'smoothstep',
        animated: false,
      }, eds));
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      vscode.postMessage({ type: 'nodeSelected', nodeId: node.id });
    },
    []
  );

  // Handle search
  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      vscode.postMessage({ type: 'search', query: searchQuery });
    }
  }, [searchQuery]);

  // Handle rebuild
  const handleRebuild = useCallback(() => {
    setIsLoading(true);
    vscode.postMessage({ type: 'rebuild' });
  }, []);

  // MiniMap node color function
  const miniMapNodeColor = useCallback((node: EntityNode) => {
    return node.data.color;
  }, []);

  return (
    <div className="knowledge-graph-container">
      {/* Loading indicator */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Loading graph...</div>
        </div>
      )}

      {/* React Flow Canvas */}
      <ReactFlow<EntityNode, RelationEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { strokeWidth: 2, stroke: 'var(--vscode-editorWidget-border)' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        {/* MiniMap - bird's eye view */}
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          position="bottom-right"
        />

        {/* Controls - zoom and fit view */}
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          position="top-left"
        />

        {/* Background - dot pattern */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--vscode-editorWidget-border)"
        />

        {/* Top toolbar panel */}
        <Panel position="top-center" className="toolbar-panel">
          <div className="toolbar">
            <div className="search-container">
              <input
                type="text" className="search-input"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                className="toolbar-button"
                onClick={handleSearch}
                title="Search"
              >
                🔍
              </button>
            </div>

            <div className="separator" />

            <div className="layout-buttons">
              <span className="label">Layout:</span>
              <button
                className={`toolbar-button ${layoutDirection === 'TB' ? 'active' : ''}`}
                onClick={() => handleLayoutChange('TB')}
                title="Top to Bottom"
              >
                ↓
              </button>
              <button
                className={`toolbar-button ${layoutDirection === 'LR' ? 'active' : ''}`}
                onClick={() => handleLayoutChange('LR')}
                title="Left to Right"
              >
                →
              </button>
              <button
                className={`toolbar-button ${layoutDirection === 'BT' ? 'active' : ''}`}
                onClick={() => handleLayoutChange('BT')}
                title="Bottom to Top"
              >
                ↑
              </button>
              <button
                className={`toolbar-button ${layoutDirection === 'RL' ? 'active' : ''}`}
                onClick={() => handleLayoutChange('RL')}
                title="Right to Left"
              >
                ←
              </button>
            </div>

            <div className="separator" />

            <button
              className="toolbar-button"
              onClick={handleRebuild}
              title="Rebuild graph"
            >
              🔄
            </button>
          </div>
        </Panel>

        {/* Stats panel */}
        <Panel position="bottom-left" className="stats-panel">
          <div className="stats">
            <div className="stat-item">
              <span className="stat-label">Nodes:</span>
              <span className="stat-value">{nodes.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Edges:</span>
              <span className="stat-value">{edges.length}</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/**
 * Main export - wrapped with ReactFlowProvider
 */
export function KnowledgeGraph() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner />
    </ReactFlowProvider>
  );
}
