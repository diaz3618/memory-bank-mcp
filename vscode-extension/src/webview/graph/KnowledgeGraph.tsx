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
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const layoutDirectionRef = useRef<LayoutDirection>('TB');

  // Keep ref in sync with state
  useEffect(() => {
    layoutDirectionRef.current = layoutDirection;
  }, [layoutDirection]);

  // Message handler - separate from initial load
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'graphData': {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            message.nodes,
            message.edges,
            { direction: layoutDirectionRef.current }
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setIsLoading(false);

          // Fit view with better padding (less zoomed in)
          setTimeout(() => {
            fitView({ padding: 0.4, duration: 400 });
          }, 100);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setNodes, setEdges, fitView]);

  // Initial load - only runs once
  useEffect(() => {
    vscode.postMessage({ type: 'loadGraph' });
  }, []);

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
      setTimeout(() => fitView({ padding: 0.4, duration: 400 }), 100);
    },
    [nodes, edges, setNodes, setEdges, fitView]
  );

  // Auto layout - re-apply current layout
  const handleAutoLayout = useCallback(() => {
    const { nodes: relayoutedNodes, edges: relayoutedEdges } = relayout(
      nodes,
      edges,
      layoutDirection
    );
    setNodes(relayoutedNodes);
    setEdges(relayoutedEdges);
    setTimeout(() => fitView({ padding: 0.4, duration: 400 }), 100);
  }, [nodes, edges, layoutDirection, setNodes, setEdges, fitView]);

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
      setSelectedNodeId(node.id);
      vscode.postMessage({ type: 'nodeSelected', nodeId: node.id });
    },
    []
  );

  // Handle search
  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      setIsLoading(true);
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

  // Settings panel actions
  const handleCreateEntity = useCallback(() => {
    const name = prompt('Entity name:');
    if (!name) return;
    const entityType = prompt('Entity type (e.g., module, service, concept):');
    if (!entityType) return;
    vscode.postMessage({ type: 'upsertEntity', name, entityType });
    setShowSettings(false);
    setIsLoading(true);
  }, []);

  const handleAddObservation = useCallback(() => {
    const entity = selectedNodeId || prompt('Entity name:');
    if (!entity) return;
    const text = prompt('Observation text:');
    if (!text) return;
    vscode.postMessage({ type: 'addObservation', entity, text });
    setShowSettings(false);
  }, [selectedNodeId]);

  const handleLinkEntities = useCallback(() => {
    const from = selectedNodeId || prompt('Source entity:');
    if (!from) return;
    const to = prompt('Target entity:');
    if (!to) return;
    const relationType = prompt('Relation type (e.g., depends_on, uses):');
    if (!relationType) return;
    vscode.postMessage({ type: 'linkEntities', from, to, relationType });
    setShowSettings(false);
    setIsLoading(true);
  }, [selectedNodeId]);

  const handleDuplicateEntity = useCallback(() => {
    if (!selectedNodeId) {
      alert('Please select a node first');
      return;
    }
    const newName = prompt('New entity name:', `${selectedNodeId}_copy`);
    if (!newName) return;
    vscode.postMessage({ type: 'duplicateEntity', entityId: selectedNodeId, newName });
    setShowSettings(false);
    setIsLoading(true);
  }, [selectedNodeId]);

  const handleDeleteEntity = useCallback(() => {
    if (!selectedNodeId) {
      alert('Please select a node first');
      return;
    }
    if (!confirm(`Delete entity "${selectedNodeId}" and all its relations?`)) return;
    vscode.postMessage({ type: 'deleteNode', nodeId: selectedNodeId });
    setSelectedNodeId(null);
    setShowSettings(false);
    setIsLoading(true);
  }, [selectedNodeId]);

  return (
    <div className="knowledge-graph-container">
      {/* Loading indicator */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Loading graph...</div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <span className="settings-title">Graph Operations</span>
              <button className="settings-close" onClick={() => setShowSettings(false)}>X</button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <div className="settings-section-title">Create</div>
                <button className="settings-button" onClick={handleCreateEntity}>
                  Create Entity
                </button>
                <button className="settings-button" onClick={handleAddObservation}>
                  Add Observation{selectedNodeId ? ` to "${selectedNodeId}"` : ''}
                </button>
              </div>
              <div className="settings-section">
                <div className="settings-section-title">Connect</div>
                <button className="settings-button" onClick={handleLinkEntities}>
                  Link Entities{selectedNodeId ? ` from "${selectedNodeId}"` : ''}
                </button>
              </div>
              {selectedNodeId && (
                <div className="settings-section">
                  <div className="settings-section-title">Selected: {selectedNodeId}</div>
                  <button className="settings-button" onClick={handleDuplicateEntity}>
                    Duplicate Entity
                  </button>
                  <button className="settings-button settings-button-danger" onClick={handleDeleteEntity}>
                    Delete Entity
                  </button>
                </div>
              )}
            </div>
          </div>
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
                Search
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
                TB
              </button>
              <button
                className={`toolbar-button ${layoutDirection === 'LR' ? 'active' : ''}`}
                onClick={() => handleLayoutChange('LR')}
                title="Left to Right"
              >
                LR
              </button>
              <button
                className="toolbar-button"
                onClick={handleAutoLayout}
                title="Auto Layout"
              >
                Auto
              </button>
            </div>

            <div className="separator" />

            <button
              className="toolbar-button"
              onClick={handleRebuild}
              title="Rebuild graph from source"
            >
              Rebuild
            </button>

            <button
              className="toolbar-button"
              onClick={() => setShowSettings(true)}
              title="Graph operations"
            >
              Settings
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
            {selectedNodeId && (
              <div className="stat-item">
                <span className="stat-label">Selected:</span>
                <span className="stat-value">{selectedNodeId}</span>
              </div>
            )}
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
