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
import { FloatingConnectionLine } from './FloatingConnectionLine';
import { getLayoutedElements, type LayoutDirection } from './layout';
import type { EntityNode, RelationEdge, ExtensionMessage, EdgeStyleType } from './types';
import { vscode } from './vscode';

// Settings storage key
const SETTINGS_KEY = 'knowledge-graph-settings';

// Default settings
interface GraphSettings {
  snapToGrid: boolean;
  edgeType: EdgeStyleType;
  floatingEdges: boolean;
  animatedEdges: boolean;
}

const defaultSettings: GraphSettings = {
  snapToGrid: true,
  edgeType: 'smoothstep',
  floatingEdges: false,
  animatedEdges: true,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(initialSettings.snapToGrid);
  const [edgeType, setEdgeType] = useState<EdgeStyleType>(initialSettings.edgeType);
  const [floatingEdges, setFloatingEdges] = useState(initialSettings.floatingEdges);
  const [animatedEdges, setAnimatedEdges] = useState(initialSettings.animatedEdges);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    top?: number | false;
    left?: number | false;
    right?: number | false;
    bottom?: number | false;
  } | null>(null);
  const { fitView } = useReactFlow();
  const layoutDirectionRef = useRef<LayoutDirection>('TB');

  // Keep refs in sync with state
  useEffect(() => {
    layoutDirectionRef.current = layoutDirection;
  }, [layoutDirection]);

  // Layout helper - uses Dagre
  const applyLayout = useCallback((
    rawNodes: EntityNode[],
    rawEdges: RelationEdge[],
    direction: LayoutDirection
  ) => {
    const result = getLayoutedElements(rawNodes, rawEdges, { direction });
    setNodes(result.nodes);
    setEdges(result.edges);
    setTimeout(() => fitView({ padding: 0.4, duration: 400 }), 100);
  }, [setNodes, setEdges, fitView]);

  // Message handler - separate from initial load
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'graphData': {
          applyLayout(
            message.nodes,
            message.edges,
            layoutDirectionRef.current
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
    (direction: LayoutDirection) => {
      setLayoutDirection(direction);
      applyLayout(nodes, edges, direction);
    },
    [nodes, edges, applyLayout]
  );

  // UI Settings handlers (all persisted)
  const handleSnapToGridChange = useCallback((enabled: boolean) => {
    setSnapToGrid(enabled);
    saveSettings({ snapToGrid: enabled });
  }, []);

  const handleEdgeTypeChange = useCallback((type: EdgeStyleType) => {
    setEdgeType(type);
    saveSettings({ edgeType: type });
    // Update ALL existing edges with new type and pass edgeType in data for floating edges
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      type: floatingEdges ? 'floating' : type,
      data: { ...edge.data, relationType: edge.data?.relationType ?? 'related_to', edgeType: type },
    })));
  }, [setEdges, floatingEdges]);

  const handleFloatingEdgesChange = useCallback((enabled: boolean) => {
    setFloatingEdges(enabled);
    saveSettings({ floatingEdges: enabled });
    // Update ALL existing edges with floating or normal type
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      type: enabled ? 'floating' : edgeType,
      data: { ...edge.data, relationType: edge.data?.relationType ?? 'related_to', edgeType },
    })));
  }, [setEdges, edgeType]);

  const handleAnimatedEdgesChange = useCallback((enabled: boolean) => {
    setAnimatedEdges(enabled);
    saveSettings({ animatedEdges: enabled });
    // Update ALL existing edges with animation
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      animated: enabled,
      style: {
        ...edge.style,
        strokeDasharray: enabled ? '5,5' : undefined,
      },
    })));
  }, [setEdges]);

  // Auto layout - apply LR layout
  const handleAutoLayout = useCallback(() => {
    setLayoutDirection('LR');
    applyLayout(nodes, edges, 'LR');
  }, [nodes, edges, applyLayout]);

  // Connection validation - prevent self-loops and duplicate edges
  const isValidConnection = useCallback(
    (edgeOrConnection: RelationEdge | Connection) => {
      const source = 'source' in edgeOrConnection ? edgeOrConnection.source : undefined;
      const target = 'target' in edgeOrConnection ? edgeOrConnection.target : undefined;
      // Prevent self-connections
      if (source === target) {
        return false;
      }
      // Prevent duplicate edges
      const isDuplicate = edges.some(
        (edge) =>
          (edge.source === source && edge.target === target) ||
          (edge.source === target && edge.target === source)
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
        data: { relationType: 'related_to', edgeType },
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

  // Handle right-click context menu with bounds-aware positioning
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: EntityNode) => {
      event.preventDefault();
      event.stopPropagation(); // Prevent event bubbling that might close menu
      setSelectedNodeId(node.id);
      
      // Calculate position to prevent menu going off-screen
      // Using viewport dimensions since context-menu has position:fixed
      const menuWidth = 200;
      const menuHeight = 250;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      setContextMenu({
        nodeId: node.id,
        top: event.clientY + menuHeight < viewportHeight ? event.clientY : false,
        left: event.clientX + menuWidth < viewportWidth ? event.clientX : false,
        right: event.clientX + menuWidth >= viewportWidth ? viewportWidth - event.clientX : false,
        bottom: event.clientY + menuHeight >= viewportHeight ? viewportHeight - event.clientY : false,
      });
    },
    []
  );

  // Handle pane context menu (right-click on background)
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(null);
  }, []);

  // Close context menu and clear selection on pane click
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  // Handle search - empty query shows all nodes
  const handleSearch = useCallback(() => {
    setIsLoading(true);
    // If query is empty, load all nodes; otherwise search
    if (searchQuery.trim()) {
      vscode.postMessage({ type: 'search', query: searchQuery });
    } else {
      vscode.postMessage({ type: 'loadGraph' });
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

  // Settings panel actions - send requests to extension which shows native VSCode dialogs
  const handleCreateEntity = useCallback(() => {
    vscode.postMessage({ type: 'requestCreateEntity' });
    setShowSettings(false);
  }, []);

  const handleAddObservation = useCallback(() => {
    vscode.postMessage({ type: 'requestAddObservation', entity: selectedNodeId ?? undefined });
    setShowSettings(false);
  }, [selectedNodeId]);

  const handleLinkEntities = useCallback(() => {
    vscode.postMessage({ type: 'requestLinkEntities', from: selectedNodeId ?? undefined });
    setShowSettings(false);
  }, [selectedNodeId]);

  const handleDuplicateEntity = useCallback(() => {
    if (!selectedNodeId) {
      vscode.postMessage({ type: 'showError', message: 'Please select a node first' });
      return;
    }
    vscode.postMessage({ type: 'requestDuplicateEntity', entityId: selectedNodeId });
    setShowSettings(false);
  }, [selectedNodeId]);

  const handleDeleteEntity = useCallback(() => {
    if (!selectedNodeId) {
      vscode.postMessage({ type: 'showError', message: 'Please select a node first' });
      return;
    }
    vscode.postMessage({ type: 'deleteNode', nodeId: selectedNodeId });
    setSelectedNodeId(null);
    setShowSettings(false);
    setContextMenu(null);
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
      vscode.postMessage({ type: 'requestAddObservation', entity: contextMenu.nodeId });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextLink = useCallback(() => {
    if (contextMenu) {
      vscode.postMessage({ type: 'requestLinkEntities', from: contextMenu.nodeId });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextDelete = useCallback(() => {
    if (contextMenu) {
      vscode.postMessage({ type: 'requestDeleteEntity', entityId: contextMenu.nodeId });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextEdit = useCallback(() => {
    if (contextMenu) {
      vscode.postMessage({ type: 'requestRenameEntity', entityId: contextMenu.nodeId });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextDuplicate = useCallback(() => {
    if (contextMenu) {
      vscode.postMessage({ type: 'requestDuplicateEntity', entityId: contextMenu.nodeId });
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
          style={{
            top: contextMenu.top !== false ? contextMenu.top : undefined,
            left: contextMenu.left !== false ? contextMenu.left : undefined,
            right: contextMenu.right !== false ? contextMenu.right : undefined,
            bottom: contextMenu.bottom !== false ? contextMenu.bottom : undefined,
          }}
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
                  value="straight"
                  checked={edgeType === 'straight'}
                  onChange={() => handleEdgeTypeChange('straight')}
                />
                Straight
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
        connectionLineComponent={floatingEdges ? FloatingConnectionLine : undefined}
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
