import { useEffect } from 'react'

/** Game screens lock the page and scroll themselves; this page scrolls like a normal web page. */
export function usePageScroll() {
  useEffect(() => {
    document.documentElement.classList.add('page-scroll')
    return () => document.documentElement.classList.remove('page-scroll')
  }, [])
}
