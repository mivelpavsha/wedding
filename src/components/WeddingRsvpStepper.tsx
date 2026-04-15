import SendIcon from "@mui/icons-material/Send";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Step from "@mui/material/Step";
import StepContent from "@mui/material/StepContent";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Portal from "@mui/material/Portal";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import emailjs from "@emailjs/browser";
import Confetti from "react-confetti";
import {
  setWeddingConfettiForceActive,
  setWeddingConfettiSuppressed,
} from "../wedding-confetti-preference";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

/** Как в `WeddingConfetti` — линейная интерполяция для короткого «выстрела». */
function linearTween(t: number, b: number, end: number, d: number) {
  const c = end - b;
  return (c * t) / d + b;
}

let viewportSnapshotCache = { width: 0, height: 0 };
const VIEWPORT_SERVER_SNAPSHOT = { width: 0, height: 0 };

function subscribeWindowViewport(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function getWindowViewportSnapshot() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (
    width !== viewportSnapshotCache.width ||
    height !== viewportSnapshotCache.height
  ) {
    viewportSnapshotCache = { width, height };
  }
  return viewportSnapshotCache;
}

function useWindowViewport() {
  return useSyncExternalStore(
    subscribeWindowViewport,
    getWindowViewportSnapshot,
    () => VIEWPORT_SERVER_SNAPSHOT,
  );
}

/** Нормализация ширины вьюпорта: телефон → широкий монитор (0…1). */
function viewportWidthT(width: number) {
  const w = Math.min(Math.max(width, 320), 1920);
  return (w - 320) / (1920 - 320);
}

/**
 * Для физики конфетти: после ~планшета «t» почти не растёт — на ПК не быстрее и не дальше, чем на планшете.
 * (Размер полосы и число частиц по-прежнему от полного `t`.)
 */
function viewportTPhysics(widthNormT: number) {
  const knee = 0.42;
  if (widthNormT <= knee) return widthNormT;
  return knee + (widthNormT - knee) * 0.36;
}

/**
 * На средних ширинах (планшет) полный `tp` даёт слишком большие скорости к краям по сравнению с телефоном;
 * для конфетти смешиваем с эталоном «как у телефона».
 */
function confettiSpeedTp(t: number, tp: number) {
  const lo = 0.34;
  const hi = 0.82;
  if (t < lo || t > hi) return tp;
  const tpPhone = viewportTPhysics(0.18);
  const blend = 0.52;
  return tp * (1 - blend) + tpPhone * blend;
}

type EdgeSide = "left" | "right";

/**
 * Дуга: сначала вверх (vy < 0), горизонталь — по проекции направления к противоположному нижнему углу.
 * Гравитация затем опускает по дуге вниз.
 */
/** Множители к горизонтальной скорости: на широком экране — больше шагов → шире min/max у `randomRange`. */
function velocitySpreadFactors(spread: number, wide: boolean) {
  if (!wide) return [1 - spread, 1, 1 + spread];
  return [
    1 - spread * 1.45,
    1 - spread * 0.42,
    1,
    1 + spread * 0.42,
    1 + spread * 1.45,
  ];
}

function velocityArcTowardCorner(
  theta: number,
  sMin: number,
  sMax: number,
  vyUpLo: number,
  vyUpHi: number,
  spread: number,
  side: EdgeSide,
  wideSpread: boolean,
) {
  const c = Math.max(0.28, Math.abs(Math.cos(theta)));
  const sign = side === "left" ? 1 : -1;
  const factors = velocitySpreadFactors(spread, wideSpread);
  let vxMin = Infinity;
  let vxMax = -Infinity;
  for (const s of [sMin, sMax]) {
    for (const f of factors) {
      const vx = sign * s * c * f;
      vxMin = Math.min(vxMin, vx);
      vxMax = Math.max(vxMax, vx);
    }
  }
  const vyChaos = wideSpread ? 1.06 : 1;
  const vyLo = vyUpLo / vyChaos;
  const vyHi = vyUpHi * vyChaos;
  return {
    initialVelocityX: { min: vxMin, max: vxMax },
    initialVelocityY: { min: -vyHi, max: -vyLo },
  };
}

/** Угол направления из полосы-эмиттера к «противоположному нижнему углу» (для горизонтальной проекции дуги). */
function rsvpTangentTheta(
  width: number,
  height: number,
  stripW: number,
  side: EdgeSide,
  zone: "upper" | "lower",
) {
  const ty = height * (zone === "upper" ? 0.93 : 0.97);
  const tx = side === "left" ? width * 0.88 : width * 0.12;
  const x0 = side === "left" ? stripW * 0.42 : width - stripW * 0.42;
  const y0 = height * (zone === "upper" ? 0.16 : 0.74);
  const dx = tx - x0;
  const dy = ty - y0;
  return Math.atan2(dy, dx);
}

/** Слой с разными случайными масштабами скорости — одна полоса-эмиттер, без «пучков» по высоте. */
type ConfettiSpeedLayer = {
  sMinMul: number;
  sMaxMul: number;
  vyMul: number;
  thetaOff: number;
  windMul: number;
};

function randomSpeedLayer(): ConfettiSpeedLayer {
  const sMinMul = 0.54 + Math.random() * 0.44;
  const sMaxMul = sMinMul + 0.02 + Math.random() * 0.32;
  const vyMul = 0.6 + Math.random() * 0.48;
  const thetaOff = (Math.random() - 0.5) * 0.5;
  const windMul = 0.84 + Math.random() * 0.3;
  return { sMinMul, sMaxMul, vyMul, thetaOff, windMul };
}

function splitPieceBudget(total: number, parts: number): number[] {
  if (parts < 1) return [total];
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    Math.max(1, base + (i < rem ? 1 : 0)),
  );
}

/**
 * Базовая физика + скорости: быстрее, но трение/гравитация удерживают в кадре;
 * на узком экране чуть ниже масштаб, чтобы не вылетать за края по горизонтали.
 */
