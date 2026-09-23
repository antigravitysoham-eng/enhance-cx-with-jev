/**
 * router.js — the same API as an Express router, for mounting inside CXM-Tool.
 *
 * CXM-Tool already runs Express on port 5000. Two lines in its `server.js`:
 *
 *     import { jevRouter } from '../../Enhance-CX-with-Jev/src/server/router.js';
 *     app.use('/api/jev', jevRouter());
 *
 * Express is a peer here, not a dependency — this file never imports it, it
 * only returns handlers shaped the way Express expects. That keeps this package
 * dependency-free and means it cannot drag a second copy of Express into an app
 * that already has one.
 */

import { createApi, ROUTES } from './api.js';

/**
 * @param {object} options passed to createApi (provider, apiKey, dataset, …)
 * @returns an Express-compatible router-like object
 */
export function jevRouter(options = {}) {
  const api = createApi(options);

  // A minimal router object: Express accepts any function with (req, res, next).
  const handlers = new Map();
  for (const r of ROUTES) handlers.set(`${r.method} ${r.path}`, r.handler);

  const router = async function jevMiddleware(req, res, next) {
    // Express strips the mount path into req.url for mounted middleware.
    const path = (req.url.split('?')[0] || '/').replace(/\/$/, '') || '/';
    const key = `${req.method} ${path}`;
    const handlerName = handlers.get(key);
    if (!handlerName) return next?.();

    try {
      // `express.json()` should already have parsed the body upstream; if it
      // has not, an empty object is the right default for the GET routes.
      const out = await api[handlerName](req.body ?? {});
      res.status(200).json(out);
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error('[jev]', err);
      res.status(status).json({ error: err.message });
    }
  };

  router.api = api;
  router.routes = ROUTES;
  return router;
}

export default jevRouter;
