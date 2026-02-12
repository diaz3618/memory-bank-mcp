/**
 * Floating Edge Component
 * Edges that dynamically connect to the closest edge of nodes
 */

import React, { CSSProperties } from 'react';
import { EdgeProps, useStore, getBezierPath, getSmoothStepPath, getStraightPath, Position, InternalNode } from '@xyflow/react';

// Helper function to get the intersection point between two nodes
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode): { x: number; y: number } {
  const { internals: intersectionInternals } = intersectionNode;
  const { width: intersectionNodeWidth, height: intersectionNodeHeight } = intersectionNode.measured ?? {
    width: 0,
    height: 0,
  };
  const targetPosition = targetNode.internals.positionAbsolute;

  const w = (intersectionNodeWidth ?? 0) / 2;
  const h = (intersectionNodeHeight ?? 0) / 2;

  const x2 = intersectionInternals.positionAbsolute.x + w;
  const y2 = intersectionInternals.positionAbsolute.y + h;
  const x1 = targetPosition.x + w;
  const y1 = targetPosition.y + h;

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
function getEdgePosition(node: InternalNode, intersectionPoint: { x: number; y: number }): Position {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);
  const width = node.measured?.width ?? 0;
  const height = node.measured?.height ?? 0;

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
function getEdgeParams(source: InternalNode, target: InternalNode) {
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

export type FloatingEdgeType = 'bezier' | 'smoothstep' | 'straight';

interface FloatingEdgeProps extends EdgeProps {
  data?: {
    edgeType?: FloatingEdgeType;
  };
}

export function FloatingEdge({ id, source, target, style, data, markerEnd, animated }: FloatingEdgeProps) {
  const { sourceNode, targetNode } = useStore((s) => {
    const sourceNode = s.nodeLookup.get(source);
    const targetNode = s.nodeLookup.get(target);
    return { sourceNode, targetNode };
  });

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const edgeType = data?.edgeType ?? 'smoothstep';

  let path: string;
  if (edgeType === 'bezier') {
    [path] = getBezierPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: sourcePos,
      targetPosition: targetPos,
      targetX: tx,
      targetY: ty,
    });
  } else if (edgeType === 'straight') {
    [path] = getStraightPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
    });
  } else {
    [path] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: sourcePos,
      targetPosition: targetPos,
      targetX: tx,
      targetY: ty,
    });
  }

  return (
    <g className="react-flow__connection">
      <path
        id={id}
        className={`react-flow__edge-path ${animated ? 'react-flow__edge-path--animated' : ''}`}
        d={path}
        style={style as CSSProperties}
        markerEnd={markerEnd}
      />
    </g>
  );
}

export default FloatingEdge;
