export async function searchCrossBorderImporters(): Promise<never> {
  throw new Error(
    "Legacy cross-search workflow node is disabled because account risk control was detected."
  );
}
