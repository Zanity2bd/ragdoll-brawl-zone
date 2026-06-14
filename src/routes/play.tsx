import { createFileRoute, Link } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";
import { Home } from "lucide-react";

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
        className="absolute z-40 inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/35 hover:text-foreground/85 hover:bg-foreground/10 transition-colors"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <Home size={15} strokeWidth={2.25} />
      </Link>
    </div>
  );
}
