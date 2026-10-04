import { useId } from 'react'

/** Smute's mark. Inline so it renders instantly; the gradient id is unique per instance. */
export function SmuteLogo({ className = '' }: { className?: string }) {
  const gradient = `smute-logo-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 105 89" className={className} fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M102.796 88.3513C103.783 88.3499 104.526 87.4558 104.318 86.491C98.0935 57.6459 76.1361 22.7942 53.1895 0.51442C52.5869 -0.0707023 51.6385 -0.0693107 51.0376 0.517578C28.1566 22.8646 6.30146 57.7806 0.161599 86.6439C-0.0437485 87.6092 0.702022 88.5011 1.68895 88.4997L52.2426 88.4255L102.796 88.3513Z"
        fill={`url(#${gradient})`}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M52.4693 13.3348C52.341 13.2117 52.1305 13.3051 52.1308 13.4829C52.1305 13.3051 51.9197 13.2123 51.7918 13.3358C34.4328 30.1032 17.7616 56.6788 13.2673 78.4975C13.1649 78.9946 13.5488 79.4513 14.0563 79.4505L52.2275 79.3945L90.3986 79.3385C90.9062 79.3377 91.2887 78.88 91.1849 78.3831C86.6266 56.5777 69.8774 30.0512 52.4693 13.3348Z"
        fill="#070526"
      />
      <path d="M52.1736 17.7692C52.1733 17.5915 51.9626 17.4988 51.8347 17.6223C36.7418 32.1959 22.2544 55.2464 18.3005 74.2073C18.1969 74.7043 18.5807 75.1618 19.0884 75.161L52.2577 75.1123L52.1736 17.7692Z" fill="#070526" />
      <path d="M52.1736 17.7703C52.1733 17.5924 52.3841 17.4992 52.5122 17.6226C67.5976 32.1521 82.104 55.1595 86.1001 74.1083C86.2049 74.6048 85.8224 75.0631 85.315 75.0638L52.2577 75.1123L52.1736 17.7703Z" fill="#FFF9EC" />
      <defs>
        <linearGradient id={gradient} x1="111.02" y1="44.1646" x2="-62.0153" y2="44.4185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF623D" />
          <stop offset="1" stopColor="#664AFE" />
        </linearGradient>
      </defs>
    </svg>
  )
}
