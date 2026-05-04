import { createFileRoute, Link } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";

export const Route = createFileRoute("/play")({
  component: PlayPage,
  head: () => ({
    meta: [
      { title: "OgunArena — Fight" },
      { name: "description", content: "OgunArena: offline 1v1 stickman fighting arena. Two players, one device. A Blkdom production." },
    ],
  }),
});

function PlayPage() {
  return (
    <div
      className="fixed inset-0 bg-background overflow-hidden overscroll-none touch-none"
      style={{ width: "100dvw", height: "100dvh" }}
    >
      <GameCanvas />
      <Link
        to="/"
        aria-label="Home"
        className="absolute z-40 font-mono text-[10px] tracking-widest uppercase text-foreground/30 hover:text-foreground/80 transition-colors"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        ◇
      </Link>
    </div>
  );
}
