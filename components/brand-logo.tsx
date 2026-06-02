export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src="/masai-lens-logo.png"
      alt="Masai Lens"
      className={compact ? "h-14 w-auto object-contain" : "h-20 w-auto object-contain sm:h-24"}
    />
  );
}
