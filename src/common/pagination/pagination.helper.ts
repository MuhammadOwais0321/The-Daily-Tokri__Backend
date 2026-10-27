export interface PaginationMeta {
  total: number;
  currentPage: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function buildMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const pages = Math.ceil(total / limit) || 1;
  return {
    total,
    currentPage: page,
    limit,
    pages,
    hasNextPage: page < pages,
    hasPrevPage: page > 1,
  };
}
