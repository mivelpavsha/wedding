import IconButton from '@mui/material/IconButton'
import type { ComponentType } from 'react'
import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { buildMobileMonolithOutlinePathPx } from '../wedding-mobile-monolith-path'
import { estimateHillBoxFromViewport } from '../wedding-nav-hill-geometry'
import type { BottomNavPill } from '../hooks/use-bottom-nav-pill'
import { ThemeToggleButton } from './ThemeFab'

function estimateInitialPathD(): string {
  if (typeof window === 'undefined') return ''
  const rootPx =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const wPill = Math.min(
    window.innerWidth - 24,
    42 * rootPx,
  )
  const hill = estimateHillBoxFromViewport()
  const pillH = 44
  return buildMobileMonolithOutlinePathPx(wPill, pillH, hill.w, hill.h) ?? ''
}

export type MobileNavItem = {
  href: string
  label: string
  Icon: ComponentType<{ sx?: object }>
}

type Props = {
  nav: readonly MobileNavItem[]
  activeIndex: number
  swiperRef: RefObject<SwiperType | null>
  bottomNavRef: RefObject<HTMLElement | null>
  bottomNavLinkRefs: RefObject<(HTMLElement | null)[]>
  navPill: BottomNavPill
  pillTransitionsEnabled: boolean
  surfaceClass: string
}

export function WeddingMobileBottomNav({
  nav,
  activeIndex,
  swiperRef,
  bottomNavRef,
  bottomNavLinkRefs,
  navPill,
  pillTransitionsEnabled,
  surfaceClass,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hillMeasureRef = useRef<HTMLDivElement>(null)
  const [pathD, setPathD] = useState(estimateInitialPathD)
  const [svgBox, setSvgBox] = useState({ w: 100, h: 100 })

  useLayoutEffect(() => {
    const measure = (sync: boolean) => {
      const root = rootRef.current
      const navEl = bottomNavRef.current
      const hillEl = hillMeasureRef.current
      if (!root || !navEl || !hillEl) return

      void root.offsetWidth
      const rw = root.getBoundingClientRect()
      const nw = navEl.getBoundingClientRect()
      const hw = hillEl.getBoundingClientRect()

      const W = Math.max(1, rw.width)
      const pillH = Math.max(1, nw.height)
      const hillW = Math.max(1, hw.width)
      const hillH = Math.max(1, hw.height)

      const d = buildMobileMonolithOutlinePathPx(W, pillH, hillW, hillH)
      if (!d) return

      const Htot = hillH + pillH
      if (sync) {
        setPathD(d)
        setSvgBox({ w: W, h: Htot })
      } else {
        setPathD((prev) => (prev === d ? prev : d))
        setSvgBox({ w: W, h: Htot })
      }
    }

    measure(true)
    const ro = new ResizeObserver(() => measure(false))
    const root = rootRef.current
    const navEl = bottomNavRef.current
    const hillEl = hillMeasureRef.current
    if (root) ro.observe(root)
    if (navEl) ro.observe(navEl)
    if (hillEl) ro.observe(hillEl)
    return () => ro.disconnect()
  }, [bottomNavRef])

  return (
    <div
      ref={rootRef}
      className="relative w-max max-w-[min(100vw-1.5rem,42rem)] shrink-0"
    >
      <div
        className={`wedding-mobile-monolith-glass pointer-events-none absolute inset-0 z-0 ${surfaceClass}`}
        style={
          pathD
            ? {
                clipPath: `path('${pathD}')`,
                WebkitClipPath: `path('${pathD}')`,
              }
            : undefined
        }
        aria-hidden
      />
      {pathD ? (
        <svg
          width={svgBox.w}
          height={svgBox.h}
          className="pointer-events-none absolute top-0 left-0 z-20 block overflow-visible text-[color-mix(in_srgb,var(--border)_85%,transparent)]"
          viewBox={`0 0 ${svgBox.w} ${svgBox.h}`}
          fill="none"
          shapeRendering="geometricPrecision"
          aria-hidden
        >
          <path
            d={pathD}
            stroke="currentColor"
            strokeWidth={1}
            strokeLinecap="butt"
            strokeLinejoin="round"
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}

      <div className="relative z-10 flex flex-col items-center gap-0">
        <div className="flex justify-center">
          <div
            ref={hillMeasureRef}
            className="flex w-[min(92vw,5.25rem)] shrink-0 flex-col items-center justify-end px-1 pb-0.5 pt-1.5"
          >
            <ThemeToggleButton
              id="theme-fab-mobile"
              size="micro"
              variant="outlined"
              className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-(--text-h)"
            />
          </div>
        </div>

        <nav
          ref={bottomNavRef}
          id="wedding-bottom-nav"
          className="relative z-10 flex w-max max-w-[min(100vw-1.5rem,42rem)] gap-4 self-center rounded-none border-0 bg-transparent p-[6px] shadow-none"
          style={{
            /* Safe-area уже в `App`: `max-md:bottom-[max(1rem,var(--wedding-safe-bottom))]` — не дублировать env() здесь */
            paddingBottom: 6,
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
              transition: pillTransitionsEnabled
                ? 'left 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), top 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), width 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), height 0.3s cubic-bezier(0.645, 0.045, 0.355, 1), opacity 0.2s ease'
                : 'none',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
          {nav.map(({ href, label, Icon }, i) => (
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
      </div>
    </div>
  )
}
