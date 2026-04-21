import Divider from '@mui/material/Divider'
import type { Dayjs } from 'dayjs'
import { motion, type Variants } from 'motion/react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { HashNavigation, Keyboard, Mousewheel } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { SectionEntrance, type SectionContentPhase } from './SectionEntrance'
import { WeddingCountdown } from './WeddingCountdown'

const WeddingRsvpStepper = lazy(() => import('./WeddingRsvpStepper'))
import type { WeddingPhase } from '../wedding'
import { WEDDING_DETAILS_CHIPS } from '../wedding-details-chips'
import { WEDDING_PROGRAM } from '../wedding-program'
import { setNestedScrollTouchGuardContext } from '../rsvp-swiper-touch-guard'
import {
  WEDDING_RSVP_SECTION_INDEX,
  WEDDING_SECTION_IDS,
  weddingSectionIndexFromHash,
} from '../wedding-sections'

const SI = {
  hero: 0,
  details: 1,
  story: 2,
  program: 3,
  rsvp: WEDDING_RSVP_SECTION_INDEX,
} as const

const programList: Variants = {
  hidden: {
    transition: { staggerChildren: 0.04, staggerDirection: -1 },
  },
  show: {
    transition: { staggerChildren: 0.065 },
  },
}

const programItem: Variants = {
  hidden: { opacity: 0, x: -14, skewX: -2, transition: { duration: 0.12 } },
  show: {
    opacity: 1,
    x: 0,
    skewX: 0,
    transition: { type: 'spring', stiffness: 140, damping: 22 },
  },
}

const HERO_LEAD_BEFORE =
  'Одна вечеринка, два сердца и бесконечность маленьких моментов — приходите разделить с нами этот день.'

/** По предложениям: у `SectionEntrance` stagger идёт по детям — один абзац = одна анимация; так получаем каскад по частям текста. */
const STORY_BODY_SENTENCES = [
  'Мы оба сидим за компами на том самом месте, которое в разговорах зовётся Фертоник (в пропуске там честно написано «Фертоинг», но это не мешает нам называть всё по-своему).',
  'Михаил — инженер-конструктор: чертит, считает, иногда ругается на допуски.',
  'Анастасия ведёт документацию в Excel для совершенно других задач — ни одной общей строки в таблицах с его чертежами.',
  'Познакомились мы не по служебке: она случайно кинула ему в корпоративный чат не тот файл — не спецификацию, а «версию 12_финал_точно_финал.xlsx».',
  'Он открыл, увидел цветные ячейки вместо фланцев и написал: «Это узел или сводная?»',
  'Так началась любовь, которую не смёржить без конфликтов — зато с автосохранением.',
] as const

type Props = {
  now: Dayjs
  weddingPhase: WeddingPhase
  onSwiper: (swiper: SwiperType) => void
  onActiveIndexChange: (index: number) => void
}

const SECTION_COUNT = WEDDING_SECTION_IDS.length

/** Длительность каскада входа до фазы `shown` после старта `enterUp`. */
const SLIDE_CONTENT_ENTRANCE_ANIM_MS = 900

/** Доля высоты вьюпорта: при видимой полосе ≥ этого порога — старт анимации входа контента. */
const SLIDE_CONTENT_ENTER_VIEWPORT_FRACTION = 0.4

const VIEWPORT_ENTER_EPS_PX = 0.5

/** Видимая высота пересечения секции с вьюпортом ≥ `fraction * vh` (с допуском). */
function sectionPassesViewportHeightFraction(
  entry: IntersectionObserverEntry,
  fraction: number,
): boolean {
  const vh = window.visualViewport?.height ?? window.innerHeight
  if (vh <= 0) return entry.isIntersecting && entry.intersectionRatio >= fraction
  return entry.intersectionRect.height >= vh * fraction - VIEWPORT_ENTER_EPS_PX
}

/** Внешняя рамка слайда: без скролла — скролл только во внутреннем блоке (как у «Ответ») + nested touch-guard. */
const slideFrame =
  'relative box-border flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden'

/** Внутренний скролл — те же правила, что у `.wedding-rsvp-scroll` (touch-guard, wheel debounce). */
const slideNestedScroll =
  'wedding-slide-nested-scroll wedding-rsvp-scroll mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]'

const slideNestedScrollPadDefault = `${slideNestedScroll} touch-pan-y px-5 pt-16 pb-0`