function rsvpEdgeConfettiParams(width: number, reducedMotion: boolean) {
  const w = Math.min(Math.max(width, 320), 1920);
  const t = viewportWidthT(width);
  const tp = viewportTPhysics(t);
  const tpVel = confettiSpeedTp(t, tp);
  const rm = reducedMotion ? 0.52 : 1;

  /** Телефон / планшет: чуть короче перелёт (по полному `t`), к ~широкому планшету сходится к 1. */
  let travelTrim = t < 0.52 ? 0.838 + (t / 0.52) * 0.042 : 1;
  /* Планшет в альбоме / «средняя» ширина: ещё чуть короче, без изменения узких телефонов и широкого ПК */
  if (t >= 0.46 && t <= 0.82) {
    travelTrim *= 0.808;
  }

  const velScale = 0.48 + 0.52 * tpVel;

  const stripW = Math.min(64, Math.max(22, w * (0.026 + t * 0.018)));

  const piecesTotal = Math.max(24, Math.round((34 + t * 72) * rm));
  const piecesHalf = Math.max(10, Math.round(piecesTotal / 2));

  const sMin = (8 + tpVel * 14) * velScale * rm * travelTrim;
  const sMax = (15 + tpVel * 22) * velScale * rm * travelTrim;
  let spread = t >= 0.34 && t <= 0.82 ? 0.078 : 0.1;
  /* Крупный экран: без доп. разброса получается «стена» с одинаковым vx у полосы эмиттера */
  if (t > 0.76) {
    spread += Math.min(0.14, (t - 0.76) * 0.42);
  }
  const wideSpread = t > 0.72;

  /* Импульс вверх: верхняя полоса сильнее, нижняя слабее — всё равно заметная дуга */
  const vyUpUpperLo = (7 + tpVel * 12) * velScale * rm * travelTrim;
  const vyUpUpperHi = (14 + tpVel * 20) * velScale * rm * travelTrim;
  const vyUpLowerLo = (4 + tpVel * 8) * velScale * rm * travelTrim;
  const vyUpLowerHi = (10 + tpVel * 15) * velScale * rm * travelTrim;

  const gravity = (0.048 + tpVel * 0.032) * (reducedMotion ? 0.88 : 1);
  const friction = 0.99695 + tpVel * 0.00283;

  const windMag =
    (0.0018 + tpVel * 0.004) * (reducedMotion ? 0.45 : 1) * travelTrim;

  return {
    stripW,
    piecesHalf,
    sMin,
    sMax,
    spread,
    wideSpread,
    vyUpUpperLo,
    vyUpUpperHi,
    vyUpLowerLo,
    vyUpLowerHi,
    gravity,
    friction,
    windLeft: windMag,
    windRight: -windMag,
    opacity: reducedMotion ? 0.78 : 0.9,
  };
}

