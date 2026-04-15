import Divider from '@mui/material/Divider'
import type { Dayjs } from 'dayjs'
import { motion, type Variants } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { HashNavigation, Keyboard, Mousewheel } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { SectionEntrance } from './SectionEntrance'
import { WeddingCountdown } from './WeddingCountdown'

const WeddingRsvpStepper = lazy(() => import('./WeddingRsvpStepper'))
import type { WeddingPhase } from '../wedding'
import { WEDDING_DETAILS_CHIPS } from '../wedding-details-chips'
import { WEDDING_PROGRAM } from '../wedding-program'
import { setRsvpTouchGuardContext } from '../rsvp-swiper-touch-guard'
import { weddingSectionIndexFromHash } from '../wedding-sections'

const programList: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
}

const programItem: Variants = {
  hidden: { opacity: 0, x: -20, skewX: -2 },
  show: {
    opacity: 1,
    x: 0,
    skewX: 0,
    transition: { type: 'spring', stiffness: 140, damping: 22 },
  },
}

const HERO_LEAD_BEFORE =
  'Одна вечеринка, два сердца и бесконечность маленьких моментов — приходите разделить с нами этот день.'

export type WeddingReplayState = {
  hero: number
  details: number
  story: number
  program: number
  rsvp: number
}

type Props = {
  replay: WeddingReplayState
  now: Dayjs
  weddingPhase: WeddingPhase
  onSwiper: (swiper: SwiperType) => void
  onActiveIndexChange: (index: number) => void
}

/** Нижний запас под fixed nav + холм на мобилке: `pb-wedding-nav` → `--wedding-nav-clearance` в index.css */
/** `overscroll-y-contain` — иначе на мобилке жест «назад» по вертикали уходит в pull-to-refresh браузера */
const slideShell =
  'box-border flex min-h-0 w-full flex-1 flex-col justify-center overflow-y-auto overscroll-y-contain px-5 pt-16 pb-wedding-nav'

/** Первая секция: без contain, чтобы на главной работал нативный pull-to-refresh */
const slideShellHero =
  'box-border flex min-h-0 w-full flex-1 flex-col justify-center overflow-y-auto overscroll-y-auto px-5 pt-16 pb-wedding-nav'

