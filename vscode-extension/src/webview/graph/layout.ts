/**
 * Layout utilities using Dagre algorithm for automatic node positioning
 */

import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 172;
const NODE_HEIGHT = 80;

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
  edgeSep?: number;
}

/**
 * Apply Dagre layout algorithm to nodes and edges
 */
export function getLayoutedElements<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions = {}
): { nodes: N[]; edges: E[] } {
  const {
    direction = 'TB',
    nodeWidth = NODE_WIDTH,
    nodeHeight = NODE_HEIGHT,
    rankSep = 80,
    nodeSep = 60,
    edgeSep = 10,
  } = options;

  // Create a new directed graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure the graph
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: rankSep,
    nodesep: nodeSep,
    edgesep: edgeSep,
  });

  // Add nodes with their dimensions
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  });

  // Add edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate the layout
  dagre.layout(dagreGraph);

  // Update node positions based on layout
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      // Set handle positions based on layout direction
      sourcePosition: direction === 'TB' ? 'bottom' : direction === 'LR' ? 'right' : direction === 'BT' ? 'top' : 'left',
      targetPosition: direction === 'TB' ? 'top' : direction === 'LR' ? 'left' : direction === 'BT' ? 'bottom' : 'right',
    } as N;
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}

/**
 * Re-layout the graph with a specific direction
 */
export function relayout<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[],
  direction: LayoutDirection
): { nodes: N[]; edges: E[] } {
  return getLayoutedElements(nodes, edges, { direction });
}

/**
 * Get estimated graph dimensions
 */
export function getGraphDimensions(nodeCount: number, direction: LayoutDirection = 'TB'): { width: number; height: number } {
  const isVertical = direction === 'TB' || direction === 'BT';
  const estimatedLayers = Math.ceil(Math.sqrt(nodeCount));
  const nodesPerLayer = Math.ceil(nodeCount / estimatedLayers);

  if (isVertical) {
    return {
      width: nodesPerLayer * (NODE_WIDTH + 60),
      height: estimatedLayers * (NODE_HEIGHT + 80),
    };
  } else {
    return {
      width: estimatedLayers * (NODE_WIDTH + 80),
      height: nodesPerLayer * (NODE_HEIGHT + 60),
    };
  }
}