/** Два залпа с каждого края: полосы на всю половину высоты; несколько слоёв с разным random-импульсом — без «стены». */
function RsvpSuccessEdgeConfetti({
  width,
  height,
  reducedMotion,
}: {
  width: number;
  height: number;
  reducedMotion: boolean;
}) {
  const p = rsvpEdgeConfettiParams(width, reducedMotion);
  const upperH = Math.max(1, Math.round(height * 0.5));
  const lowerH = Math.max(1, height - upperH);

  const common = {
    width,
    height,
    recycle: false,
    tweenDuration: 1,
    tweenFunction: linearTween,
    gravity: p.gravity,
    friction: p.friction,
    opacity: p.opacity,
  } as const;

  const layerCount = width < 560 ? 3 : 6;
  const { layersLU, layersLL, layersRU, layersRL } = useMemo(() => {
    const mk = () => Array.from({ length: layerCount }, randomSpeedLayer);
    return {
      layersLU: mk(),
      layersLL: mk(),
      layersRU: mk(),
      layersRL: mk(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- новые случайные слои при смене размера окна
  }, [layerCount, width, height]);
  const piecesPerLayerUpper = useMemo(
    () => splitPieceBudget(p.piecesHalf, layerCount),
    [p.piecesHalf, layerCount],
  );
  const piecesPerLayerLower = useMemo(
    () => splitPieceBudget(p.piecesHalf, layerCount),
    [p.piecesHalf, layerCount],
  );

  const thetaLU = rsvpTangentTheta(width, height, p.stripW, "left", "upper");
  const thetaLL = rsvpTangentTheta(width, height, p.stripW, "left", "lower");
  const thetaRU = rsvpTangentTheta(width, height, p.stripW, "right", "upper");
  const thetaRL = rsvpTangentTheta(width, height, p.stripW, "right", "lower");

  const windL = [0.94, 1.06] as const;
  const windR = [1.02, 0.96] as const;

  return (
    <>
      {layersLU.map((layer, i) => {
        const v = velocityArcTowardCorner(
          thetaLU + layer.thetaOff,
          p.sMin * layer.sMinMul,
          p.sMax * layer.sMaxMul,
          p.vyUpUpperLo * layer.vyMul,
          p.vyUpUpperHi * layer.vyMul,
          p.spread,
          "left",
          p.wideSpread,
        );
        return (
          <Confetti
            key={`lu-${i}`}
            {...common}
            wind={p.windLeft * windL[0] * layer.windMul}
            numberOfPieces={piecesPerLayerUpper[i] ?? 4}
            confettiSource={{ x: 0, y: 0, w: p.stripW, h: upperH }}
            initialVelocityX={v.initialVelocityX}
            initialVelocityY={v.initialVelocityY}
          />
        );
      })}
      {layersLL.map((layer, i) => {
        const v = velocityArcTowardCorner(
          thetaLL + layer.thetaOff,
          p.sMin * 0.92 * layer.sMinMul,
          p.sMax * 0.95 * layer.sMaxMul,
          p.vyUpLowerLo * layer.vyMul,
          p.vyUpLowerHi * layer.vyMul,
          p.spread,
          "left",
          p.wideSpread,
        );
        return (
          <Confetti
            key={`ll-${i}`}
            {...common}
            wind={p.windLeft * windL[1] * layer.windMul}
            numberOfPieces={piecesPerLayerLower[i] ?? 4}
            confettiSource={{ x: 0, y: upperH, w: p.stripW, h: lowerH }}
            initialVelocityX={v.initialVelocityX}
            initialVelocityY={v.initialVelocityY}
          />
        );
      })}
      {layersRU.map((layer, i) => {
        const v = velocityArcTowardCorner(
          thetaRU + layer.thetaOff,
          p.sMin * layer.sMinMul,
          p.sMax * layer.sMaxMul,
          p.vyUpUpperLo * layer.vyMul,
          p.vyUpUpperHi * layer.vyMul,
          p.spread,
          "right",
          p.wideSpread,
        );
        return (
          <Confetti
            key={`ru-${i}`}
            {...common}
            wind={p.windRight * windR[0] * layer.windMul}
            numberOfPieces={piecesPerLayerUpper[i] ?? 4}
            confettiSource={{
              x: width - p.stripW,
              y: 0,
              w: p.stripW,
              h: upperH,
            }}
            initialVelocityX={v.initialVelocityX}
            initialVelocityY={v.initialVelocityY}
          />
        );
      })}
      {layersRL.map((layer, i) => {
        const v = velocityArcTowardCorner(
          thetaRL + layer.thetaOff,
          p.sMin * 0.92 * layer.sMinMul,
          p.sMax * 0.95 * layer.sMaxMul,
          p.vyUpLowerLo * layer.vyMul,
          p.vyUpLowerHi * layer.vyMul,
          p.spread,
          "right",
          p.wideSpread,
        );
        return (
          <Confetti
            key={`rl-${i}`}
            {...common}
            wind={p.windRight * windR[1] * layer.windMul}
            numberOfPieces={piecesPerLayerLower[i] ?? 4}
            confettiSource={{
              x: width - p.stripW,
              y: upperH,
              w: p.stripW,
              h: lowerH,
            }}
            initialVelocityX={v.initialVelocityX}
            initialVelocityY={v.initialVelocityY}
          />
        );
      })}
    </>
  );
}

/** Виброотклик + конфетти по краям при успешной отправке RSVP. */
function RsvpSuccessCelebration() {
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const { width, height } = useWindowViewport();

  useLayoutEffect(() => {
    if (prefersReducedMotion) return;
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      try {
        /* Дольше и с более длинными импульсами, чем [12, 40, 14], чтобы отклик был заметнее */
        navigator.vibrate([38, 55, 45, 65, 42, 52, 35]);
      } catch {
        /* secure context / политика */
      }
    }
  }, [prefersReducedMotion]);

  if (width < 1 || height < 1) return null;

  /* `Portal` (по умолчанию в `document.body`): иначе `fixed` цепляется к предку с transform (Motion/Swiper). */
  return (
    <Portal>
      <div
        className="pointer-events-none fixed inset-0 z-60"
        style={{ width: "100vw", height: "100dvh", minHeight: "100%" }}
        aria-hidden
      >
        <RsvpSuccessEdgeConfetti
          width={width}
          height={height}
          reducedMotion={prefersReducedMotion}
        />
      </div>
    </Portal>
  );
}

const ALCOHOL_OPTIONS: { id: string; label: string }[] = [
  { id: "champagne", label: "Шампанское" },
  { id: "red_dry", label: "Красное сухое вино" },
  { id: "red_semi", label: "Красное полусладкое вино" },
  { id: "white_semi", label: "Белое полусладкое вино" },
  { id: "white_dry", label: "Белое сухое вино" },
  { id: "whiskey", label: "Виски" },
//{ id: "cognac", label: "Коньяк" },
  { id: "vodka", label: "Водка" },
//{ id: "rum", label: "Ром" },
//{ id: "gin", label: "Джин" },
//{ id: "tequila", label: "Текила" },
  { id: "soft", label: "Безалкогольные напитки" },
];

const MEAL_OPTIONS: { id: string; label: string }[] = [
  { id: "meat", label: "Мясо (Щечки говяжьи с картофельным пюре и соусом демигляс)" },
  { id: "fish", label: "Рыба (Стейк из форели со сливочным соусом на подушке из овощей)" },
];

const RSVP_STEP_LABELS = [
  "Имя и фамилия",
  "Присутствие",
  "Напитки",
  "Горячее блюдо",
  "Пожелания для организаторов",
] as const;

export type RsvpFormValues = {
  fullName: string;
  attendance: "yes" | "no" | undefined;
  alcohol: string[];
  /** Одно горячее блюдо */
  meal: "" | "meat" | "fish";
  /** Необязательно: аллергии, пожелания по столу и т.п. */
  wishes: string;
};

/** Пасхалки: имя ровно так, присутствие «не смогу», пожелания пустые — без EmailJS. */
const CONFETTI_EGG_DESTROY = "confetti_destroy";
const CONFETTI_EGG_CREATE = "confetti_create";

function detectConfettiEasterEgg(
  data: RsvpFormValues,
): "destroy" | "create" | null {
  if (data.attendance !== "no") return null;
  if (data.wishes.trim() !== "") return null;
  const name = data.fullName.trim();
  if (name === CONFETTI_EGG_DESTROY) return "destroy";
  if (name === CONFETTI_EGG_CREATE) return "create";
  return null;
}

type RsvpSubmitStatus =
  | "idle"
  | "success"
  | "success_egg_destroy"
  | "success_egg_create"
  | "error";

function subscribeDomTheme(cb: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(cb);
  obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function snapshotDomTheme(): "light" | "dark" {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return "dark";
  if (t === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function serverDomTheme(): "light" {
  return "light";
}

function useDomColorMode(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeDomTheme,
    snapshotDomTheme,
    serverDomTheme,
  );
}

function RsvpMuiThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useDomColorMode();
  const theme = useMemo(() => {
    /** Одна линия для StepConnector и StepContent — иначе два цвета и сдвиг пикселей */
    const stepLine =
      mode === "dark"
        ? "rgba(192, 132, 252, 0.45)"
        : "rgba(147, 51, 234, 0.42)";

    return createTheme({
      palette: {
        mode,
        primary: { main: mode === "dark" ? "#c084fc" : "#9333ea" },
        background: {
          default: mode === "dark" ? "#16171d" : "#faf8f5",
          paper: mode === "dark" ? "#1e1f26" : "#ffffff",
        },
        text: {
          primary: mode === "dark" ? "#f3f4f6" : "#1c1917",
          secondary: mode === "dark" ? "#9ca3af" : "#57534e",
        },
      },
      shape: { borderRadius: 10 },
      typography: {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      },
      components: {
        MuiStepConnector: {
          styleOverrides: {
            line: {
              borderLeftColor: stepLine,
              borderColor: stepLine,
            },
          },
        },
        MuiStepContent: {
          styleOverrides: {
            root: ({ theme, ownerState }) => ({
              marginLeft: theme.spacing(1.5),
              ...(ownerState.last
                ? { borderLeft: "none" }
                : {
                    borderLeftWidth: 1,
                    borderLeftStyle: "solid",
                    borderLeftColor: stepLine,
                  }),
              [theme.breakpoints.down("sm")]: {
                paddingLeft: theme.spacing(2.5),
                paddingTop: theme.spacing(0.5),
                paddingBottom: theme.spacing(1),
              },
            }),
          },
        },
        MuiStepLabel: {
          styleOverrides: {
            root: ({ theme }) => ({
              [theme.breakpoints.down("sm")]: {
                paddingBottom: theme.spacing(0.25),
                "& .MuiStepLabel-label": {
                  fontSize: "0.8125rem",
                },
              },
            }),
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: ({ theme }) => {
              /* Светлая тема: не чистый #fff (резкий к фону #faf8f5), а тёплый «пергамент» */
              const bg =
                theme.palette.mode === "dark"
                  ? theme.palette.background.paper
                  : "#f1ede4";
              const fg = theme.palette.text.primary;
              const autofill = {
                WebkitBoxShadow: `0 0 0 1000px ${bg} inset`,
                WebkitTextFillColor: fg,
                caretColor: fg,
                borderRadius: theme.shape.borderRadius,
                transition:
                  "background-color 5000s ease-out 0s, color 5000s ease-out 0s",
              };
              return {
                "& .MuiOutlinedInput-input:-webkit-autofill": autofill,
                "& .MuiOutlinedInput-input:-webkit-autofill:hover": autofill,
                "& .MuiOutlinedInput-input:-webkit-autofill:focus": autofill,
                "& .MuiOutlinedInput-input:-webkit-autofill:active": autofill,
              };
            },
          },
        },
      },
    });
  }, [mode]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

function StepName() {
  const {
    control,
    formState: { errors },
  } = useFormContext<RsvpFormValues>();
  return (
    <Controller
      name="fullName"
      control={control}
      rules={{ required: "Укажите имя и фамилию" }}
      render={({ field }) => (
        <TextField
          {...field}
          label="Введите Ваше имя и фамилию"
          required
          fullWidth
          error={!!errors.fullName}
          helperText={errors.fullName?.message}
          variant="outlined"
          margin="dense"
        />
      )}
    />
  );
}

function StepPresence({
  onAttendancePick,
}: {
  onAttendancePick?: (
    value: "yes" | "no",
    previous: "yes" | "no" | undefined,
  ) => void;
}) {
  const {
    control,
    formState: { errors },
  } = useFormContext<RsvpFormValues>();
  return (
    <FormControl
      error={!!errors.attendance}
      component="fieldset"
      sx={{ mt: { xs: 0.5, sm: 1 } }}
    >
      <FormLabel component="legend" required>
        Присутствие
      </FormLabel>
      <Controller
        name="attendance"
        control={control}
        rules={{ required: "Выберите вариант" }}
        render={({ field }) => (
          <RadioGroup
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onBlur={field.onBlur}
            onChange={(e) => {
              const v = e.target.value as "yes" | "no";
              const previous = field.value;
              field.onChange(v);
              onAttendancePick?.(v, previous);
            }}
          >
            <FormControlLabel
              value="yes"
              control={<Radio color="primary" />}
              label="Я с удовольствием приду"
            />
            <FormControlLabel
              value="no"
              control={<Radio color="primary" />}
              label="К сожалению, не смогу присутствовать"
            />
          </RadioGroup>
        )}
      />
      {errors.attendance && (
        <FormHelperText>{errors.attendance.message}</FormHelperText>
      )}
    </FormControl>
  );
}

function StepAlcohol() {
  const { control } = useFormContext<RsvpFormValues>();
  return (
    <Box sx={{ mt: { xs: 0.5, sm: 1 } }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: { xs: 1, sm: 2 } }}
      >
        Мы хотим, чтобы свадьба прошла весело, поэтому просим Вас выбрать
        алкоголь, который Вы предпочитаете:
      </Typography>
      <FormGroup>
        <Controller
          name="alcohol"
          control={control}
          render={({ field: { value, onChange } }) => (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 0.5,
              }}
            >
              {ALCOHOL_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.id}
                  control={
                    <Checkbox
                      color="primary"
                      checked={value.includes(opt.id)}
                      onChange={(_, checked) => {
                        if (checked) onChange([...value, opt.id]);
                        else onChange(value.filter((id) => id !== opt.id));
                      }}
                    />
                  }
                  label={opt.label}
                />
              ))}
            </Box>
          )}
        />
      </FormGroup>
    </Box>
  );
}

