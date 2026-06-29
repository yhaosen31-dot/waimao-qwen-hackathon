import { END, START, StateGraph } from "@langchain/langgraph";
import {
  createInitialLeadGenerationState,
  LeadGenerationAnnotation,
  type LeadGenerationState,
  type SearchProviderPreference
} from "@/graphs/state";
import type { SearchMode } from "@/types";
import { normalizeInput } from "@/graphs/nodes/normalizeInput";
import { generateKeywords } from "@/graphs/nodes/generateKeywords";
import { humanApproveKeywords } from "@/graphs/nodes/humanApproveKeywords";
import { searchCustomersByProduct } from "@/graphs/nodes/searchCustomersByProduct";
import { extractCompanyDetails } from "@/graphs/nodes/extractCompanyDetails";
import { enrichCompanies } from "@/graphs/nodes/enrichCompanies";
import { discoverWebsite } from "@/graphs/nodes/discoverWebsite";
import { discoverContacts } from "@/graphs/nodes/discoverContacts";
import { mergeEvidence } from "@/graphs/nodes/mergeEvidence";
import { scoreBuyerFit } from "@/graphs/nodes/scoreBuyerFit";
import { generateEmailDraft } from "@/graphs/nodes/generateEmailDraft";
import { humanApproveEmail } from "@/graphs/nodes/humanApproveEmail";
import { saveToCrm } from "@/graphs/nodes/saveToCrm";

export function createLeadGenerationGraph() {
  return new StateGraph(LeadGenerationAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("generateKeywords", generateKeywords)
    .addNode("humanApproveKeywords", humanApproveKeywords)
    .addNode("searchCustomersByProduct", searchCustomersByProduct)
    .addNode("extractCompanyDetails", extractCompanyDetails)
    .addNode("enrichCompanies", enrichCompanies)
    .addNode("discoverWebsite", discoverWebsite)
    .addNode("discoverContacts", discoverContacts)
    .addNode("mergeEvidence", mergeEvidence)
    .addNode("scoreBuyerFit", scoreBuyerFit)
    .addNode("generateEmailDraft", generateEmailDraft)
    .addNode("humanApproveEmail", humanApproveEmail)
    .addNode("saveToCrm", saveToCrm)
    .addEdge(START, "normalizeInput")
    .addEdge("normalizeInput", "generateKeywords")
    .addEdge("generateKeywords", "humanApproveKeywords")
    .addConditionalEdges("humanApproveKeywords", routeAfterKeywordApproval)
    .addEdge("searchCustomersByProduct", "extractCompanyDetails")
    .addEdge("extractCompanyDetails", "enrichCompanies")
    .addEdge("enrichCompanies", "discoverWebsite")
    .addEdge("discoverWebsite", "discoverContacts")
    .addEdge("discoverContacts", "mergeEvidence")
    .addEdge("mergeEvidence", "scoreBuyerFit")
    .addEdge("scoreBuyerFit", "generateEmailDraft")
    .addEdge("generateEmailDraft", "humanApproveEmail")
    .addConditionalEdges("humanApproveEmail", routeAfterEmailApproval)
    .addEdge("saveToCrm", END)
    .compile({
      name: "lead-generation-mock-workflow"
    });
}

export async function runLeadGenerationGraph(input: {
  runId: string;
  productInput: string;
  targetCount: number;
  targetCountries?: string[];
  excludedCountries?: string[];
  searchMode?: SearchMode;
  providerPriority?: SearchProviderPreference[];
}) {
  const graph = createLeadGenerationGraph();

  return graph.invoke(createInitialLeadGenerationState(input));
}

export async function runLeadGenerationGraphFromState(state: LeadGenerationState) {
  const graph = createLeadGenerationGraph();

  return graph.invoke(state);
}

function routeAfterKeywordApproval(state: LeadGenerationState) {
  return state.approvedKeywords.length > 0 ? "searchCustomersByProduct" : END;
}

function routeAfterEmailApproval(state: LeadGenerationState) {
  const allDraftsReviewed =
    state.emailDrafts.length > 0 &&
    state.emailDrafts.every((draft) => draft.status === "approved" || draft.status === "skipped");

  return allDraftsReviewed ? "saveToCrm" : END;
}
