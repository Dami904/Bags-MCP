import { createApp } from "./app.js";

export async function startHttpServer() {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`BagsMCP HTTP server running on port ${port}`));
}
