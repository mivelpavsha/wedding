import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import HomeRounded from '@mui/icons-material/HomeRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import SendRounded from '@mui/icons-material/SendRounded'
import IconButton from '@mui/material/IconButton'
import { useEffect, useRef, useState } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { ThemeFab } from './components/ThemeFab'
import { WeddingConfetti } from './components/WeddingConfetti'
import { WeddingMobileBottomNav } from './components/WeddingMobileBottomNav'
import {
  type WeddingReplayState,
  WeddingPageSections,
} from './components/WeddingPageSections'
import { useBottomNavEndRadius } from './hooks/use-bottom-nav-end-radius'
import { useBottomNavPill } from './hooks/use-bottom-nav-pill'
import { useIsMaxMd } from './hooks/use-is-max-md'
import { useNowEverySecond } from './hooks/use-now-every-second'
import { useSectionReplay } from './hooks/use-section-replay'
import { getWeddingPhase } from './wedding'
import { weddingSectionIndexFromHash } from './wedding-sections'

// Test for CI

const NAV = [
  { href: '#hero', label: 'Главная', Icon: HomeRounded },
  { href: '#details', label: 'Детали', Icon: InfoOutlined },
  { href: '#story', label: 'История', Icon: AutoStoriesOutlined },
  { href: '#program', label: 'Программа', Icon: CalendarMonthOutlined },
  { href: '#rsvp', label: 'Ответ', Icon: SendRounded },
] as const

/** Полупрозрачный фон; на десктопе размытие в index.css; на мобилке — монолит `.wedding-mobile-monolith-glass` */
const BOTTOM_NAV_SURFACE =
  'bg-[color-mix(in_srgb,var(--bg)_58%,transparent)] dark:bg-[color-mix(in_srgb,var(--bg)_42%,transparent)] supports-backdrop-filter:bg-[color-mix(in_srgb,var(--bg)_38%,transparent)] dark:supports-backdrop-filter:bg-[color-mix(in_srgb,var(--bg)_32%,transparent)]'

const BOTTOM_NAV_SHADOW =
  'shadow-[0_10px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_10px_32px_rgba(0,0,0,0.42)] md:shadow-[0_8px_32px_rgba(0,0,0,0.12)] md:dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]'

export default function App() {
  const replay = useSectionReplay()
  const now = useNowEverySecond()
  const weddingPhase = getWeddingPhase(now)
  const swiperRef = useRef<SwiperType | null>(null)
  const bottomNavRef = useRef<HTMLElement | null>(null)
  const bottomNavLinkRefs = useRef<(HTMLElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(() =>
    weddingSectionIndexFromHash(),
  )
  const isMaxMd = useIsMaxMd()
  const navPill = useBottomNavPill(
    activeIndex,
    bottomNavRef,
    bottomNavLinkRefs,
    isMaxMd,
  )

  useBottomNavEndRadius(bottomNavRef, isMaxMd)

  useEffect(() => {
    const root = document.documentElement
    if (activeIndex > 0) root.classList.add('wedding-lock-vertical-overscroll')
    else root.classList.remove('wedding-lock-vertical-overscroll')
    return () => root.classList.remove('wedding-lock-vertical-overscroll')
  }, [activeIndex])

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

      <div className="fixed left-0 right-0 z-100 flex justify-center md:bottom-4 max-md:bottom-[max(1rem,var(--wedding-safe-bottom))]">
        {isMaxMd ? (
          <WeddingMobileBottomNav
            nav={NAV}
            activeIndex={activeIndex}
            swiperRef={swiperRef}
            bottomNavRef={bottomNavRef}
            bottomNavLinkRefs={bottomNavLinkRefs}
            navPill={navPill}
            surfaceClass={BOTTOM_NAV_SURFACE}
          />
        ) : (
          <nav
            ref={bottomNavRef}
            id="wedding-bottom-nav"
            className={`relative z-10 flex w-max max-w-[min(100vw-1.5rem,42rem)] gap-4 rounded-full border border-[color-mix(in_srgb,var(--border)_85%,transparent)] p-[6px] ${BOTTOM_NAV_SURFACE} ${BOTTOM_NAV_SHADOW}`}
            style={{
              paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))',
            }}
            aria-label="Навигация по разделам"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute z-0 rounded-full bg-(--accent-bg) shadow-[0_0_0_1px_var(--accent-border)] will-change-[left,top,width,height]"
              style={{
                left: navPill.left,
                top: navPill.top,
                width: navPill.width,
                height: navPill.height,
                opacity: navPill.width > 0 ? 1 : 0,
                transition:
                  'left 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), top 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), width 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), height 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), opacity 0.2s ease',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
              }}
            />
            {NAV.map(({ href, label, Icon }, i) => (
              <div
                key={href}
                ref={(el) => {
                  bottomNavLinkRefs.current[i] = el
                }}
                className="relative z-10 inline-flex items-center justify-center"
              >
                <IconButton
                  component="a"
                  href={href}
                  aria-label={label}
                  aria-current={activeIndex === i ? 'location' : undefined}
                  size="small"
                  className="wedding-nav-icon-btn"
                  sx={{
                    display: 'inline-flex',
                    '@media (min-width: 768px)': { display: 'none' },
                    padding: '8px',
                    color: 'inherit',
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    swiperRef.current?.slideTo(i)
                  }}
                >
                  <Icon sx={{ fontSize: 22 }} />
                </IconButton>
                <a
                  href={href}
                  aria-current={activeIndex === i ? 'location' : undefined}
                  className={`wedding-nav-link hidden whitespace-nowrap rounded-full px-2.5 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) md:inline-flex! md:px-3.5 md:py-2 md:text-xs ${
                    activeIndex === i
                      ? 'text-(--text-h)'
                      : 'text-(--text)'
                  }`}
                  onClick={(e) => {
                    e.preventDefault()
                    swiperRef.current?.slideTo(i)
                  }}
                >
                  {label}
                </a>
              </div>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
