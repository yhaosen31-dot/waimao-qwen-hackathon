import { END, START, StateGraph } from "@langchain/langgraph";
import { nanoid } from "nanoid";
import type { CustomerLead, EmailDraft, WorkflowRunResult } from "@/lib/types";
import type { LeadGenerationProviders } from "@/server/integrations/types";
import { mockProviders } from "@/server/integrations/mock/providers";
import { LeadGenerationState, type LeadGenerationStateValue } from "@/server/workflows/lead-generation/state";
import { createInitialSteps, updateStep } from "@/server/workflows/lead-generation/steps";

export interface RunLeadGenerationInput {
  productName: string;
  targetCount: number;
  providers?: LeadGenerationProviders;
}

export async function runLeadGenerationWorkflow({
  productName,
  targetCount,
  providers = mockProviders
}: RunLeadGenerationInput): Promise<WorkflowRunResult> {
  const taskId = `task_${nanoid(10)}`;
  const graph = createLeadGenerationGraph(providers);
  const now = new Date().toISOString();

  const finalState = await graph.invoke({
    taskId,
    productInput: productName,
    targetCount,
    steps: createInitialSteps()
  });

  const task = {
    id: taskId,
    productInput: productName,
    normalizedProduct: finalState.normalized?.normalizedProduct ?? productName,
    targetCount,
    status: "awaiting_review" as const,
    keywordReviewStatus: "pending" as const,
    emailReviewStatus: "pending" as const,
    keywords: finalState.keywords,
    steps: finalState.steps,
    customerIds: finalState.customers.map((customer) => customer.id),
    draftIds: finalState.drafts.map((draft) => draft.id),
    createdAt: now,
    updatedAt: now
  };

  return {
    task,
    customers: finalState.customers,
    drafts: finalState.drafts
  };
}

