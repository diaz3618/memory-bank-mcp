/**
 * TypeScript type definitions for the Knowledge Graph webview
 */

import type { Node, Edge } from '@xyflow/react';

/**
 * Entity node data structure
 */
export interface EntityNodeData extends Record<string, unknown> {
  label: string;
  entityType: string;
  color: string;
  observationCount?: number;
  relationCount?: number;
  attrs?: Record<string, unknown>;
}

/**
 * Typed entity node
 */
export type EntityNode = Node<EntityNodeData, 'entity'>;

/**
 * Union of all app node types
 */
export type AppNode = EntityNode;

/**
 * Edge style type options
 */
export type EdgeStyleType = 'smoothstep' | 'bezier' | 'straight';

/**
 * Relation edge data structure
 */
export interface RelationEdgeData extends Record<string, unknown> {
  relationType: string;
  label?: string;
  edgeType?: EdgeStyleType;
}

/**
 * Typed relation edge
 */
export type RelationEdge = Edge<RelationEdgeData>;

/**
 * Union of all app edge types
 */
export type AppEdge = RelationEdge;

/**
 * Message types for webview communication
 */
export interface GraphDataMessage {
  type: 'graphData';
  nodes: EntityNode[];
  edges: RelationEdge[];
}

export interface SearchMessage {
  type: 'search';
  query: string;
}

export interface NodeSelectedMessage {
  type: 'nodeSelected';
  nodeId: string | null;
}

export interface ExpandNodeMessage {
  type: 'expandNode';
  nodeId: string;
}

export interface DeleteNodeMessage {
  type: 'deleteNode';
  nodeId: string;
}

export interface AddRelationMessage {
  type: 'addRelation';
  fromId: string;
  toId?: string;
}

export interface LoadGraphMessage {
  type: 'loadGraph';
}

export interface RebuildGraphMessage {
  type: 'rebuild';
}

/** Create or update an entity */
export interface UpsertEntityMessage {
  type: 'upsertEntity';
  name: string;
  entityType: string;
}

/** Add observation to an entity */
export interface AddObservationMessage {
  type: 'addObservation';
  entity: string;
  text: string;
}

/** Link two entities */
export interface LinkEntitiesMessage {
  type: 'linkEntities';
  from: string;
  to: string;
  relationType: string;
}

/** Duplicate an entity */
export interface DuplicateEntityMessage {
  type: 'duplicateEntity';
  entityId: string;
  newName: string;
}

// Request types - prompt user via native VSCode dialogs
export interface RequestCreateEntityMessage {
  type: 'requestCreateEntity';
}

export interface RequestAddObservationMessage {
  type: 'requestAddObservation';
  entity?: string;
}

export interface RequestLinkEntitiesMessage {
  type: 'requestLinkEntities';
  from?: string;
}

export interface RequestDuplicateEntityMessage {
  type: 'requestDuplicateEntity';
  entityId: string;
}

export interface RequestDeleteEntityMessage {
  type: 'requestDeleteEntity';
  entityId: string;
}

export interface RequestRenameEntityMessage {
  type: 'requestRenameEntity';
  entityId: string;
}

export interface ShowErrorMessage {
  type: 'showError';
  message: string;
}

export type WebviewMessage =
  | SearchMessage
  | NodeSelectedMessage
  | ExpandNodeMessage
  | DeleteNodeMessage
  | AddRelationMessage
  | LoadGraphMessage
  | RebuildGraphMessage
  | UpsertEntityMessage
  | AddObservationMessage
  | LinkEntitiesMessage
  | DuplicateEntityMessage
  | RequestCreateEntityMessage
  | RequestAddObservationMessage
  | RequestLinkEntitiesMessage
  | RequestDuplicateEntityMessage
  | RequestDeleteEntityMessage
  | RequestRenameEntityMessage
  | ShowErrorMessage;

export type ExtensionMessage = GraphDataMessage;
