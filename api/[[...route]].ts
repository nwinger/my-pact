import { handle } from 'hono/vercel';

import { app } from '../server/app';

export default handle(app);
