export type Prompt = {
  id: string;
  title: string;
  description: string;
  body: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  pinOrder: number | null;
  copyCount: number;
  lastCopiedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PromptInput = Pick<
  Prompt,
  | "title"
  | "description"
  | "body"
  | "categoryId"
  | "tags"
  | "isFavorite"
  | "isPinned"
>;

export type PromptView = "all" | "recent" | "favorite" | "pinned";
export type PromptTab = "all" | "favorite" | "template";
export type PromptSort = "recent" | "popular" | "name";

export type PromptQuery = {
  search?: string;
  view?: PromptView;
  tab?: PromptTab;
  categoryId?: string;
  tag?: string;
  favoriteOnly?: boolean;
  pinnedOnly?: boolean;
  recentOnly?: boolean;
  templateOnly?: boolean;
  sort?: PromptSort;
  limit?: number;
  offset?: number;
};

export type PromptPage = { items: Prompt[]; total: number };

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  promptCount: number;
};

export type DashboardStats = {
  total: number;
  todayCopies: number;
  recent?: number;
  favorites: number;
  pinned: number;
  templates: number;
};

export type CopyStats = { copyCount: number; lastCopiedAt: number };

export type AppErrorPayload = {
  code: string;
  message: string;
  detail?: string;
};