/*function StepMeals() {
  const {
    control,
    formState: { errors },
  } = useFormContext<RsvpFormValues>();
  return (
    <Box sx={{ mt: { xs: 0.5, sm: 1 } }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: { xs: 1, sm: 2 } }}
      >
        Так же уточните Ваши предпочтения в горячих блюдах:
      </Typography>
      <FormControl error={!!errors.meal} component="fieldset">
        <FormLabel component="legend" required>
          Горячее блюдо
        </FormLabel>
        <Controller
          name="meal"
          control={control}
          rules={{
            validate: (v, form) => {
              if (form.attendance !== "yes") return true;
              return v ? true : "Выберите одно блюдо";
            },
          }}
          render={({ field }) => (
            <RadioGroup
              name={field.name}
              ref={field.ref}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => {
                field.onChange(e.target.value as "meat" | "fish");
              }}
            >
              {MEAL_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.id}
                  value={opt.id}
                  control={<Radio color="primary" />}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
          )}
        />
        {errors.meal && <FormHelperText>{errors.meal.message}</FormHelperText>}
      </FormControl>
    </Box>
  );
}
*/
function StepMeals() {
  const {
    control,
    formState: { errors },
  } = useFormContext<RsvpFormValues>();

  return (
    <Box sx={{ mt: { xs: 0.5, sm: 1 } }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: { xs: 1, sm: 2 } }}
      >
        Так же уточните Ваши предпочтения в горячих блюдах:
      </Typography>
      <FormControl error={!!errors.meal} component="fieldset">
        <FormLabel component="legend" required>
          Горячее блюдо
        </FormLabel>
        <Controller
          name="meal"
          control={control}
          rules={{
            validate: (v, form) => {
              if (form.attendance !== "yes") return true;
              return v ? true : "Выберите одно блюдо";
            },
          }}
          render={({ field }) => (
            <RadioGroup
              name={field.name}
              ref={field.ref}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => {
                field.onChange(e.target.value as "meat" | "fish");
              }}
            >
              {/* Мясо */}
              <Box>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Radio value="meat" color="primary" />
                  <Typography sx={{ fontWeight: 500, fontSize: "1.1rem" }}>
                    Мясо
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ 
                    ml: "40px",
                    wordBreak: "break-word",
                    pr: { xs: 1, sm: 0 }
                  }}
                >
                  (Щечки говяжьи с картофельным пюре и соусом демиглас)
                </Typography>
              </Box>

              {/* Рыба */}
              <Box sx={{ mt: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Radio value="fish" color="primary" />
                  <Typography sx={{ fontWeight: 500, fontSize: "1.1rem" }}>
                    Рыба
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ 
                    ml: "40px",
                    wordBreak: "break-word",
                    pr: { xs: 1, sm: 0 }
                  }}
                >
                  (Стейк из форели со сливочным соусом на подушке из овощей)
                </Typography>
              </Box>
            </RadioGroup>
          )}
        />
        {errors.meal && <FormHelperText>{errors.meal.message}</FormHelperText>}
      </FormControl>
    </Box>
  );
}

