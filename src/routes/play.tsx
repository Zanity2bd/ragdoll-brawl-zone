import { createFileRoute, Link } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";

export const Route = createFileRoute("/play")({
  component: PlayPage,
  head: () => ({
    meta: [
      { title: "Stickman Neon Duel — Fight" },
      { name: "description", content: "Offline 1v1 stickman fighting arena. Two players, one device." },
    ],
  }),
});

function PlayPage() {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <GameCanvas />
      <Link
        to="/"
        className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest uppercase text-foreground/40 hover:text-foreground/80 transition-colors"
      >
        ◇ Stickman Neon Duel ◇
      </Link>
    </div>
  );
}
