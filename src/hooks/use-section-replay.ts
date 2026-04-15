import { useCallback, useState } from 'react'
import {
  WEDDING_SECTION_IDS,
  type WeddingSectionId,
} from '../wedding-sections'

export type WeddingReplayState = Record<WeddingSectionId, number>

/** Увеличивает счётчик секции при уходе со слайда — ключи для motion и повторного входа. */
export function useSectionReplay() {
  const [version, setVersion] = useState<WeddingReplayState>(() =>
    Object.fromEntries(WEDDING_SECTION_IDS.map((id) => [id, 0])) as WeddingReplayState,
  )

  const bumpSlideOnLeave = useCallback((slideIndex: number) => {
    const id = WEDDING_SECTION_IDS[slideIndex]
    if (!id) return
    setVersion((v) => ({ ...v, [id]: v[id] + 1 }))
  }, [])

  return { replay: version, bumpSlideOnLeave }
}
