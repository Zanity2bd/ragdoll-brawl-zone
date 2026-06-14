import { useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";

type Tab = "audio" | "keyboard" | "xbox" | "playstation";

export function SettingsPanel({
  open, onClose,
  muted, onToggleMute,
  sfxVol, musicVol,
  onSfx, onMusic,
}: {
  open: boolean; onClose: () => void;
  muted: boolean; onToggleMute: () => void;
  sfxVol: number; musicVol: number;
  onSfx: (v: number) => void; onMusic: (v: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("audio");
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
         style={{ background: "radial-gradient(circle at 50% 40%, oklch(0.18 0.04 270 / 0.65), oklch(0.04 0.02 270 / 0.92))", backdropFilter: "blur(14px)" }}
         onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-lg overflow-hidden border"
        style={{
          borderColor: "oklch(0.55 0.22 280 / 0.45)",
          background: "linear-gradient(160deg, oklch(0.14 0.04 275 / 0.96), oklch(0.08 0.03 270 / 0.98))",
          boxShadow: "0 30px 80px -20px oklch(0.55 0.22 280 / 0.55), inset 0 1px 0 oklch(0.95 0.05 280 / 0.12)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b" style={{ borderColor: "oklch(0.45 0.10 280 / 0.25)" }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 rounded-full" style={{ background: "linear-gradient(180deg, oklch(0.85 0.20 320), oklch(0.65 0.22 270))" }} />
            <h2 className="font-mono text-sm uppercase tracking-[0.25em]" style={{ color: "oklch(0.92 0.06 280)" }}>Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center text-foreground/70 hover:text-foreground"
            style={{ background: "oklch(0.20 0.05 280 / 0.6)", border: "1px solid oklch(0.45 0.10 280 / 0.4)" }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b overflow-x-auto" style={{ borderColor: "oklch(0.45 0.10 280 / 0.18)" }}>
          {([
            ["audio", "Audio"],
            ["keyboard", "Keyboard"],
            ["xbox", "Xbox"],
            ["playstation", "PS4 / PS5"],
          ] as const).map(([id, label]) => (
            <button key={id}
              onClick={() => setTab(id)}
              className="px-3 py-2 rounded-md font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors"
              style={tab === id ? {
                background: "linear-gradient(135deg, oklch(0.55 0.22 320 / 0.6), oklch(0.45 0.22 270 / 0.6))",
                color: "oklch(0.98 0.04 280)",
                boxShadow: "inset 0 1px 0 oklch(0.95 0.05 280 / 0.3), 0 4px 14px oklch(0.55 0.22 290 / 0.35)",
              } : {
                color: "oklch(0.7 0.06 280)",
                background: "oklch(0.18 0.03 275 / 0.5)",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto">
          {tab === "audio" && (
            <div className="space-y-4">
              <button
                onClick={onToggleMute}
                className="w-full px-3 py-3 rounded-md font-mono text-xs uppercase tracking-widest"
                style={{
                  background: muted
                    ? "linear-gradient(135deg, oklch(0.30 0.08 30 / 0.6), oklch(0.20 0.04 30 / 0.6))"
                    : "linear-gradient(135deg, oklch(0.45 0.20 280 / 0.5), oklch(0.35 0.18 290 / 0.5))",
                  color: "oklch(0.95 0.04 280)",
                  border: "1px solid oklch(0.55 0.18 280 / 0.4)",
                  boxShadow: "inset 0 1px 0 oklch(0.95 0.05 280 / 0.2)",
                }}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {muted ? <VolumeX size={16} strokeWidth={2.4} /> : <Volume2 size={16} strokeWidth={2.4} />}
                  {muted ? "Audio Muted" : "Audio Enabled"}
                </span>
              </button>

              <Slider label="Sound Effects" value={sfxVol} onChange={onSfx} hue={310} />
              <Slider label="Music" value={musicVol} onChange={onMusic} hue={270} />
            </div>
          )}

          {tab === "keyboard" && (
            <ControlGrid rows={[
              ["Move", "A / D", "← / →"],
              ["Jump / Fly Up", "W", "↑"],
              ["Punch / Melee", "J", ";"],
              ["Fire / Beam", "F", "K"],
              ["Teleport", "G", "L"],
              ["Power 1 (HOLD)", "V", "—"],
              ["Power 2 (TAP)", "C", "—"],
              ["Rage Frenzy (Hulk)", "B", "N"],
            ]} headers={["Action", "Player 1", "Player 2"]} />
          )}

          {tab === "xbox" && (
            <ControlGrid rows={[
              ["Move", "Left Stick"],
              ["Aim / Fly", "Left Stick"],
              ["Jump", "A"],
              ["Punch / Melee", "X"],
              ["Fire / Beam", "RT"],
              ["Teleport", "RB"],
              ["Power 1 (HOLD)", "LB"],
              ["Power 2 (TAP)", "Y"],
              ["Rage Frenzy", "LT"],
              ["Settings", "Menu (☰)"],
            ]} headers={["Action", "Xbox Controller"]} />
          )}

          {tab === "playstation" && (
            <ControlGrid rows={[
              ["Move", "Left Stick"],
              ["Aim / Fly", "Left Stick"],
              ["Jump", "✕ (Cross)"],
              ["Punch / Melee", "□ (Square)"],
              ["Fire / Beam", "R2"],
              ["Teleport", "R1"],
              ["Power 1 (HOLD)", "L1"],
              ["Power 2 (TAP)", "△ (Triangle)"],
              ["Rage Frenzy", "L2"],
              ["Settings", "Options"],
            ]} headers={["Action", "PS4 / PS5 Controller"]} />
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, hue }: { label: string; value: number; onChange: (v: number) => void; hue: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: `oklch(0.85 0.08 ${hue})` }}>{label}</span>
        <span className="font-mono text-[10px] text-foreground/60">{Math.round(value * 100)}</span>
      </div>
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden pointer-events-none"
          style={{ background: "oklch(0.18 0.03 275 / 0.8)", border: "1px solid oklch(0.4 0.08 280 / 0.3)" }}>
          <div className="absolute inset-y-0 left-0"
            style={{
              width: `${value * 100}%`,
              background: `linear-gradient(90deg, oklch(0.55 0.22 ${hue}), oklch(0.75 0.20 ${hue + 30}))`,
              boxShadow: `0 0 12px oklch(0.65 0.22 ${hue})`,
            }} />
        </div>
        <input type="range" min={0} max={100} value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function ControlGrid({ rows, headers }: { rows: string[][]; headers: string[] }) {
  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: "oklch(0.4 0.08 280 / 0.3)" }}>
      <div className="grid font-mono text-[10px] uppercase tracking-widest px-3 py-2"
        style={{
          gridTemplateColumns: `1.4fr ${headers.slice(1).map(() => "1fr").join(" ")}`,
          background: "linear-gradient(135deg, oklch(0.30 0.10 285 / 0.7), oklch(0.20 0.06 280 / 0.7))",
          color: "oklch(0.85 0.06 290)",
        }}
      >
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={i}
            className="grid items-center px-3 py-2.5 font-mono text-xs"
            style={{
              gridTemplateColumns: `1.4fr ${r.slice(1).map(() => "1fr").join(" ")}`,
              background: i % 2 ? "oklch(0.10 0.03 275 / 0.6)" : "oklch(0.14 0.03 275 / 0.4)",
              color: "oklch(0.92 0.04 280)",
              borderTop: i === 0 ? "none" : "1px solid oklch(0.35 0.08 280 / 0.2)",
            }}
          >
            <div className="text-foreground/85">{r[0]}</div>
            {r.slice(1).map((c, j) => (
              <div key={j}>
                <KeyChip>{c}</KeyChip>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyChip({ children }: { children: React.ReactNode }) {
  if (children === "—") return <span className="text-foreground/30">—</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-widest"
      style={{
        background: "linear-gradient(180deg, oklch(0.30 0.10 285 / 0.7), oklch(0.18 0.06 275 / 0.85))",
        border: "1px solid oklch(0.55 0.18 285 / 0.45)",
        color: "oklch(0.95 0.06 290)",
        boxShadow: "inset 0 1px 0 oklch(0.95 0.10 290 / 0.18), 0 1px 2px oklch(0 0 0 / 0.4)",
      }}
    >{children}</span>
  );
}
