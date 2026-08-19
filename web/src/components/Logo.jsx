import clsx from 'clsx';
import { useBranding } from '../context/BrandingContext';

/**
 * The company mark.
 *
 * No artwork ships with the app — a Super Admin uploads the logo in Settings
 * and every screen picks it up at once. Until one is uploaded the monogram
 * stands in, so nothing ever renders as a hole or a broken image.
 *
 * An uploaded logo sits on a white tile rather than straight on the page: the
 * office's artwork is its own colour, and that keeps it legible on the black
 * slab and in dark mode alike.
 */
export function LogoMark({ size = 40, className }) {
  const { logo } = useBranding();

  if (!logo) {
    return (
      <span
        className={clsx(
          'grid shrink-0 place-items-center rounded-xl bg-black font-display font-bold text-white shadow-lift dark:bg-white dark:text-black',
          className
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      >
        F
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-lift ring-1 ring-black/5',
        className
      )}
      style={{ width: size, height: size }}
    >
      <img src={logo} alt="Company logo" className="h-[78%] w-[78%] object-contain" />
    </span>
  );
}

export default LogoMark;
