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
  type Connection,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { EntityNodeComponent } from './EntityNode';
import { FloatingEdge } from './FloatingEdge';
import { getLayoutedElements, getElkLayoutedElements, relayout, type LayoutDirection, type LayoutAlgorithm } from './layout';
import type { EntityNode, RelationEdge, ExtensionMessage } from './types';
import { vscode } from './vscode';

// Edge type options
export type EdgeStyleType = 'smoothstep' | 'bezier' | 'straight' | 'step';

// Settings storage key
const SETTINGS_KEY = 'knowledge-graph-settings';

// Default settings
interface GraphSettings {
  snapToGrid: boolean;
  edgeType: EdgeStyleType;
  floatingEdges: boolean;
  animatedEdges: boolean;
  layoutAlgorithm: LayoutAlgorithm;
}

const defaultSettings: GraphSettings = {
  snapToGrid: true,
  edgeType: 'smoothstep',
  floatingEdges: false,
  animatedEdges: true,
  layoutAlgorithm: 'dagre',
};

// Load settings from localStorage
function loadSettings(): GraphSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return defaultSettings;
}

// Save settings to localStorage
function saveSettings(settings: Partial<GraphSettings>) {
  try {
    const current = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

// Register custom node types
const nodeTypes = {
  entity: EntityNodeComponent,
};

// Register custom edge types
const edgeTypes = {
  floating: FloatingEdge,
};

/**
 * Inner component - must be wrapped in ReactFlowProvider
 */
function KnowledgeGraphInner() {
  // Load initial settings from localStorage
  const initialSettings = loadSettings();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationEdge>([]);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('TB');
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<LayoutAlgorithm>(initialSettings.layoutAlgorithm);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(initialSettings.snapToGrid);
  const [edgeType, setEdgeType] = useState<EdgeStyleType>(initialSettings.edgeType);
  const [floatingEdges, setFloatingEdges] = useState(initialSettings.floatingEdges);
  const [animatedEdges, setAnimatedEdges] = useState(initialSettings.animatedEdges);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const { fitView } = useReactFlow();
  const layoutDirectionRef = useRef<LayoutDirection>('TB');
  const layoutAlgorithmRef = useRef<LayoutAlgorithm>(initialSettings.layoutAlgorithm);

  // Keep refs in sync with state
  useEffect(() => {
    layoutDirectionRef.current = layoutDirection;
    layoutAlgorithmRef.current = layoutAlgorithm;
  }, [layoutDirection, layoutAlgorithm]);

  // Layout helper - uses ELK or dagre based on algorithm setting
  const applyLayout = useCallback(async (
    rawNodes: EntityNode[],
    rawEdges: RelationEdge[],
    direction: LayoutDirection,
    algorithm: LayoutAlgorithm
  ) => {
    if (algorithm === 'elk-layered' || algorithm === 'elk-mrtree') {
      const result = await getElkLayoutedElements(rawNodes, rawEdges, { direction, algorithm });
      setNodes(result.nodes);
      setEdges(result.edges);
    } else {
      const result = getLayoutedElements(rawNodes, rawEdges, { direction });
      setNodes(result.nodes);
      setEdges(result.edges);
    }
    setTimeout(() => fitView({ padding: 0.4, duration: 400 }), 100);
  }, [setNodes, setEdges, fitView]);

  // Message handler - separate from initial load
  useEffect(() => {
    const handleMessage = async (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'graphData': {
          await applyLayout(
            message.nodes,
            message.edges,
            layoutDirectionRef.current,
            layoutAlgorithmRef.current
          );
          setIsLoading(false);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyLayout]);

  // Initial load - only runs once
  useEffect(() => {
    vscode.postMessage({ type: 'loadGraph' });
  }, []);

  // Handle layout direction change
  const handleLayoutChange = useCallback(
    async (direction: LayoutDirection) => {
      setLayoutDirection(direction);
      await applyLayout(nodes, edges, direction, layoutAlgorithm);
    },
    [nodes, edges, layoutAlgorithm, applyLayout]
  );

  // Handle layout algorithm change (persisted)
  const handleAlgorithmChange = useCallback(
    async (algorithm: LayoutAlgorithm) => {
      setLayoutAlgorithm(algorithm);
      saveSettings({ layoutAlgorithm: algorithm });
      await applyLayout(nodes, edges, layoutDirection, algorithm);
    },
    [nodes, edges, layoutDirection, applyLayout]
  );

  // UI Settings handlers (all persisted)
  const handleSnapToGridChange = useCallback((enabled: boolean) => {
    setSnapToGrid(enabled);
    saveSettings({ snapToGrid: enabled });
  }, []);

  const handleEdgeTypeChange = useCallback((type: EdgeStyleType) => {
    setEdgeType(type);
    saveSettings({ edgeType: type });
  }, []);

  const handleFloatingEdgesChange = useCallback((enabled: boolean) => {
    setFloatingEdges(enabled);
    saveSettings({ floatingEdges: enabled });
  }, []);

  const handleAnimatedEdgesChange = useCallback((enabled: boolean) => {
    setAnimatedEdges(enabled);
    saveSettings({ animatedEdges: enabled });
  }, []);

  // Auto layout - apply LR layout with current algorithm
  const handleAutoLayout = useCallback(async () => {
    setLayoutDirection('LR');
    await applyLayout(nodes, edges, 'LR', layoutAlgorithm);
  }, [nodes, edges, layoutAlgorithm, applyLayout]);

  // Connection validation - prevent self-loops and duplicate edges
  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Prevent self-connections
      if (connection.source === connection.target) {
        return false;
      }
      // Prevent duplicate edges
      const isDuplicate = edges.some(
        (edge) =>
          (edge.source === connection.source && edge.target === connection.target) ||
          (edge.source === connection.target && edge.target === connection.source)
      );
      return !isDuplicate;
    },
    [edges]
  );

  // Handle edge connections with current settings
  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        type: floatingEdges ? 'floating' : edgeType,
        animated: animatedEdges,
        style: animatedEdges ? { strokeDasharray: '5,5' } : undefined,
        data: { edgeType },
      }, eds));
    },
    [setEdges, floatingEdges, edgeType, animatedEdges]
  );

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      setSelectedNodeId(node.id);
      setContextMenu(null);
      vscode.postMessage({ type: 'nodeSelected', nodeId: node.id });
    },
    []
  );

  // Handle right-click context menu
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: EntityNode) => {
      event.preventDefault();
      setSelectedNodeId(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    []
  );

  // Close context menu on pane click
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

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
    setContextMenu(null);
    setIsLoading(true);
  }, [selectedNodeId]);

  // Context menu actions
  const handleContextExpand = useCallback(() => {
    if (contextMenu) {
      vscode.postMessage({ type: 'expandNode', nodeId: contextMenu.nodeId });
      setIsLoading(true);
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextAddObservation = useCallback(() => {
    if (contextMenu) {
      const text = prompt('Observation text:');
      if (text) {
        vscode.postMessage({ type: 'addObservation', entity: contextMenu.nodeId, text });
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextLink = useCallback(() => {
    if (contextMenu) {
      const to = prompt('Link to entity:');
      if (to) {
        const relationType = prompt('Relation type (e.g., depends_on):');
        if (relationType) {
          vscode.postMessage({ type: 'linkEntities', from: contextMenu.nodeId, to, relationType });
          setIsLoading(true);
        }
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextDelete = useCallback(() => {
    if (contextMenu) {
      if (confirm(`Delete entity "${contextMenu.nodeId}"?`)) {
        vscode.postMessage({ type: 'deleteNode', nodeId: contextMenu.nodeId });
        setIsLoading(true);
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextEdit = useCallback(() => {
    if (contextMenu) {
      const newName = prompt('Rename entity to:', contextMenu.nodeId);
      if (newName && newName !== contextMenu.nodeId) {
        vscode.postMessage({ type: 'renameEntity', entityId: contextMenu.nodeId, newName });
        setIsLoading(true);
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextDuplicate = useCallback(() => {
    if (contextMenu) {
      const newName = prompt('New entity name:', `${contextMenu.nodeId}_copy`);
      if (newName) {
        vscode.postMessage({ type: 'duplicateEntity', entityId: contextMenu.nodeId, newName });
        setIsLoading(true);
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  return (
    <div className="knowledge-graph-container">
      {/* Loading indicator */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Loading graph...</div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={handleContextEdit}>
            Edit (Rename)
          </button>
          <button className="context-menu-item" onClick={handleContextDuplicate}>
            Duplicate
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={handleContextExpand}>
            Expand Neighborhood
          </button>
          <button className="context-menu-item" onClick={handleContextAddObservation}>
            Add Observation
          </button>
          <button className="context-menu-item" onClick={handleContextLink}>
            Link to Entity
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item context-menu-item-danger" onClick={handleContextDelete}>
            Delete Entity
          </button>
        </div>
      )}

      {/* Settings Panel - Right Side */}
      <div className={`settings-panel-right ${showSettings ? 'open' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
        </div>
        <div className="settings-content">
          {/* UI Appearance Section */}
          <div className="settings-section">
            <div className="settings-section-title">UI Appearance</div>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => handleSnapToGridChange(e.target.checked)}
              />
              Snap to Grid
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={animatedEdges}
                onChange={(e) => handleAnimatedEdgesChange(e.target.checked)}
              />
              Animated Edges
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={floatingEdges}
                onChange={(e) => handleFloatingEdgesChange(e.target.checked)}
              />
              Floating Edges
            </label>
          </div>

          {/* Edge Type Section */}
          <div className="settings-section">
            <div className="settings-section-title">Edge Style</div>
            <div className="settings-radio-group">
              <label className="settings-radio">
                <input
                  type="radio"
                  name="edgeType"
                  value="smoothstep"
                  checked={edgeType === 'smoothstep'}
                  onChange={() => handleEdgeTypeChange('smoothstep')}
                />
                Smooth Step
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="edgeType"
                  value="bezier"
                  checked={edgeType === 'bezier'}
                  onChange={() => handleEdgeTypeChange('bezier')}
                />
                Bezier
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="edgeType"
                  value="step"
                  checked={edgeType === 'step'}
                  onChange={() => handleEdgeTypeChange('step')}
                />
                Step
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="edgeType"
                  value="straight"
                  checked={edgeType === 'straight'}
                  onChange={() => handleEdgeTypeChange('straight')}
                />
                Straight
              </label>
            </div>
          </div>

          {/* Layout Algorithm Section */}
          <div className="settings-section">
            <div className="settings-section-title">Layout Algorithm</div>
            <div className="settings-radio-group">
              <label className="settings-radio">
                <input
                  type="radio"
                  name="algorithm"
                  value="dagre"
                  checked={layoutAlgorithm === 'dagre'}
                  onChange={() => handleAlgorithmChange('dagre')}
                />
                Dagre (Fast)
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="algorithm"
                  value="elk-layered"
                  checked={layoutAlgorithm === 'elk-layered'}
                  onChange={() => handleAlgorithmChange('elk-layered')}
                />
                ELK Layered
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="algorithm"
                  value="elk-mrtree"
                  checked={layoutAlgorithm === 'elk-mrtree'}
                  onChange={() => handleAlgorithmChange('elk-mrtree')}
                />
                ELK Tree
              </label>
            </div>
          </div>

          {/* Operations Section */}
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

      {/* React Flow Canvas */}
      <ReactFlow<EntityNode, RelationEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        snapToGrid={snapToGrid}
        snapGrid={[15, 15]}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: floatingEdges ? 'floating' : edgeType,
          animated: animatedEdges,
          style: {
            strokeWidth: 2,
            stroke: 'var(--vscode-editorWidget-border)',
            ...(animatedEdges ? { strokeDasharray: '5,5' } : {}),
          },
          data: { edgeType },
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
              className={`toolbar-button ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
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