const slideNestedScrollPadRsvp = `${slideNestedScroll} touch-pan-y max-w-2xl px-4 pt-4 sm:px-5 sm:pt-8 md:pt-12 pb-0`

/** Обёртка под контент: по центру по вертикали, если помещается; иначе растёт внутри скролла. */
const slideContentCenter = 'my-auto w-full min-w-0 shrink-0'

/** Вертикальный Swiper: колесо / свайп по целым секциям; hash в URL */
export function WeddingPageSections({
  now,
  weddingPhase,
  onSwiper,
  onActiveIndexChange,
}: Props) {
  const initialSlide = useMemo(() => weddingSectionIndexFromHash(), [])
  const [phaseBySlide, setPhaseBySlide] = useState<SectionContentPhase[]>(() =>
    Array.from({ length: SECTION_COUNT }, (_, i) =>
      i === initialSlide ? 'enterWait' : 'hidden',
    ),
  )
  const entranceTimersRef = useRef<{
    enterToShown: ReturnType<typeof setTimeout> | null
  }>({ enterToShown: null })
  const leaveIndexRef = useRef<number | null>(null)

  const swiperRef = useRef<SwiperType | null>(null)
  const scrollElsRef = useRef<(HTMLElement | null)[]>(
    Array.from({ length: SECTION_COUNT }, () => null),
  )
  const hitElsRef = useRef<(HTMLElement | null)[]>(
    Array.from({ length: SECTION_COUNT }, () => null),
  )

  const clearEnterToShownTimer = useCallback(() => {
    const t = entranceTimersRef.current.enterToShown
    if (t) clearTimeout(t)
    entranceTimersRef.current.enterToShown = null
  }, [])

  const beginEnterUpForIndex = useCallback(
    (targetIndex: number) => {
      clearEnterToShownTimer()
      setPhaseBySlide((prev) => {
        if (prev[targetIndex] !== 'enterWait') return prev
        const n = [...prev]
        n[targetIndex] = 'enterUp'
        return n
      })
      entranceTimersRef.current.enterToShown = setTimeout(() => {
        entranceTimersRef.current.enterToShown = null
        setPhaseBySlide((prev) => {
          const n = [...prev]
          if (n[targetIndex] === 'enterUp') n[targetIndex] = 'shown'
          return n
        })
      }, SLIDE_CONTENT_ENTRANCE_ANIM_MS)
    },
    [clearEnterToShownTimer],
  )

  const enterWaitIndex = useMemo(
    () => phaseBySlide.findIndex((p) => p === 'enterWait'),
    [phaseBySlide],
  )

  /**
   * Сброс внутреннего скролла секции до отрисовки входа — иначе поздний сброс на transitionEnd
   * даёт рывок поверх анимации контента.
   */
  useLayoutEffect(() => {
    if (enterWaitIndex < 0) return
    const el = scrollElsRef.current[enterWaitIndex]
    if (el) el.scrollTop = 0
  }, [enterWaitIndex])

  /** Старт входа, когда в новой секции видно ≥ ~40% высоты вьюпорта — параллельно докрутке Swiper. */
  useLayoutEffect(() => {
    if (enterWaitIndex < 0) return

    let cancelled = false
    let obs: IntersectionObserver | null = null
    let rafCheck = 0
    let rafRetry = 0

    const idx = enterWaitIndex

    let gate = false
    const run = () => {
      if (cancelled || gate) return
      gate = true
      beginEnterUpForIndex(idx)
    }

    const attach = (el: HTMLElement) => {
      obs = new IntersectionObserver(
        (entries) => {
          const e = entries[0]
          if (
            e &&
            sectionPassesViewportHeightFraction(
              e,
              SLIDE_CONTENT_ENTER_VIEWPORT_FRACTION,
            )
          )
            run()
        },
        {
          root: null,
          threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        },
      )
      obs.observe(el)

      rafCheck = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const vh = window.visualViewport?.height ?? window.innerHeight
        const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0)
        if (
          visible >=
          vh * SLIDE_CONTENT_ENTER_VIEWPORT_FRACTION - VIEWPORT_ENTER_EPS_PX
        )
          run()
      })
    }

    let attempts = 0
    const resolveAndAttach = () => {
      if (cancelled) return
      const el = hitElsRef.current[idx]
      if (el) {
        attach(el)
        return
      }
      attempts += 1
      if (attempts > 32) return
      rafRetry = requestAnimationFrame(resolveAndAttach)
    }
    resolveAndAttach()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafCheck)
      cancelAnimationFrame(rafRetry)
      obs?.disconnect()
    }
  }, [enterWaitIndex, beginEnterUpForIndex])

  useEffect(
    () => () => {
      clearEnterToShownTimer()
    },
    [clearEnterToShownTimer],
  )

  const syncNestedTouchGuard = useCallback(() => {
    setNestedScrollTouchGuardContext({
      swiper: swiperRef.current,
      scrollEls: scrollElsRef.current,
      hitEls: hitElsRef.current,
    })
  }, [])

  /** Стабильные callback-ref по индексу — иначе при каждом ререндере ref(null)/ref(el) и IO сбрасывает «видимость». */
  const hitRefSlots = useMemo(
    () =>
      Array.from({ length: SECTION_COUNT }, (_, index) => (el: HTMLElement | null) => {
        hitElsRef.current[index] = el
        syncNestedTouchGuard()
      }),
    [syncNestedTouchGuard],
  )
  const scrollRefSlots = useMemo(
    () =>
      Array.from({ length: SECTION_COUNT }, (_, index) => (el: HTMLElement | null) => {
        scrollElsRef.current[index] = el
        syncNestedTouchGuard()
      }),
    [syncNestedTouchGuard],
  )

  useEffect(
    () =>
      () =>
        setNestedScrollTouchGuardContext({
          swiper: null,
          scrollEls: Array.from({ length: SECTION_COUNT }, () => null),
          hitEls: Array.from({ length: SECTION_COUNT }, () => null),
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
        syncNestedTouchGuard()
        onSwiper(s)
      }}
      onSlideChange={(s) => onActiveIndexChange(s.activeIndex)}
      onSlideChangeTransitionStart={(s) => {
        const from = s.previousIndex
        const to = s.activeIndex
        if (from === to) return

        const scrollEl = scrollElsRef.current[to]
        if (scrollEl) scrollEl.scrollTop = 0

        leaveIndexRef.current = from
        clearEnterToShownTimer()
        setPhaseBySlide((prev) => {
          const n = [...prev]
          /** Уход вниз только при реальной смене слайда (from≠to) и только если контент этой секции был видим */
          const hadVisibleContent =
            prev[from] === 'shown' ||
            prev[from] === 'enterUp' ||
            prev[from] === 'enterWait'
          n[from] = hadVisibleContent ? 'exitDown' : 'hidden'
          n[to] = 'enterWait'
          for (let i = 0; i < SECTION_COUNT; i++) {
            if (i !== from && i !== to) n[i] = 'hidden'
          }
          return n
        })
      }}
      onSlideChangeTransitionEnd={(s) => {
        const active = s.activeIndex
        const left = leaveIndexRef.current
        if (left !== null && left !== active) {
          setPhaseBySlide((prev) => {
            const n = [...prev]
            n[left] = 'hidden'
            return n
          })
        }
        leaveIndexRef.current = null
      }}
    >
      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="hero"
      >
        <section ref={hitRefSlots[SI.hero]} id="hero"
          className={`${slideFrame} bg-linear-to-br from-(--bg) via-violet-50/40 to-rose-50/30 dark:via-violet-950/20 dark:to-stone-950/30`}
          aria-label="Главная"
        >
          <div
            ref={scrollRefSlots[SI.hero]}
            className={slideNestedScrollPadDefault}
          >
            <div className={slideContentCenter}>
            <SectionEntrance
              phase={phaseBySlide[SI.hero]}
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
            </div>
            <div className="wedding-rsvp-bottom-spacer" aria-hidden />
          </div>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="details"
      >
        <section ref={hitRefSlots[SI.details]} id="details"
          className={`${slideFrame} bg-(--bg)`}
          aria-label="Детали"
        >
          <div
            ref={scrollRefSlots[SI.details]}
            className={slideNestedScrollPadDefault}
          >
            <div className={slideContentCenter}>
            <SectionEntrance
              phase={phaseBySlide[SI.details]}
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
                  Четверг · сбор гостей в 14:00
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
                <div className="mb-3 text-sm leading-normal text-(--text) md:text-base">
                <p>
                  <a 
                    href="https://yandex.ru/maps/213/moscow/?text=Набережная+реки+Фонтанки,+59"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline cursor-pointer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    Набережная реки Фонтанки, 59
                  </a>
                </p>
                <p className="mt-1">Пространство «Высота»</p>
                </div>
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
            </div>
            <div className="wedding-rsvp-bottom-spacer" aria-hidden />
          </div>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="story"
      >
        <section ref={hitRefSlots[SI.story]} id="story"
          className={`${slideFrame} bg-linear-to-b from-(--bg) to-(--code-bg)/50 dark:to-zinc-900/40`}
          aria-label="История"
        >
          <div
            ref={scrollRefSlots[SI.story]}
            className={slideNestedScrollPadDefault}
          >
            <div className={slideContentCenter}>
            <SectionEntrance
              phase={phaseBySlide[SI.story]}
              className="mx-auto max-w-2xl text-left"
            >
            <blockquote className="text-center font-handwriting text-2xl font-normal leading-snug text-(--text-h) md:text-3xl md:leading-relaxed">
              «Фертоник: не завод, а повод.»
            </blockquote>
            {STORY_BODY_SENTENCES.map((sentence, i) => (
              <p
                key={i}
                className={`text-pretty text-sm leading-relaxed text-(--text) md:text-base ${i === 0 ? 'mt-8 md:mt-10' : 'mt-3'}`}
              >
                {sentence}
              </p>
            ))}
          </SectionEntrance>
            </div>
            <div className="wedding-rsvp-bottom-spacer" aria-hidden />
          </div>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="program"
      >
        <section ref={hitRefSlots[SI.program]} id="program"
          className={`${slideFrame} bg-(--bg)`}
          aria-label="Программа"
        >
          <div
            ref={scrollRefSlots[SI.program]}
            className={slideNestedScrollPadDefault}
          >
            <div className={slideContentCenter}>
            <SectionEntrance
              phase={phaseBySlide[SI.program]}
              className="mx-auto w-full max-w-lg"
            >
            <h2 className="mb-8 text-center font-(family-name:--sans) text-xs font-medium uppercase tracking-[0.35em] text-(--accent) sm:mb-12 sm:text-sm">
              Как пройдёт день
            </h2>
            <motion.ol
              className="relative space-y-0 border-s border-(--border) ps-6 sm:ps-8"
              initial={false}
              animate={
                phaseBySlide[SI.program] === 'enterUp' ||
                phaseBySlide[SI.program] === 'shown'
                  ? 'show'
                  : 'hidden'
              }
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
                  {item.address && (
                    <p className="mt-1 text-gray-500">
                      <a 
                        href={`https://yandex.ru/maps/?text=${encodeURIComponent(item.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        className="hover:underline cursor-pointer"
                        onClick={(e) => {
                          const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || navigator.vendor);
                          
                          if (isMobile) {
                            e.preventDefault();
                            // Кодируем адрес для поиска в приложении
                            const encodedAddress = item.address ? encodeURIComponent(item.address) : '';
                            // Открываем приложение с поиском по адресу
                            window.location.href = `yandexmaps://search?text=${encodedAddress}`;
                            
                            // Если приложение не открылось через 1 секунду — открываем сайт
                            setTimeout(() => {
                              window.location.href = `https://yandex.ru/maps/?text=${encodedAddress}`;
                            }, 1000);
                          }
                        }}
                      >
                        {item.address}
                      </a>
                    </p>
                  )}
                </motion.li>
              ))}
            </motion.ol>
          </SectionEntrance>
            </div>
            <div className="wedding-rsvp-bottom-spacer" aria-hidden />
          </div>
        </section>
      </SwiperSlide>

      <SwiperSlide
        className="flex! h-full min-h-0 flex-col"
        data-hash="rsvp"
      >
        <section ref={hitRefSlots[SI.rsvp]} id="rsvp"
          className={`${slideFrame} bg-linear-to-t from-violet-50/50 to-(--bg) dark:from-violet-950/30`}
          aria-label="Ответ"
        >
          <div
            ref={scrollRefSlots[SI.rsvp]}
            className={slideNestedScrollPadRsvp}
          >
            <div className="w-full min-h-0 shrink-0">
              <SectionEntrance
                phase={phaseBySlide[SI.rsvp]}
                className="mx-auto w-full max-w-2xl min-h-0"
              >
                <h2 className="mb-4 text-center font-(family-name: Pattaya) text-[1.6875rem] font-medium tracking-tight text-(--text-h) sm:mb-6 sm:text-4xl sm:tracking-normal md:text-5xl">
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
