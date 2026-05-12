export type SpotCommentRow = {
  id: string;
  text: string;
  createdAt: string;
  /** 1–5 ; `null` pour les anciennes notes sans note */
  rating: number | null;
};
