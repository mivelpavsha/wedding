import { useRef, useState } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { ThemeFab } from './components/ThemeFab'
import { WeddingConfetti } from './components/WeddingConfetti'
import {
  type WeddingReplayState,
  WeddingPageSections,
} from './components/WeddingPageSections'
import { useBottomNavPill } from './hooks/use-bottom-nav-pill'
import { useNowEverySecond } from './hooks/use-now-every-second'
import { useSectionReplay } from './hooks/use-section-replay'
import { getWeddingPhase } from './wedding'
import { weddingSectionIndexFromHash } from './wedding-sections'

// Test for CI

const NAV = [
  { href: '#hero', label: 'Главная' },
  { href: '#details', label: 'Детали' },
  { href: '#story', label: 'История' },
  { href: '#program', label: 'Программа' },
  { href: '#rsvp', label: 'Ответ' },
] as const

export default function App() {
  const replay = useSectionReplay()
  const now = useNowEverySecond()
  const weddingPhase = getWeddingPhase(now)
  const swiperRef = useRef<SwiperType | null>(null)
  const bottomNavRef = useRef<HTMLElement | null>(null)
  const bottomNavLinkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(() =>
    weddingSectionIndexFromHash(),
  )
  const navPill = useBottomNavPill(activeIndex, bottomNavRef, bottomNavLinkRefs)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <WeddingConfetti now={now} />
      <ThemeFab />
      <main
        id="main-content"
        className="flex min-h-0 w-full flex-1 flex-col"
        aria-label="Содержание приглашения"
      >
        <WeddingPageSections
          replay={replay as WeddingReplayState}
          now={now}
          weddingPhase={weddingPhase}
          onSwiper={(swiper) => {
            swiperRef.current = swiper
          }}
          onActiveIndexChange={setActiveIndex}
        />
      </main>

      <nav
        ref={bottomNavRef}
        id="wedding-bottom-nav"
        className="fixed bottom-4 left-1/2 z-100 flex max-w-[min(100vw-1.5rem,42rem)] -translate-x-1/2 gap-1 rounded-full border border-[color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color-mix(in_srgb,var(--bg)_58%,transparent)] px-1.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150 dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] dark:bg-[color-mix(in_srgb,var(--bg)_42%,transparent)] supports-backdrop-filter:bg-[color-mix(in_srgb,var(--bg)_38%,transparent)] dark:supports-backdrop-filter:bg-[color-mix(in_srgb,var(--bg)_32%,transparent)]"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        aria-label="Навигация по разделам"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-full bg-(--accent-bg) shadow-[0_0_0_1px_var(--accent-border)] transition-[left,top,width,height] duration-300 ease-[cubic-bezier(0.645,0.045,0.355,1)] will-change-[left,width]"
          style={{
            left: navPill.left,
            top: navPill.top,
            width: navPill.width,
            height: navPill.height,
            opacity: navPill.width > 0 ? 1 : 0,
          }}
        />
        {NAV.map(({ href, label }, i) => (
          <a
            key={href}
            ref={(el) => {
              bottomNavLinkRefs.current[i] = el
            }}
            href={href}
            aria-current={activeIndex === i ? 'location' : undefined}
            className={`wedding-nav-link relative z-10 whitespace-nowrap rounded-full px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:px-4 sm:text-xs ${
              activeIndex === i
                ? 'text-(--text-h)'
                : 'text-(--text) hover:bg-(--social-bg) hover:text-(--text-h)'
            }`}
            onClick={(e) => {
              e.preventDefault()
              swiperRef.current?.slideTo(i)
            }}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}
