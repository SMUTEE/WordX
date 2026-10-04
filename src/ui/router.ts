import { useEffect, useState } from 'react'

/** The places in the app. Everything else is a sheet on top of them. */
export type Route = { name: 'home' } | { name: 'play' } | { name: 'journey' } | { name: 'level'; n: number } | { name: 'room'; code: string } | { name: 'admin' }

export function parseRoute(pathname: string): Route {
  const room = /^\/room\/([A-Za-z0-9]{4,12})\/?$/.exec(pathname)
  if (room) return { name: 'room', code: room[1].toUpperCase() }
  if (/^\/play\/?$/.test(pathname)) return { name: 'play' }
  if (/^\/journey\/?$/.test(pathname)) return { name: 'journey' }
  const level = /^\/journey\/(\d{1,3})\/?$/.exec(pathname)
  if (level) return { name: 'level', n: Number(level[1]) }
  if (/^\/admin\/?$/.test(pathname)) return { name: 'admin' }
  return { name: 'home' }
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname))
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return route
}