function SkippedStepHint({ children }: { children: string }) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ mt: { xs: 0.5, sm: 1 }, py: { xs: 0.5, sm: 1 } }}
    >
      {children}
    </Typography>
  );
}

function StepWishes() {
  const { control } = useFormContext<RsvpFormValues>();
  return (
    <Box sx={{ mt: { xs: 0.5, sm: 1 } }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: { xs: 1, sm: 2 }, lineHeight: 1.6 }}
      >
        Аллергии, ограничения по меню или просто тёплое слово — всё, что важно
        учесть. Можно оставить пустым.
      </Typography>
      <Controller
        name="wishes"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            label="Комментарий для нас"
            multiline
            minRows={3}
            maxRows={12}
            fullWidth
            placeholder="Например: без орехов, предпочитаю столик у окна…"
            variant="outlined"
          />
        )}
      />
    </Box>
  );
}

function buildEmailPayload(data: RsvpFormValues) {
  const alcoholLabels = data.alcohol
    .map((id) => ALCOHOL_OPTIONS.find((o) => o.id === id)?.label ?? id)
    .join(", ");
  const mealLabel = data.meal
    ? (MEAL_OPTIONS.find((o) => o.id === data.meal)?.label ?? data.meal)
    : "—";
  const wishesLine = data.wishes.trim() !== "" ? data.wishes.trim() : "—";

  return {
    fullName: data.fullName,
    attendance:
      data.attendance === "yes"
        ? "Я с удовольствием приду"
        : data.attendance === "no"
          ? "Не смогу присутствовать"
          : "",
    attendance_code: data.attendance ?? "",
    alcohol: alcoholLabels || "—",
    meals: mealLabel,
    wishes: wishesLine,
    message: [
      `Имя: ${data.fullName}`,
      `Присутствие: ${data.attendance === "yes" ? "приду" : data.attendance === "no" ? "не приду" : ""}`,
      data.attendance === "yes"
        ? `Алкоголь: ${alcoholLabels || "не выбрано"}`
        : "",
      data.attendance === "yes" ? `Горячее: ${mealLabel}` : "",
      `Пожелания: ${wishesLine}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/*function RsvpStepperInner() {
  const methods = useForm<RsvpFormValues>({
    defaultValues: {
      fullName: "",
      attendance: undefined,
      alcohol: [],
      meal: "",
      wishes: "",
    },
    mode: "onBlur",
  });
  const {
    control,
    trigger,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = methods;

  const attendance = useWatch({ control, name: "attendance" });
  const [activeStep, setActiveStep] = useState(0);
  const [submitStatus, setSubmitStatus] = useState<RsvpSubmitStatus>("idle");

  const stepCompleted = useCallback(
    (index: number) => {
      if (index === 0) return activeStep > 0;
      if (index === 1) return activeStep > 1;
      if (index === 2) return attendance === "no" || activeStep > 2;
      if (index === 3) return attendance === "no" || activeStep > 3;
      if (index === 4) return activeStep > 4;
      return false;
    },
    [activeStep, attendance],
  );

  const goNext = useCallback(async () => {
    if (activeStep === 0) {
      const ok = await trigger("fullName");
      if (ok) setActiveStep(1);
      return;
    }
    if (activeStep === 1) {
      const ok = await trigger("attendance");
      if (!ok) return;
      if (attendance === "yes") setActiveStep(2);
      else setActiveStep(4);
      return;
    }
    if (activeStep === 2 && attendance === "yes") {
      setActiveStep(3);
      return;
    }
    if (activeStep === 3 && attendance === "yes") {
      setActiveStep(4);
    }
  }, [activeStep, attendance, trigger]);

  const goBack = useCallback(() => {
    setActiveStep((s) => {
      if (s === 4 && attendance === "no") return 1;
      return Math.max(0, s - 1);
    });
  }, [attendance]);

  const onSubmit = useCallback(
    async (data: RsvpFormValues) => {
      const egg = detectConfettiEasterEgg(data);
      if (egg) {
        if (egg === "destroy") {
          setWeddingConfettiForceActive(false);
          setWeddingConfettiSuppressed(true);
          setSubmitStatus("success_egg_destroy");
        } else {
          setWeddingConfettiSuppressed(false);
          setWeddingConfettiForceActive(true);
          setSubmitStatus("success_egg_create");
        }
        reset();
        setActiveStep(0);
        return;
      }

      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (!serviceId || !templateId || !publicKey) {
        console.error(
          "EmailJS: задайте VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY в .env",
        );
        setSubmitStatus("error");
        return;
      }

      const templateParams = buildEmailPayload(data);

      try {
        await emailjs.send(serviceId, templateId, templateParams, {
          publicKey,
        });
        setSubmitStatus("success");
        reset();
        setActiveStep(0);
      } catch (e) {
        console.error(e);
        setSubmitStatus("error");
      }
    },
    [reset],
  );

  if (submitStatus === "success_egg_destroy") {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 3,
          px: 2,
          borderRadius: 2,
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          marginBottom: 2.5,
        }}
      >
        <Typography variant="h6" gutterBottom color="primary">
          Конфетти отключено
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Праздничное конфетти на сайте выключено, в том числе режим с
          пасхалки. В день свадьбы и годовщины оно не покажется, пока снова не
          включите через пасхалку. Письмо не отправлялось.
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setSubmitStatus("idle")}
        >
          Вернуться к форме
        </Button>
      </Box>
    );
  }

  if (submitStatus === "success_egg_create") {
    return (
      <>
        <RsvpSuccessCelebration />
        <Box
          sx={{
            textAlign: "center",
            py: 3,
            px: 2,
            borderRadius: 2,
            bgcolor: "action.hover",
            border: "1px solid",
            borderColor: "divider",
            marginBottom: 2.5,
          }}
        >
          <Typography variant="h6" gutterBottom color="primary">
            Конфетти снова включено
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Праздничное конфетти уже включено на сайте (как в день свадьбы). В
            день свадьбы и годовщины оно снова появится само. Письмо не
            отправлялось.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => setSubmitStatus("idle")}
          >
            Вернуться к форме
          </Button>
        </Box>
      </>
    );
  }

  if (submitStatus === "success") {
    return (
      <>
        <RsvpSuccessCelebration />
        <Box
          sx={{
            textAlign: "center",
            py: 3,
            px: 2,
            borderRadius: 2,
            bgcolor: "action.hover",
            border: "1px solid",
            borderColor: "divider",
            marginBottom: 2.5,
          }}
        >
          <Typography variant="h6" gutterBottom color="primary">
            Спасибо! Ответ отправлен
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Мы получили ваше сообщение на почту и очень ждём встречи.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => setSubmitStatus("idle")}
          >
            Отправить ещё один ответ
          </Button>
        </Box>
      </>
    );
  }

  return (
    <FormProvider {...methods}>
      <Box
        component="form"
        noValidate
        sx={{ width: "100%", textAlign: "left" }}
      >
        <Stepper activeStep={activeStep} orientation="vertical">
          {RSVP_STEP_LABELS.map((label, index) => (
            <Step key={label} completed={stepCompleted(index)}>
              <StepLabel
                optional={
                  index === 2 && attendance === "no" ? (
                    <Typography variant="caption" color="text.secondary">
                      не требуется
                    </Typography>
                  ) : index === 2 && attendance === "yes" ? (
                    "по желанию"
                  ) : index === 3 && attendance === "no" ? (
                    <Typography variant="caption" color="text.secondary">
                      не требуется
                    </Typography>
                  ) : index === 4 ? (
                    "необязательно"
                  ) : undefined
                }
              >
                <Typography variant="subtitle2" component="span">
                  {label}
                </Typography>
              </StepLabel>
              <StepContent>
                {index === 0 && <StepName />}
                {index === 1 && (
                  <StepPresence
                    onAttendancePick={(v, prev) => {
                      if (v === "no" && activeStep > 1) {
                        setActiveStep(1);
                      }
                      if (v === "yes" && prev === "no") {
                        setValue("alcohol", []);
                        setValue("meal", "");
                        setValue("wishes", "");
                      }
                    }}
                  />
                )}
                {index === 2 &&
                  (attendance === "yes" ? (
                    <StepAlcohol />
                  ) : attendance === "no" ? (
                    <SkippedStepHint>
                      Этот шаг не нужен — вы отметили, что не сможете прийти.
                    </SkippedStepHint>
                  ) : null)}
                {index === 3 &&
                  (attendance === "yes" ? (
                    <StepMeals />
                  ) : attendance === "no" ? (
                    <SkippedStepHint>
                      Этот шаг не нужен — вы отметили, что не сможете прийти.
                    </SkippedStepHint>
                  ) : null)}
                {index === 4 && <StepWishes />}
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Box
          sx={{
            mt: { xs: 1.5, sm: 2 },
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "center",
          }}
        >
          {activeStep === 0 && (
            <Button variant="contained" onClick={() => void goNext()}>
              Далее
            </Button>
          )}

          {activeStep === 1 && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button
                variant="contained"
                onClick={() => void goNext()}
                disabled={isSubmitting}
              >
                Далее
              </Button>
            </>
          )}

          {activeStep === 2 && attendance === "yes" && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button
                variant="contained"
                onClick={() => void goNext()}
                disabled={isSubmitting}
              >
                Далее
              </Button>
            </>
          )}

          {activeStep === 3 && attendance === "yes" && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button
                variant="contained"
                onClick={() => void goNext()}
                disabled={isSubmitting}
              >
                Далее
              </Button>
            </>
          )}

          {activeStep === 4 && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button
                variant="contained"
                color="primary"
                loading={isSubmitting}
                endIcon={<SendIcon />}
                onClick={() => void handleSubmit(onSubmit)()}
                sx={{ boxShadow: 2, px: 3 }}
              >
                Отправить ответ
              </Button>
            </>
          )}
        </Box>

        {submitStatus === "error" && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            Не удалось отправить ответ. Попробуйте чуть позже или напишите нам
            на почту.
          </Typography>
        )}

        <Divider sx={{ my: { xs: 2, sm: 3 }, borderColor: "divider" }} />

        <Box
          sx={{
            p: { xs: 1.5, sm: 2.25 },
            mb: { xs: 2.5, sm: 3 },
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.02)",
          }}
        >
          <Typography
            variant="overline"
            sx={{
              display: "block",
              letterSpacing: "0.12em",
              color: "text.secondary",
              mb: 1.5,
              fontWeight: 600,
            }}
          >
            Как устроена анкета
          </Typography>
          <Stack
            spacing={1.25}
            component="ul"
            sx={{ m: 0, pl: 2.25, listStyle: "disc" }}
          >
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              <strong style={{ color: "inherit", fontWeight: 600 }}>
                Обязательно:
              </strong>{" "}
              имя и фамилия, ответ о присутствии.
            </Typography>
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              Если отмечаете, что{" "}
              <strong style={{ fontWeight: 600 }}>придёте</strong>, на шаге с
              горячим блюдом нужно выбрать{" "}
              <strong style={{ fontWeight: 600 }}>мясо или рыбу</strong> — без
              этого отправка не завершится.
            </Typography>
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              Напитки — по желанию. Блок{" "}
              <strong style={{ fontWeight: 600 }}>
                «Пожелания для организаторов»
              </strong>{" "}
              в конце можно не заполнять — там по желанию аллергии, детали и
              тёплое слово.
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: { xs: 1.5, sm: 2 },
              pt: { xs: 1.5, sm: 2 },
              borderTop: "1px solid",
              borderColor: "divider",
              lineHeight: 1.6,
            }}
          >
            После отправки ваш ответ приходит{" "}
            <strong>на почту организаторам</strong> — мы храним данные только
            для подготовки праздника.
          </Typography>
        </Box>
      </Box>
    </FormProvider>
  );
}*/
function RsvpStepperInner() {
  const methods = useForm<RsvpFormValues>({
    defaultValues: {
      fullName: "",
      attendance: undefined,
      alcohol: [],
      meal: "",
      wishes: "",
    },
    mode: "onBlur",
  });
  const {
    control,
    trigger,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = methods;

  const attendance = useWatch({ control, name: "attendance" });
  const [activeStep, setActiveStep] = useState(0);
  const [submitStatus, setSubmitStatus] = useState<RsvpSubmitStatus>("idle");

  const stepCompleted = useCallback(
    (index: number) => {
      if (index === 0) return activeStep > 0;
      if (index === 1) return activeStep > 1;
      if (index === 2) return attendance === "no" || activeStep > 2;
      if (index === 3) return attendance === "no" || activeStep > 3;
      if (index === 4) return activeStep > 4;
      return false;
    },
    [activeStep, attendance],
  );

  const goNext = useCallback(async () => {
    if (activeStep === 0) {
      const ok = await trigger("fullName");
      if (ok) setActiveStep(1);
      return;
    }
    if (activeStep === 1) {
      const ok = await trigger("attendance");
      if (!ok) return;
      if (attendance === "yes") setActiveStep(2);
      else setActiveStep(4);
      return;
    }
    if (activeStep === 2 && attendance === "yes") {
      setActiveStep(3);
      return;
    }
    if (activeStep === 3 && attendance === "yes") {
      setActiveStep(4);
    }
  }, [activeStep, attendance, trigger]);

  const goBack = useCallback(() => {
    setActiveStep((s) => {
      if (s === 4 && attendance === "no") return 1;
      return Math.max(0, s - 1);
    });
  }, [attendance]);

  const onSubmit = useCallback(
    async (data: RsvpFormValues) => {
      const egg = detectConfettiEasterEgg(data);
      if (egg) {
        if (egg === "destroy") {
          setWeddingConfettiForceActive(false);
          setWeddingConfettiSuppressed(true);
          setSubmitStatus("success_egg_destroy");
        } else {
          setWeddingConfettiSuppressed(false);
          setWeddingConfettiForceActive(true);
          setSubmitStatus("success_egg_create");
        }
        reset();
        setActiveStep(0);
        return;
      }

      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (!serviceId || !templateId || !publicKey) {
        console.error(
          "EmailJS: задайте VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY в .env",
        );
        setSubmitStatus("error");
        return;
      }

      const templateParams = buildEmailPayload(data);

      try {
        await emailjs.send(serviceId, templateId, templateParams, {
          publicKey,
        });
        setSubmitStatus("success");
        reset();
        setActiveStep(0);
      } catch (e) {
        console.error(e);
        setSubmitStatus("error");
      }
    },
    [reset],
  );

  if (submitStatus === "success_egg_destroy") {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 3,
          px: 2,
          borderRadius: 2,
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          marginBottom: 2.5,
        }}
      >
        <Typography variant="h6" gutterBottom color="primary">
          Конфетти отключено
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Праздничное конфетти на сайте выключено, в том числе режим с
          пасхалки. В день свадьбы и годовщины оно не покажется, пока снова не
          включите через пасхалку. Письмо не отправлялось.
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setSubmitStatus("idle")}
        >
          Вернуться к форме
        </Button>
      </Box>
    );
  }

  if (submitStatus === "success_egg_create") {
    return (
      <>
        <RsvpSuccessCelebration />
        <Box
          sx={{
            textAlign: "center",
            py: 3,
            px: 2,
            borderRadius: 2,
            bgcolor: "action.hover",
            border: "1px solid",
            borderColor: "divider",
            marginBottom: 2.5,
          }}
        >
          <Typography variant="h6" gutterBottom color="primary">
            Конфетти снова включено
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Праздничное конфетти уже включено на сайте (как в день свадьбы). В
            день свадьбы и годовщины оно снова появится само. Письмо не
            отправлялось.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => setSubmitStatus("idle")}
          >
            Вернуться к форме
          </Button>
        </Box>
      </>
    );
  }

  if (submitStatus === "success") {
    return (
      <>
        <RsvpSuccessCelebration />
        <Box
          sx={{
            textAlign: "center",
            py: 3,
            px: 2,
            borderRadius: 2,
            bgcolor: "action.hover",
            border: "1px solid",
            borderColor: "divider",
            marginBottom: 2.5,
          }}
        >
          <Typography variant="h6" gutterBottom color="primary">
            Спасибо! Ответ отправлен
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Мы получили ваше сообщение на почту и очень ждём встречи.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => setSubmitStatus("idle")}
          >
            Отправить ещё один ответ
          </Button>
        </Box>
      </>
    );
  }

  return (
    <FormProvider {...methods}>
      <Box
        component="form"
        noValidate
        sx={{ width: "100%", textAlign: "left" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (activeStep === 4) {
            handleSubmit(onSubmit)();
          } else {
            goNext();
          }
        }}
      >
        <Stepper activeStep={activeStep} orientation="vertical">
          {RSVP_STEP_LABELS.map((label, index) => (
            <Step key={label} completed={stepCompleted(index)}>
              <StepLabel
                optional={
                  index === 2 && attendance === "no" ? (
                    <Typography variant="caption" color="text.secondary">
                      не требуется
                    </Typography>
                  ) : index === 2 && attendance === "yes" ? (
                    "по желанию"
                  ) : index === 3 && attendance === "no" ? (
                    <Typography variant="caption" color="text.secondary">
                      не требуется
                    </Typography>
                  ) : index === 4 ? (
                    "необязательно"
                  ) : undefined
                }
              >
                <Typography variant="subtitle2" component="span">
                  {label}
                </Typography>
              </StepLabel>
              <StepContent>
                {index === 0 && <StepName />}
                {index === 1 && (
                  <StepPresence
                    onAttendancePick={(v, prev) => {
                      if (v === "no" && activeStep > 1) {
                        setActiveStep(1);
                      }
                      if (v === "yes" && prev === "no") {
                        setValue("alcohol", []);
                        setValue("meal", "");
                        setValue("wishes", "");
                      }
                    }}
                  />
                )}
                {index === 2 &&
                  (attendance === "yes" ? (
                    <StepAlcohol />
                  ) : attendance === "no" ? (
                    <SkippedStepHint>
                      Этот шаг не нужен — вы отметили, что не сможете прийти.
                    </SkippedStepHint>
                  ) : null)}
                {index === 3 &&
                  (attendance === "yes" ? (
                    <StepMeals />
                  ) : attendance === "no" ? (
                    <SkippedStepHint>
                      Этот шаг не нужен — вы отметили, что не сможете прийти.
                    </SkippedStepHint>
                  ) : null)}
                {index === 4 && <StepWishes />}
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Box
          sx={{
            mt: { xs: 1.5, sm: 2 },
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "center",
          }}
        >
          {activeStep === 0 && (
            <Button type="submit" variant="contained">
              Далее
            </Button>
          )}

          {activeStep === 1 && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Далее
              </Button>
            </>
          )}

          {activeStep === 2 && attendance === "yes" && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Далее
              </Button>
            </>
          )}

          {activeStep === 3 && attendance === "yes" && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Далее
              </Button>
            </>
          )}

          {activeStep === 4 && (
            <>
              <Button onClick={goBack} disabled={isSubmitting}>
                Назад
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                loading={isSubmitting}
                endIcon={<SendIcon />}
                sx={{ boxShadow: 2, px: 3 }}
              >
                Отправить ответ
              </Button>
            </>
          )}
        </Box>

        {submitStatus === "error" && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            Не удалось отправить ответ. Попробуйте чуть позже или напишите нам
            на почту.
          </Typography>
        )}

        <Divider sx={{ my: { xs: 2, sm: 3 }, borderColor: "divider" }} />

        <Box
          sx={{
            p: { xs: 1.5, sm: 2.25 },
            mb: { xs: 2.5, sm: 3 },
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.02)",
          }}
        >
          <Typography
            variant="overline"
            sx={{
              display: "block",
              letterSpacing: "0.12em",
              color: "text.secondary",
              mb: 1.5,
              fontWeight: 600,
            }}
          >
            Как устроена анкета
          </Typography>
          <Stack
            spacing={1.25}
            component="ul"
            sx={{ m: 0, pl: 2.25, listStyle: "disc" }}
          >
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              <strong style={{ color: "inherit", fontWeight: 600 }}>
                Обязательно:
              </strong>{" "}
              имя и фамилия, ответ о присутствии.
            </Typography>
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              Если отмечаете, что{" "}
              <strong style={{ fontWeight: 600 }}>придёте</strong>, на шаге с
              горячим блюдом нужно выбрать{" "}
              <strong style={{ fontWeight: 600 }}>мясо или рыбу</strong> — без
              этого отправка не завершится.
            </Typography>
            <Typography
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ display: "list-item" }}
            >
              Напитки — по желанию. Блок{" "}
              <strong style={{ fontWeight: 600 }}>
                «Пожелания для организаторов»
              </strong>{" "}
              в конце можно не заполнять — там по желанию аллергии, детали и
              тёплое слово.
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: { xs: 1.5, sm: 2 },
              pt: { xs: 1.5, sm: 2 },
              borderTop: "1px solid",
              borderColor: "divider",
              lineHeight: 1.6,
            }}
          >
            После отправки ваш ответ приходит{" "}
            <strong>на почту организаторам</strong> — мы храним данные только
            для подготовки праздника.
          </Typography>
        </Box>
      </Box>
    </FormProvider>
  );
}


/** Вертикальный степпер в духе MUI + react-hook-form + EmailJS */
export function WeddingRsvpStepper() {
  return (
    <RsvpMuiThemeProvider>
      <Box
        sx={{
          maxWidth: 560,
          mx: "auto",
          px: { xs: 0, sm: 1 },
          pt: { xs: 0.5, sm: 2 },
        }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          component="h3"
          sx={{
            display: "block",
            textAlign: "center",
            letterSpacing: { xs: "0.22em", sm: "0.28em" },
            fontSize: { xs: "0.7rem", sm: "0.75rem" },
            fontWeight: 600,
            textTransform: "uppercase",
            mb: { xs: 2, sm: 3.5 },
            mt: 0,
            opacity: 0.92,
          }}
        >
          Вопросы для гостей
        </Typography>
        <RsvpStepperInner />
      </Box>
    </RsvpMuiThemeProvider>
  );
}

export default WeddingRsvpStepper;
