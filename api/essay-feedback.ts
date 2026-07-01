import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleEssayFeedback, withCors } from "../modules/essay-grading/dist/api/handlers.js";

export default withCors(async (req: VercelRequest, res: VercelResponse) => {
  await handleEssayFeedback(req, res);
});
