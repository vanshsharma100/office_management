import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const BrandingContext = createContext({ logo: null, setLogo: () => {} });

/**
 * The company logo, fetched once for the whole app.
 *
 * This sits outside AuthProvider on purpose: the sign-in screen has to show
 * the logo before anyone has signed in, so the endpoint behind it is public.
 * A failure here is swallowed — a missing logo must never block sign-in.
 */
export function BrandingProvider({ children }) {
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/branding')
      .then((r) => alive && setLogo(r.data.logo || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The browser tab follows the same logo, so a rebranded install looks right
  // in the tab strip too.
  useEffect(() => {
    if (!logo) return;
    const link = document.querySelector("link[rel='icon']");
    if (link) link.href = logo;
  }, [logo]);

  return <BrandingContext.Provider value={{ logo, setLogo }}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);

/**
 * A picked file, shrunk to something small enough to live in one settings row.
 * PNG out, because a logo needs its transparent background.
 */
export function fileToLogoDataUrl(file, max = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
