import logo from "@/assets/blkdom-logo.png";

export function BlkdomBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-7 w-7" : "h-5 w-5";
  const text = size === "md" ? "text-[11px]" : "text-[10px]";
  return (
    <a
      href="https://blkdom.com"
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-2 group min-h-11 px-2 rounded-full hover:bg-foreground/5 active:bg-foreground/10 transition-colors"
    >
      <img
        src={logo}
        alt="Blkdom"
        className={`${dim} rounded-md object-contain`}
        loading="lazy"
        decoding="async"
      />
      <span className={`font-mono ${text} tracking-[0.3em] uppercase text-foreground/60 group-hover:text-foreground/90`}>
        A Blkdom production
      </span>
    </a>
  );
}