function createLeadGenerationGraph(providers: LeadGenerationProviders) {
  return new StateGraph(LeadGenerationState)
    .addNode("normalize_input", async (state) => {
      const normalized = await providers.normalizer.normalize(state.productInput);

      return {
        normalized,
        steps: updateStep(
          state.steps,
          "normalize_input",
          "completed",
          `Normalized to "${normalized.normalizedProduct}".`
        )
      };
    })
    .addNode("generate_keywords", async (state) => {
      if (!state.normalized) throw new Error("Missing normalized product before keyword generation.");
      const keywords = await providers.keywordProvider.generateKeywords(state.normalized);

      return {
        keywords,
        steps: updateStep(
          state.steps,
          "generate_keywords",
          "completed",
          `Generated ${keywords.length} English keywords.`
        )
      };
    })
    .addNode("human_confirm_keywords", async (state) => ({
      steps: updateStep(
        state.steps,
        "human_confirm_keywords",
        "completed",
        "Mock gate passed; keyword approval remains available in the review UI."
      )
    }))
    .addNode("search_importers", async (state) => {
      const rawImporters = await providers.importerSearch.searchImporters(
        state.keywords,
        state.targetCount
      );

      return {
        rawImporters,
        steps: updateStep(
          state.steps,
          "search_importers",
          "completed",
          `Found ${rawImporters.length} product-search seed candidates.`
        )
      };
    })
    .addNode("extract_company_details", async (state) => {
      const companies = await providers.companyEnrichment.extractDetails(state.rawImporters);
      const withWebsites = companies.filter((company) => company.website).length;

      return {
        companies,
        steps: updateStep(
          state.steps,
          "extract_company_details",
          "completed",
          `Extracted details; ${withWebsites}/${companies.length} had websites immediately.`
        )
      };
    })
    .addNode("resolve_missing_websites", async (state) => {
      const missingBefore = state.companies.filter((company) => !company.website).length;
      const companies = await providers.websiteResolver.resolveMissingWebsites(state.companies);

      return {
        companies,
        steps: updateStep(
          state.steps,
          "resolve_missing_websites",
          "completed",
          `Resolved ${missingBefore} missing websites with the search provider router.`
        )
      };
    })
    .addNode("find_emails", async (state) => {
      const emailsByDomain = Object.fromEntries(
        await Promise.all(
          state.companies.map(async (company) => [
            company.domain,
            await providers.emailFinder.findEmails(company)
          ])
        )
      );

      return {
        emailsByDomain,
        steps: updateStep(
          state.steps,
          "find_emails",
          "completed",
          `Generated email candidates for ${Object.keys(emailsByDomain).length} domains.`
        )
      };
    })
    .addNode("enrich_contacts", async (state) => {
      const contactsByDomain = Object.fromEntries(
        await Promise.all(
          state.companies.map(async (company) => [
            company.domain,
            await providers.contactIntel.enrichContact(company)
          ])
        )
      );

      return {
        contactsByDomain,
        steps: updateStep(
          state.steps,
          "enrich_contacts",
          "completed",
          "Mock EXA/Tavily/YOU search enriched WhatsApp, phone, and contact names."
        )
      };
    })
    .addNode("score_buyer_fit", async (state) => {
      const scoresByDomain = Object.fromEntries(
        await Promise.all(
          state.companies.map(async (company) => [
            company.domain,
            await providers.buyerFitScorer.score(company, state.keywords)
          ])
        )
      );
      const customers = buildCustomers(state, scoresByDomain);

      return {
        scoresByDomain,
        customers,
        steps: updateStep(
          state.steps,
          "score_buyer_fit",
          "completed",
          `Scored ${customers.length} buyer profiles.`
        )
      };
    })
    .addNode("generate_email_drafts", async (state) => {
      if (!state.normalized) throw new Error("Missing normalized product before draft generation.");

      const drafts: EmailDraft[] = await Promise.all(
        state.customers.map(async (customer) => {
          const draft = await providers.mailDraftProvider.createDraft({
            customer,
            normalizedProduct: state.normalized?.normalizedProduct ?? state.productInput,
            keywords: state.keywords
          });
          const now = new Date().toISOString();

          return {
            ...draft,
            id: `draft_${nanoid(10)}`,
            taskId: state.taskId,
            customerId: customer.id,
            to: customer.emails[0]?.address ?? `procurement@${customer.domain}`,
            createdAt: now,
            updatedAt: now
          };
        })
      );

      return {
        drafts,
        steps: updateStep(
          state.steps,
          "generate_email_drafts",
          "completed",
          `Generated ${drafts.length} personalized draft emails.`
        )
      };
    })
    .addNode("human_confirm_email", async (state) => ({
      steps: updateStep(
        state.steps,
        "human_confirm_email",
        "completed",
        "Mock gate passed; email approval remains available in the review UI."
      )
    }))
    .addNode("save_email_drafts", async (state) => {
      const drafts = await Promise.all(
        state.drafts.map((draft) => providers.mailSender.saveDraft(draft))
      );

      return {
        drafts,
        steps: updateStep(
          state.steps,
          "save_email_drafts",
          "completed",
          "Saved as local drafts only; no real email was sent."
        )
      };
    })
    .addNode("save_to_crm", async (state) => ({
      steps: updateStep(
        state.steps,
        "save_to_crm",
        "completed",
        `Prepared ${state.customers.length} customers for the local JSON CRM.`
      )
    }))
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "generate_keywords")
    .addEdge("generate_keywords", "human_confirm_keywords")
    .addEdge("human_confirm_keywords", "search_importers")
    .addEdge("search_importers", "extract_company_details")
    .addEdge("extract_company_details", "resolve_missing_websites")
    .addEdge("resolve_missing_websites", "find_emails")
    .addEdge("find_emails", "enrich_contacts")
    .addEdge("enrich_contacts", "score_buyer_fit")
    .addEdge("score_buyer_fit", "generate_email_drafts")
    .addEdge("generate_email_drafts", "human_confirm_email")
    .addEdge("human_confirm_email", "save_email_drafts")
    .addEdge("save_email_drafts", "save_to_crm")
    .addEdge("save_to_crm", END)
    .compile();
}

function buildCustomers(
  state: LeadGenerationStateValue,
  scoresByDomain: LeadGenerationStateValue["scoresByDomain"]
): CustomerLead[] {
  const now = new Date().toISOString();

  return state.companies.map((company) => {
    const contact = state.contactsByDomain[company.domain];
    const score = scoresByDomain[company.domain];

    return {
      id: `customer_${nanoid(10)}`,
      taskId: state.taskId,
      companyName: company.companyName,
      country: company.country,
      city: company.city,
      website: company.website,
      domain: company.domain,
      emails: state.emailsByDomain[company.domain] ?? [],
      whatsapp: contact?.whatsapp ?? "",
      phone: contact?.phone ?? "",
      contactName: contact?.contactName ?? "Procurement Team",
      contactTitle: contact?.contactTitle ?? "Purchasing Manager",
      products: company.products,
      importerProfile: company.importerProfile,
      annualImportEstimate: company.annualImportEstimate,
      buyerFitScore: score?.score ?? 60,
      scoreReasons: score?.reasons ?? ["Mock score generated from product overlap."],
      source: company.source,
      createdAt: now,
      updatedAt: now
    };
  });
}
