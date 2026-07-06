import { Router } from "express";
import { GithubService } from "../services/githubService.js";
import { parseGithubPushRequest } from "../utils/validation.js";

export function createGithubRouter(githubService: GithubService): Router {
  const router = Router();

  router.post("/github/push", async (req, res) => {
    const parsedRequest = parseGithubPushRequest(req.body);

    if (!parsedRequest) {
      res.status(400).json({ message: "GitHub push request is invalid." });
      return;
    }

    try {
      const result = await githubService.pushFile(parsedRequest);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Could not push to GitHub." });
    }
  });

  return router;
}
