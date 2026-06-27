import { persistWorkflowResult, resetDb } from "../src/server/storage/json-store";
import { runLeadGenerationWorkflow } from "../src/server/workflows/lead-generation";

const productName = "diaphragm accumulator";
const targetCount = 20;

const result = await runLeadGenerationWorkflow({
  productName,
  targetCount
});

await resetDb();
await persistWorkflowResult(result);

console.log(
  `Seeded ${result.customers.length} mock customers and ${result.drafts.length} drafts for "${productName}".`
);
