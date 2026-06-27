import { Annotation } from "@langchain/langgraph";
import type { CustomerLead, EmailDraft, LeadEmail, WorkflowStep } from "@/lib/types";
import type {
  BuyerFitResult,
  CompanyDetails,
  ContactIntel,
  NormalizedProduct,
  RawImporterLead
} from "@/server/integrations/types";

export type EmailMap = Record<string, LeadEmail[]>;
export type ContactMap = Record<string, ContactIntel>;
export type ScoreMap = Record<string, BuyerFitResult>;

export const LeadGenerationState = Annotation.Root({
  taskId: Annotation<string>(),
  productInput: Annotation<string>(),
  targetCount: Annotation<number>(),
  normalized: Annotation<NormalizedProduct | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  keywords: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  rawImporters: Annotation<RawImporterLead[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  companies: Annotation<CompanyDetails[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  emailsByDomain: Annotation<EmailMap>({
    reducer: (_left, right) => right,
    default: () => ({})
  }),
  contactsByDomain: Annotation<ContactMap>({
    reducer: (_left, right) => right,
    default: () => ({})
  }),
  scoresByDomain: Annotation<ScoreMap>({
    reducer: (_left, right) => right,
    default: () => ({})
  }),
  customers: Annotation<CustomerLead[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  drafts: Annotation<EmailDraft[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  steps: Annotation<WorkflowStep[]>({
    reducer: (_left, right) => right,
    default: () => []
  })
});

export type LeadGenerationStateValue = typeof LeadGenerationState.State;
