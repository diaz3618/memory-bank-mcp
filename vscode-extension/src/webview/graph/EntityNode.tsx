/**
 * Custom Entity Node Component
 * Displays entity information with interactive NodeToolbar
 */

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeToolbar, type NodeProps } from '@xyflow/react';
import type { EntityNode } from './types';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

export const EntityNodeComponent = memo(({ data, id, selected }: NodeProps<EntityNode>) => {
  const handleExpand = useCallback(() => {
    vscode.postMessage({ type: 'expandNode', nodeId: id });
  }, [id]);

  const handleDelete = useCallback(() => {
    vscode.postMessage({ type: 'deleteNode', nodeId: id });
  }, [id]);

  const handleAddRelation = useCallback(() => {
    vscode.postMessage({ type: 'addRelation', fromId: id });
  }, [id]);

  return (
    <>
      {/* Toolbar appears when node is selected */}
      <NodeToolbar isVisible={selected} position={Position.Top}>
        <div className="node-toolbar">
          <button
            className="toolbar-button"
            onClick={handleExpand}
            title="Expand neighborhood"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="toolbar-button"
            onClick={handleAddRelation}
            title="Add relation"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7H13M7 1L13 7L7 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="toolbar-button danger"
            onClick={handleDelete}
            title="Delete node"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M2 12L12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
           </svg>
          </button>
        </div>
      </NodeToolbar>

      {/* Node content */}
      <div
        className="entity-node"
        style={{
          background: data.color,
          borderColor: selected ? 'var(--vscode-focusBorder)' : 'rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="entity-node-header">
          <div className="entity-node-label">{data.label}</div>
          <div className="entity-node-type">{data.entityType}</div>
        </div>

        {(data.observationCount || data.relationCount) && (
          <div className="entity-node-footer">
            {data.observationCount !== undefined && (
              <div className="entity-node-stat" title="Observations">
                📝 {data.observationCount}
              </div>
            )}
            {data.relationCount !== undefined && (
              <div className="entity-node-stat" title="Relations">
                🔗 {data.relationCount}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="entity-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="entity-handle"
      />
    </>
  );
});

EntityNodeComponent.displayName = 'EntityNode';
