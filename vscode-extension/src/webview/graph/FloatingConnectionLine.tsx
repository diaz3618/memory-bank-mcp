/**
 * Floating Connection Line Component
 * Shows a floating edge path when dragging to create a new connection
 */

import React from 'react';
import { getBezierPath, Position, type ConnectionLineComponentProps } from '@xyflow/react';

// Helper function to get the intersection point between two nodes
function getNodeIntersection(
  intersectionNode: { measured: { width: number; height: number }; internals: { positionAbsolute: { x: number; y: number } } },
  targetNode: { measured: { width: number; height: number }; internals: { positionAbsolute: { x: number; y: number } } }
): { x: number; y: number } {
  const { width: intersectionNodeWidth, height: intersectionNodeHeight } = intersectionNode.measured;
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
  const targetPosition = targetNode.internals.positionAbsolute;

  const w = intersectionNodeWidth / 2;
  const h = intersectionNodeHeight / 2;

  const x2 = intersectionNodePosition.x + w;
  const y2 = intersectionNodePosition.y + h;
  const x1 = targetPosition.x + targetNode.measured.width / 2;
  const y1 = targetPosition.y + targetNode.measured.height / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

// Get edge position (top, right, bottom, left) based on intersection point
function getEdgePosition(
  node: { measured: { width: number; height: number }; internals: { positionAbsolute: { x: number; y: number } } },
  intersectionPoint: { x: number; y: number }
): Position {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);
  const width = node.measured.width;
  const height = node.measured.height;

  if (px <= nx + 1) {
    return Position.Left;
  }
  if (px >= nx + width - 1) {
    return Position.Right;
  }
  if (py <= ny + 1) {
    return Position.Top;
  }
  if (py >= ny + height - 1) {
    return Position.Bottom;
  }

  return Position.Top;
}

// Get all edge parameters for floating connection
function getEdgeParams(
  source: { measured: { width: number; height: number }; internals: { positionAbsolute: { x: number; y: number } } },
  target: { measured: { width: number; height: number }; internals: { positionAbsolute: { x: number; y: number } } }
) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
  const targetPos = getEdgePosition(target, targetIntersectionPoint);

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  };
}

export function FloatingConnectionLine({
  toX,
  toY,
  fromPosition,
  toPosition,
  fromNode,
}: ConnectionLineComponentProps) {
  if (!fromNode) {
    return null;
  }

  // Create a mock target node at the cursor position
  const targetNode = {
    id: 'connection-target',
    measured: {
      width: 1,
      height: 1,
    },
    internals: {
      positionAbsolute: { x: toX, y: toY },
    },
  };

  // Check if fromNode has the required properties
  if (!fromNode.measured?.width || !fromNode.measured?.height) {
    // Fallback to simple line if node isn't measured yet
    return (
      <g>
        <path
          fill="none"
          stroke="var(--vscode-editorWidget-border)"
          strokeWidth={2}
          d={`M ${fromNode.internals.positionAbsolute.x} ${fromNode.internals.positionAbsolute.y} L ${toX} ${toY}`}
        />
      </g>
    );
  }

  const sourceNode = {
    measured: {
      width: fromNode.measured.width,
      height: fromNode.measured.height,
    },
    internals: {
      positionAbsolute: fromNode.internals.positionAbsolute,
    },
  };

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos || fromPosition,
    targetPosition: targetPos || toPosition,
    targetX: tx || toX,
    targetY: ty || toY,
  });

  return (
    <g>
      <path
        fill="none"
        stroke="var(--vscode-editorWidget-border)"
        strokeWidth={2}
        className="animated"
        d={edgePath}
      />
      <circle
        cx={tx || toX}
        cy={ty || toY}
        fill="var(--vscode-editor-background)"
        r={3}
        stroke="var(--vscode-editorWidget-border)"
        strokeWidth={2}
      />
    </g>
  );
}

export default FloatingConnectionLine;
