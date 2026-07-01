import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleGradeSession, withCors } from "../modules/essay-grading/dist/api/handlers.js";

export default withCors(async (req: VercelRequest, res: VercelResponse) => {
  await handleGradeSession(req, res);
});
