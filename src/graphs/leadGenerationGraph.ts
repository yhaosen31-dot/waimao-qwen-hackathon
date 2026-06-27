import { END, START, StateGraph } from "@langchain/langgraph";
import {
  createInitialLeadGenerationState,
  LeadGenerationAnnotation,
  type LeadGenerationState
} from "@/graphs/state";
import { normalizeInput } from "@/graphs/nodes/normalizeInput";
import { generateKeywords } from "@/graphs/nodes/generateKeywords";
import { humanApproveKeywords } from "@/graphs/nodes/humanApproveKeywords";
import { searchCrossBorderImporters } from "@/graphs/nodes/searchCrossBorderImporters";
import { extractCompanyDetails } from "@/graphs/nodes/extractCompanyDetails";
import { discoverWebsite } from "@/graphs/nodes/discoverWebsite";
import { searchEmailsByDomain } from "@/graphs/nodes/searchEmailsByDomain";
import { discoverWhatsappAndContacts } from "@/graphs/nodes/discoverWhatsappAndContacts";
import { scoreBuyerFit } from "@/graphs/nodes/scoreBuyerFit";
import { generateEmailDraft } from "@/graphs/nodes/generateEmailDraft";
import { humanApproveEmail } from "@/graphs/nodes/humanApproveEmail";
import { saveToCrm } from "@/graphs/nodes/saveToCrm";

export function createLeadGenerationGraph() {
  return new StateGraph(LeadGenerationAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("generateKeywords", generateKeywords)
    .addNode("humanApproveKeywords", humanApproveKeywords)
    .addNode("searchCrossBorderImporters", searchCrossBorderImporters)
    .addNode("extractCompanyDetails", extractCompanyDetails)
    .addNode("discoverWebsite", discoverWebsite)
    .addNode("searchEmailsByDomain", searchEmailsByDomain)
    .addNode("discoverWhatsappAndContacts", discoverWhatsappAndContacts)
    .addNode("scoreBuyerFit", scoreBuyerFit)
    .addNode("generateEmailDraft", generateEmailDraft)
    .addNode("humanApproveEmail", humanApproveEmail)
    .addNode("saveToCrm", saveToCrm)
    .addEdge(START, "normalizeInput")
    .addEdge("normalizeInput", "generateKeywords")
    .addEdge("generateKeywords", "humanApproveKeywords")
    .addConditionalEdges("humanApproveKeywords", routeAfterKeywordApproval)
    .addEdge("searchCrossBorderImporters", "extractCompanyDetails")
    .addEdge("extractCompanyDetails", "discoverWebsite")
    .addEdge("discoverWebsite", "searchEmailsByDomain")
    .addEdge("searchEmailsByDomain", "discoverWhatsappAndContacts")
    .addEdge("discoverWhatsappAndContacts", "scoreBuyerFit")
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
}) {
  const graph = createLeadGenerationGraph();

  return graph.invoke(createInitialLeadGenerationState(input));
}

export async function runLeadGenerationGraphFromState(state: LeadGenerationState) {
  const graph = createLeadGenerationGraph();

  return graph.invoke(state);
}

function routeAfterKeywordApproval(state: LeadGenerationState) {
  return state.approvedKeywords.length > 0 ? "searchCrossBorderImporters" : END;
}

function routeAfterEmailApproval(state: LeadGenerationState) {
  const allDraftsReviewed =
    state.emailDrafts.length > 0 &&
    state.emailDrafts.every((draft) => draft.status === "approved" || draft.status === "skipped");

  return allDraftsReviewed ? "saveToCrm" : END;
}
