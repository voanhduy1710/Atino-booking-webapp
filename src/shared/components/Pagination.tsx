interface PaginationProps {
  currentPage: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, pageSize, totalItems, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems <= pageSize) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <div className="flex items-center justify-between border-t border-[#ecdbe8] bg-white px-4 py-3 text-sm text-[#514253]">
      <span>{start}-{end} / {totalItems}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="pagination-button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Trang trước"
        >
          ‹
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={`pagination-button ${page === currentPage ? 'pagination-button-active' : ''}`}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className="pagination-button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Trang sau"
        >
          ›
        </button>
      </div>
    </div>
  )
}
