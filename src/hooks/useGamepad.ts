import { useEffect, useRef } from "react";
import type { GameEngine, PlayerId } from "@/game/engine";

/**
 * Polls the Gamepad API every animation frame and dispatches mapped actions
 * to the engine. Targets P1 by default. Mapping mirrors the reference shown
 * in Settings (Xbox face-button layout — PS controllers map by position).
 *
 * Buttons (standard mapping):
 *   0  A / ✕      — jump
 *   1  B / ○      — (reserved)
 *   2  X / □      — punch / melee
 *   3  Y / △      — power 2 (tap)
 *   4  LB / L1    — power 1 (hold)
 *   5  RB / R1    — teleport
 *   6  LT / L2    — rage frenzy
 *   7  RT / R2    — fire / beam
 *   9  Start/Menu — open settings (caller decides)
 */
export function useGamepad(
  engine: GameEngine | null,
  player: PlayerId,
  opts: { enabled: boolean; onMenu?: () => void },
) {
  const prevButtons = useRef<boolean[]>([]);
  const onMenuRef = useRef(opts.onMenu);
  useEffect(() => { onMenuRef.current = opts.onMenu; }, [opts.onMenu]);

  useEffect(() => {
    if (!engine || !opts.enabled) return;
    let raf = 0;
    const dead = 0.18;

    const tick = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads.find(p => p && p.connected) || null;
      if (gp) {
        // Sticks
        const lx = Math.abs(gp.axes[0]) > dead ? gp.axes[0] : 0;
        const ly = Math.abs(gp.axes[1]) > dead ? gp.axes[1] : 0;
        engine.setIntent(player, { left: lx < -0.4, right: lx > 0.4 });
        engine.setAirSteering(player, lx, ly);

        // D-pad fallback (buttons 12-15)
        const dpUp = gp.buttons[12]?.pressed;
        const dpDn = gp.buttons[13]?.pressed;
        const dpL  = gp.buttons[14]?.pressed;
        const dpR  = gp.buttons[15]?.pressed;
        if (dpL || dpR) engine.setIntent(player, { left: !!dpL, right: !!dpR });

        // Edge-trigger helper
        const press = (i: number, fn: () => void) => {
          const cur = !!gp.buttons[i]?.pressed;
          const prev = prevButtons.current[i] || false;
          if (cur && !prev) fn();
          prevButtons.current[i] = cur;
        };

        press(0, () => { engine.setIntent(player, { jump: true }); engine.pressJump(player); window.setTimeout(() => engine.setIntent(player, { jump: false }), 180); });
        if (dpUp) { engine.setIntent(player, { jump: true }); engine.pressJump(player); }
        press(2, () => engine.pressMelee(player));
        press(3, () => engine.pressPower2(player));
        press(4, () => engine.pressPower1(player));
        press(5, () => engine.pressTeleport(player));
        press(6, () => engine.pressFrenzy(player));
        press(7, () => engine.pressFire(player));
        press(9, () => onMenuRef.current?.());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, player, opts.enabled]);
}
