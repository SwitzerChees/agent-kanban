export interface ShowroomView { path: string; title: string; category: string; hash: string; size: number }
export interface ShowroomLibrary {
  project: { id: string; name: string; key: string };
  snapshotId: string; categories: string[]; views: ShowroomView[];
  previewToken: string; canComment: boolean; shareName?: string; warnings: string[];
}
export interface ShowroomAnchor {
  kind: 'element' | 'region'; selector?: string; tag?: string; text?: string;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
}
export interface ShowroomFeedback {
  id: string; projectId: string; snapshotId: string; viewPath: string; viewHash: string;
  authorName: string; body: string; anchor: ShowroomAnchor | null;
  status: 'open' | 'in_progress' | 'resolved'; createdAt: string;
  shareName: string | null; taskId: string | null; taskKey: string | null;
}
export interface ShowroomShare {
  id: string; name: string; category: string | null; canComment: boolean;
  createdAt: string; expiresAt: string | null; revokedAt: string | null;
}
export interface ShowroomIteration {
  id: string; sourcePath: string | null; targetPath: string; taskId: string | null;
  taskKey: string | null; taskStatus: string | null; createdAt: string;
}
