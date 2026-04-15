import { motion, type Variants } from 'motion/react'
import { Children, isValidElement, type ReactNode } from 'react'

const container: Variants = {
  hidden: {
    opacity: 0,
    transition: { duration: 0.12, staggerChildren: 0.04, staggerDirection: -1 },
  },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.075,
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
      stiffness: 115,
      damping: 21,
      mass: 0.82,
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

const childMotionStyle = { transformStyle: 'preserve-3d' as const }

function AnimatedChild({ node }: { node: ReactNode }) {
  if (isValidElement(node)) {
    const t = node.type
    const { className: cn, children } = node.props as {
      className?: string
      children?: ReactNode
    }
    if (t === 'p') {
      return (
        <motion.p variants={child} style={childMotionStyle} className={cn}>
          {children}
        </motion.p>
      )
    }
    if (t === 'blockquote') {
      return (
        <motion.blockquote variants={child} style={childMotionStyle} className={cn}>
          {children}
        </motion.blockquote>
      )
    }
  }
  return (
    <motion.div variants={child} style={childMotionStyle}>
      {node}
    </motion.div>
  )
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
        <AnimatedChild key={isValidElement(node) ? node.key ?? i : i} node={node} />
      ))}
    </motion.div>
  )
}
