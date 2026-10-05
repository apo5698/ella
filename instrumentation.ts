export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSceneHeatWorker } = await import("./lib/sceneHeat");
    startSceneHeatWorker();
  }
}
