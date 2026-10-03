export default function PageBreadcrumb({ items = [] }) {
  const visibleItems = items.filter(Boolean)
  if (!visibleItems.length) return null

  return (
    <nav className="page-breadcrumb" aria-label="Lokasi halaman">
      {visibleItems.map((item, index) => {
        const last = index === visibleItems.length - 1
        return (
          <span key={String(item) + '-' + index} className={last ? 'page-breadcrumb-current' : 'page-breadcrumb-item'}>
            {item}
            {!last && <span className="page-breadcrumb-separator" aria-hidden="true">›</span>}
          </span>
        )
      })}
    </nav>
  )
}
