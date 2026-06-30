import path from "node:path";

export function resolveLocalDataDir() {
  const configured =
    process.env.LOCAL_DATA_DIR?.trim() || process.env.WAIMAO_DATA_DIR?.trim();

  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}
