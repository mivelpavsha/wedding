import { motion, type Variants } from 'motion/react'
import { Children, type ReactNode } from 'react'

const container: Variants = {
  hidden: {
    opacity: 0,
    transition: { duration: 0.12, staggerChildren: 0.04, staggerDirection: -1 },
  },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.06,
    },
  },
}

const child: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
    rotateX: -6,
    filter: 'blur(8px)',
    transition: { duration: 0.12 },
  },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 90,
      damping: 20,
      mass: 0.85,
    },
  },
}

type Props = {
  children: ReactNode
  className?: string
  /** Слайд активен в Swiper — анимация входа при true, сброс при false. */
  active: boolean
  /** Увеличивать при уходе с секции — полный remount при следующем входе (опционально). */
  replayVersion?: number
}

/** Ненавязчивая появление блоков секции: пружина + лёгкий blur + наклон по X. */
export function SectionEntrance({
  children,
  className,
  active,
  replayVersion = 0,
}: Props) {
  return (
    <motion.div
      key={replayVersion}
      className={className}
      style={{ perspective: 1200 }}
      initial="hidden"
      animate={active ? 'show' : 'hidden'}
      variants={container}
    >
      {Children.toArray(children).map((node, i) => (
        <motion.div
          key={i}
          variants={child}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {node}
        </motion.div>
      ))}
    </motion.div>
  )
}
