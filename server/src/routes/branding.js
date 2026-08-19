import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();

/**
 * The company logo, uploaded by a Super Admin and shown everywhere.
 *
 * It is stored as a data URL in the settings table rather than as a file. A
 * file would need a writable volume that survives every redeploy, which
 * managed hosting does not give us for free — a row does.
 */
const LOGO_KEY = 'branding.logo';

/** Public on purpose: the sign-in screen shows the logo before anyone signs in. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const row = await prisma.setting.findUnique({ where: { key: LOGO_KEY } });
    res.json({ logo: row?.value || null });
  })
);

// Comfortably inside the 1 MB JSON body limit. The browser shrinks the image
// before it ever gets here, so a normal logo lands far below this.
const MAX_CHARS = 700_000;

router.put(
  '/',
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { logo } = z.object({ logo: z.string().nullable() }).parse(req.body);

    if (logo !== null) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(logo)) {
        throw new HttpError(400, 'Upload a PNG, JPG or WebP image');
      }
      if (logo.length > MAX_CHARS) {
        throw new HttpError(400, 'That image is too large — try a smaller one');
      }
    }

    if (logo === null) {
      await prisma.setting.deleteMany({ where: { key: LOGO_KEY } });
    } else {
      await prisma.setting.upsert({
        where: { key: LOGO_KEY },
        create: { key: LOGO_KEY, value: logo },
        update: { value: logo },
      });
    }

    // The image itself never goes into the log — only the fact that it changed.
    await logAudit(
      req.user,
      AUDIT.BRANDING_UPDATED,
      'Setting',
      LOGO_KEY,
      logo ? 'Updated the company logo' : 'Removed the company logo'
    );

    res.json({ logo });
  })
);

export default router;