/** Вертикальный Swiper: колесо / свайп по целым секциям; hash в URL */
export function WeddingPageSections({
  replay,
  now,
  weddingPhase,
  onSwiper,
  onActiveIndexChange,
}: Props) {
  const initialSlide = useMemo(() => weddingSectionIndexFromHash(), [])
  const swiperRef = useRef<SwiperType | null>(null)
  const rsvpScrollRef = useRef<HTMLDivElement | null>(null)
  const rsvpHitAreaRef = useRef<HTMLElement | null>(null)

  const syncRsvpTouchGuard = useCallback(() => {
    setRsvpTouchGuardContext({
      swiper: swiperRef.current,
      scrollEl: rsvpScrollRef.current,
      hitAreaEl: rsvpHitAreaRef.current,
    })
  }, [])

  useEffect(
    () =>
      () =>
        setRsvpTouchGuardContext({
          swiper: null,
          scrollEl: null,
          hitAreaEl: null,
        }),
    [],
  )

  return (
    <Swiper
      className="wedding-swiper h-full min-h-0 w-full flex-1"
      modules={[Mousewheel, Keyboard, HashNavigation]}
      direction="vertical"
      slidesPerView={1}
      speed={650}
      initialSlide={initialSlide}
      nested
      threshold={40}
      touchReleaseOnEdges
      mousewheel={{
        forceToAxis: true,
        sensitivity: 0.85,
        releaseOnEdges: true,
        thresholdDelta: 20,
      }}
      keyboard={{ enabled: true, onlyInViewport: true }}
      hashNavigation={{ watchState: true, replaceState: true }}
      onSwiper={(s) => {
        swiperRef.current = s
        syncRsvpTouchGuard()
        onSwiper(s)
      }}
      onSlideChange={(s) => onActiveIndexChange(s.activeIndex)}
    >
      <SwiperSlide
        className="flex! min-h-0 flex-col"
        data-hash="hero"
      >
        <section
          id="hero"
          className={`relative flex min-h-0 flex-col justify-center bg-linear-to-br from-(--bg) via-violet-50/40 to-rose-50/30 ${slideShellHero} dark:via-violet-950/20 dark:to-stone-950/30`}
          aria-label="Главная"
        >
          <SectionEntrance
            replayVersion={replay.hero}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
          >
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.35em] text-(--accent)">
              Свадьба
            </p>
            <h1
              className={`w-full max-w-full text-balance bg-linear-to-br from-(--text-h) to-(--text) bg-clip-text px-1 font-pattaya text-4xl font-normal leading-[1.08] tracking-tight text-transparent sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl ${weddingPhase === 'before' ? 'mb-2' : 'mb-8'}`}
            >
              Михаил<span className="mx-1.5 text-(--text) sm:mx-2.5">&</span>Анастасия
            </h1>
            {weddingPhase === 'before' && (
              <p className="mb-6 max-w-md text-pretty text-base leading-relaxed text-(--text) md:text-lg">
                {HERO_LEAD_BEFORE}
              </p>
            )}
            <div className="mb-10 h-px w-24 rounded-full bg-linear-to-r from-transparent via-(--accent) to-transparent opacity-80" />
            <div className="mb-10 w-full max-w-xl">
              <WeddingCountdown now={now} />
            </div>
          </SectionEntrance>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! min-h-0 flex-col"
        data-hash="details"
      >
        <section
          id="details"
          className={`relative flex min-h-0 flex-col justify-center border-t border-(--border) bg-(--bg) ${slideShell}`}
          aria-label="Детали"
        >
          <SectionEntrance
            replayVersion={replay.details}
            className="mx-auto w-full max-w-4xl"
          >
            <div className="grid w-full gap-10 md:grid-cols-2 md:gap-14">
              <div className="text-left">
                <h2 className="mb-3 font-(family-name:--sans) text-xs font-medium uppercase tracking-[0.35em] text-(--accent)">
                  Когда
                </h2>
                <p className="text-3xl font-light tracking-tight text-(--text-h) md:text-4xl">
                  09 июля 2026
                </p>
                <p className="mt-2 text-(--text)">
                  Четверг · сбор гостей в 15:00
                </p>
              </div>
              <div className="text-left md:border-l md:border-(--border) md:pl-14">
                <h2 className="mb-3 font-(family-name:--sans) text-xs font-medium uppercase tracking-[0.35em] text-(--accent)">
                  Где
                </h2>
                <p className="text-xl font-light text-(--text-h) md:text-2xl">
                  БЦ «Лениздат»
                </p>
                <div className="mb-3 text-sm leading-normal text-(--text) md:text-base">
                  <p>Набережная реки Фонтанки, 59</p>
                  <p className="mt-1">Пространство «Высота»</p>
                </div>
                <p className="text-sm leading-tight text-(--text) md:text-base">
                  Мы будем ждать вас там,<br />
                  где Фонтанка отражает небо,<br />
                  а история встречается с высотой.
                </p>
              </div>
            </div>
            <ul
              className="mx-auto mt-16 flex w-full max-w-xl flex-wrap justify-start gap-2 text-xs text-(--text) sm:gap-3 sm:text-sm"
              role="list"
            >
              {WEDDING_DETAILS_CHIPS.map((label, i) => (
                <li
                  key={i}
                  className="max-w-[min(100%,18rem)] rounded-full border border-(--border) bg-(--social-bg) px-3 py-1.5 text-left sm:max-w-none sm:px-4 sm:py-2 sm:whitespace-nowrap"
                >
                  {label}
                </li>
              ))}
            </ul>
          </SectionEntrance>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! min-h-0 flex-col"
        data-hash="story"
      >
        <section
          id="story"
          className={`relative flex min-h-0 flex-col justify-center border-t border-(--border) bg-linear-to-b from-(--bg) to-(--code-bg)/50 ${slideShell} dark:to-zinc-900/40`}
          aria-label="История"
        >
          <SectionEntrance
            replayVersion={replay.story}
            className="mx-auto max-w-2xl text-left"
          >
            <blockquote className="text-center font-handwriting text-2xl font-normal leading-snug text-(--text-h) md:text-3xl md:leading-relaxed">
              «Фертоник: не завод, а повод.»
            </blockquote>
            <p className="mt-8 text-sm leading-relaxed text-(--text) md:mt-10 md:text-base">
              Мы оба сидим за компами на том самом месте, которое в разговорах
              зовётся Фертоник (в пропуске там честно написано «Фертоинг», но это
              не мешает нам называть всё по-своему). Михаил — инженер-конструктор:
              чертит, считает, иногда ругается на допуски. Анастасия ведёт
              документацию в Excel для совершенно других задач — ни одной общей
              строки в таблицах с его чертежами. Познакомились мы не по служебке: она
              случайно кинула ему в корпоративный чат не тот файл — не спецификацию, а
              «версию 12_финал_точно_финал.xlsx». Он открыл, увидел цветные ячейки
              вместо фланцев и написал: «Это узел или сводная?» Так началась любовь,
              которую не смёржить без конфликтов — зато с автосохранением.
            </p>
          </SectionEntrance>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! min-h-0 flex-col"
        data-hash="program"
      >
        <section
          id="program"
          className={`relative flex min-h-0 flex-col justify-center border-t border-(--border) bg-(--bg) ${slideShell}`}
          aria-label="Программа"
        >
          <SectionEntrance
            replayVersion={replay.program}
            className="mx-auto w-full max-w-lg"
          >
            <h2 className="mb-8 text-center font-(family-name:--sans) text-xs font-medium uppercase tracking-[0.35em] text-(--accent) sm:mb-12 sm:text-sm">
              Как пройдёт день
            </h2>
            <motion.ol
              key={replay.program}
              className="relative space-y-0 border-s border-(--border) ps-6 sm:ps-8"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.35, margin: '-10px' }}
              variants={programList}
            >
              {WEDDING_PROGRAM.map((item, index) => (
                <motion.li
                  key={`${item.time}-${index}`}
                  className="relative pb-5 last:pb-0 sm:pb-10"
                  variants={programItem}
                >
                  <span
                    className="absolute -inset-s-[27px] mt-1 size-2.5 rounded-full border-2 border-(--accent) bg-(--bg) sm:-inset-s-[33px] sm:mt-1.5 sm:size-3"
                    aria-hidden
                  />
                  <p className="text-xs font-medium tabular-nums text-(--accent) sm:text-sm">
                    {item.time}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] leading-snug text-(--text-h) sm:mt-1 sm:text-base sm:leading-normal">
                    {item.description}
                  </p>
                </motion.li>
              ))}
            </motion.ol>
          </SectionEntrance>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="rsvp"
      >
        <section
          ref={(el) => {
            rsvpHitAreaRef.current = el
            syncRsvpTouchGuard()
          }}
          id="rsvp"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-t border-(--border) bg-linear-to-t from-violet-50/50 to-(--bg) dark:from-violet-950/30"
          aria-label="Ответ"
        >
          <div
            ref={(el) => {
              rsvpScrollRef.current = el
              syncRsvpTouchGuard()
            }}
            className="wedding-rsvp-scroll mx-auto flex min-h-0 w-full max-w-2xl flex-1 touch-pan-y flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pt-4 sm:px-5 sm:pt-8 md:pt-12 [-webkit-overflow-scrolling:touch]"
          >
            <div className="w-full min-h-0 shrink-0">
              <SectionEntrance
                replayVersion={replay.rsvp}
                className="mx-auto w-full max-w-2xl min-h-0"
              >
                <h2 className="mb-4 text-center font-(family-name:--sans) text-[1.6875rem] font-medium tracking-tight text-(--text-h) sm:mb-6 sm:text-4xl sm:tracking-normal md:text-5xl">
                  Будем рады видеть вас
                </h2>
                <p className="mb-0 max-w-2xl text-left text-pretty leading-relaxed text-(--text)">
                  Пожалуйста, ответьте до{' '}
                  <strong className="font-medium text-(--text-h)">21 июня</strong>{' '}
                  — так мы сможем учесть каждое место за столом и меню. Аллергии и
                  особые пожелания можно указать в конце анкеты — в отдельном поле.
                </p>
                <Divider
                  sx={{
                    borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
                    my: { xs: 2, sm: 3 },
                  }}
                />
                <div className="text-left pt-1 sm:pt-2 md:pt-3">
                  <Suspense
                    fallback={
                      <div
                        className="mx-auto min-h-[220px] max-w-xl animate-pulse rounded-2xl border border-(--border) bg-(--social-bg)/60 px-6 py-14 text-center text-sm text-(--text)"
                        aria-busy
                        aria-label="Загрузка формы ответа"
                      >
                        Загрузка формы…
                      </div>
                    }
                  >
                    <WeddingRsvpStepper />
                  </Suspense>
                </div>
                <p className="mt-4 text-center text-sm text-(--text) opacity-90 sm:mt-10">
                  Контакт для вопросов:{' '}
                  <a
                    className="font-medium text-(--accent) underline decoration-(--accent-border) underline-offset-4 transition hover:opacity-80"
                    href="https://t.me/kasilov_m"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @kasilov_m
                  </a>
                </p>
              </SectionEntrance>
            </div>
            <div className="wedding-rsvp-bottom-spacer" aria-hidden />
          </div>
        </section>
      </SwiperSlide>
    </Swiper>
  )
}
