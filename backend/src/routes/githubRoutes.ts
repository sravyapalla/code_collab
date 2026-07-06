import { Router } from "express";
import { GithubService } from "../services/githubService.js";
import { parseGithubConnectionRequest, parseGithubPushRequest } from "../utils/validation.js";

export function createGithubRouter(githubService: GithubService): Router {
  const router = Router();

  router.post("/github/test", async (req, res) => {
    const parsedRequest = parseGithubConnectionRequest(req.body);

    if (!parsedRequest) {
      res.status(400).json({ message: "GitHub connection request is invalid." });
      return;
    }

    try {
      const result = await githubService.testConnection(parsedRequest);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Could not connect to GitHub." });
    }
  });

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
